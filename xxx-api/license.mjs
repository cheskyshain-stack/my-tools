export function licenseValues(item) {
  if (!item || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.providerVideoId || '')) throw new Error('A Bunny video UUID is required.');
  const starts = Date.parse(item.startsAt), ends = Date.parse(item.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new Error('Explicit, valid license dates are required.');
  if (typeof item.licenseReference !== 'string' || item.licenseReference.length < 3 || item.licenseReference.length > 200) throw new Error('A license evidence reference is required.');
  if (typeof item.category !== 'string' || !item.category.trim() || item.category.length > 60) throw new Error('A category of up to 60 characters is required.');
  if (!Array.isArray(item.countries) || !item.countries.length || item.countries.length > 250 || item.countries.some(c => c !== '*' && !/^[A-Z]{2}$/.test(c)) || (item.countries.includes('*') && item.countries.length !== 1)) throw new Error('Use ISO country codes, or ["*"] for documented worldwide rights.');
  if (typeof item.fullLengthAuthorized !== 'boolean' || typeof item.nativeHlsAuthorized !== 'boolean' || typeof item.drmRequired !== 'boolean') throw new Error('Explicit full-length, native-HLS and DRM declarations are required.');
  return [item.providerVideoId.toLowerCase(), item.licenseReference, item.category.trim(), starts, ends, JSON.stringify([...new Set(item.countries)]), Number(item.fullLengthAuthorized), Number(item.nativeHlsAuthorized), Number(item.drmRequired)];
}

export function allowedLicense(row, now = Date.now()) {
  // This adapter supports worldwide rights only. Regional rights stay closed until
  // a trusted geolocation/entitlement adapter exists; a browser country is not proof.
  return !!row && row.starts <= now && row.ends > now && row.full_length === 1 && row.native_hls === 1 && row.drm_required === 0 && row.countries === '["*"]';
}
