import { createHmac } from 'node:crypto';

export class ServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function getJson(fetcher, url, options) {
  let response;
  // Workers supports manual/follow, not error. Reject all non-success responses
  // below, including redirects, so credentials never follow an upstream redirect.
  try { response = await fetcher(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
  catch { throw new ServiceError(502, 'provider_unavailable', 'The provider is temporarily unavailable. Try again later.'); }
  if (!response.ok) throw new ServiceError(502, 'provider_unavailable', 'The provider could not complete this request.');
  // Do not reflect upstream errors, credentials, headers or signed URLs into logs.
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 256 * 1024) { await reader.cancel(); throw new ServiceError(502, 'provider_response', 'The provider returned an invalid response.'); }
    chunks.push(Buffer.from(part.value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ServiceError(502, 'provider_response', 'The provider returned an invalid response.'); }
}

export function signBunnyUrl(host, key, videoId, file, expires, directory = false) {
  if (!/^[a-z0-9-]+\.b-cdn\.net$/.test(host) || !key || !/^[a-f0-9-]{36}$/.test(videoId) || !/^[a-zA-Z0-9_.-]+$/.test(file)) throw new Error('Invalid Bunny signing configuration.');
  const path = `/${videoId}/${file}`;
  const scope = directory ? `/${videoId}/` : path;
  const signingData = directory ? `token_path=${scope}` : '';
  const signature = createHmac('sha256', key).update(scope + expires + signingData).digest('base64url');
  const token = `HS256-${signature}`;
  // Bunny's documented path format lets relative variant and segment URLs inherit
  // the directory token. A query token on just playlist.m3u8 does not protect HLS.
  return directory
    ? `https://${host}/bcdn_token=${token}&token_path=${encodeURIComponent(scope)}&expires=${expires}${path}`
    : `https://${host}${path}?token=${token}&expires=${expires}`;
}

export function bunnyAdapter(config, fetcher = fetch) {
  const configured = !!(config.bunnyKey && config.bunnyTokenKey && /^[1-9]\d*$/.test(config.bunnyLibrary || '') && /^[a-z0-9-]+\.b-cdn\.net$/.test(config.bunnyHost || '') && config.bunnyApproved);
  const cache = new Map();
  async function video(id) {
    if (!configured) throw new ServiceError(503, 'catalog_unconfigured', 'The licensed library is not connected yet.');
    const old = cache.get(id); if (old && old.until > Date.now()) return old.video;
    const data = await getJson(fetcher, `https://video.bunnycdn.com/library/${config.bunnyLibrary}/videos/${id}`, { headers: { AccessKey: config.bunnyKey } });
    if (data.guid?.toLowerCase() !== id || data.videoLibraryId !== Number(config.bunnyLibrary) || data.status !== 4 || typeof data.title !== 'string' || !Number.isFinite(data.length) || data.length <= 0) throw new ServiceError(502, 'video_unavailable', 'This video is not ready for playback.');
    const result = { title: data.title.slice(0, 240), duration: data.length };
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    cache.set(id, { until: Date.now() + 30000, video: result });
    return result;
  }
  return {
    configured, video,
    thumbnail: (id, expires) => signBunnyUrl(config.bunnyHost, config.bunnyTokenKey, id, 'thumbnail.jpg', expires),
    playback: (id, expires) => ({ type: 'hls', url: signBunnyUrl(config.bunnyHost, config.bunnyTokenKey, id, 'playlist.m3u8', expires, true), expiresAt: expires * 1000 })
  };
}

export function yotiAdapter(config, fetcher = fetch) {
  const configured = !!(config.yotiKey && config.yotiSdk);
  const headers = { Authorization: `Bearer ${config.yotiKey}`, 'Yoti-SDK-Id': config.yotiSdk, 'Content-Type': 'application/json' };
  return {
    configured,
    async start(reference) {
      if (!configured) throw new ServiceError(503, 'age_unconfigured', 'Age verification is not connected yet.');
      const callback = `${config.portalOrigin}/333/`;
      const data = await getJson(fetcher, 'https://age.yoti.com/api/v1/sessions', {
        method: 'POST', headers,
        body: JSON.stringify({ type: 'OVER', ttl: 900, reference_id: reference, digital_id: { allowed: true, threshold: config.minimumAge, retry_limit: 1 }, doc_scan: { allowed: true, threshold: config.minimumAge, authenticity: 'AUTO', level: 'PASSIVE', retry_limit: 1 }, callback: { auto: true, url: callback }, cancel_url: callback, synchronous_checks: true })
      });
      if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)) throw new ServiceError(502, 'provider_response', 'Age verification returned an invalid session.');
      // The hosted user-view URL and session id are documented by Yoti. No
      // callback parameter or browser checkbox can mark this session as verified.
      return { id: data.id, url: `https://age.yoti.com/?sessionId=${encodeURIComponent(data.id)}&sdkId=${encodeURIComponent(config.yotiSdk)}` };
    },
    async result(id, reference) {
      const data = await getJson(fetcher, `https://age.yoti.com/api/v1/sessions/${encodeURIComponent(id)}/result`, { headers });
      if (data.id !== id || data.reference_id !== reference || data.sdk_id !== config.yotiSdk || data.type !== 'OVER') throw new ServiceError(502, 'age_binding', 'Age verification could not be validated.');
      const method = { DIGITAL_ID: 'digital_id', DOC_SCAN: 'doc_scan' }[data.method];
      const passed = data.status === 'COMPLETE' && method && data[method]?.allowed === true && data[method]?.threshold === config.minimumAge && Number.isInteger(data.age) && data.age >= config.minimumAge;
      return { status: data.status, passed: !!passed };
    }
  };
}
