export function readConfig(env = process.env) {
  const local = env.PORTAL_LOCAL === 'true';
  const portalOrigin = env.PORTAL_ORIGIN || 'https://tools.cjaffa.com';
  const apiOrigin = env.API_ORIGIN || '';
  for (const origin of [portalOrigin, apiOrigin]) {
    if (!origin) throw new Error('PORTAL_ORIGIN and API_ORIGIN are required.');
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || (!local && url.protocol !== 'https:') || (local && !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Invalid server origins. Local mode permits loopback only.');
  }
  if (!local && (portalOrigin !== 'https://tools.cjaffa.com' || new URL(apiOrigin).hostname === 'tools.cjaffa.com' || new URL(apiOrigin).hostname.split('.').slice(-2).join('.') !== 'cjaffa.com')) throw new Error('Use a separate same-site API hostname under cjaffa.com. Never replace the GitHub Pages hostname.');
  const minimumAge = Number(env.MINIMUM_AGE || 18);
  if (!Number.isInteger(minimumAge) || minimumAge < 18 || minimumAge > 100) throw new Error('MINIMUM_AGE must be at least 18.');
  return { local, portalOrigin, apiOrigin, minimumAge, dbPath: env.PORTAL_DB || undefined, bunnyKey: env.BUNNY_API_KEY || '', bunnyTokenKey: env.BUNNY_TOKEN_KEY || '', bunnyLibrary: env.BUNNY_LIBRARY_ID || '', bunnyHost: env.BUNNY_CDN_HOST || '', bunnyApproved: env.BUNNY_CUSTOM_HLS_APPROVED === 'true', yotiKey: env.YOTI_API_KEY || '', yotiSdk: env.YOTI_SDK_ID || '' };
}
