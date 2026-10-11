import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.mjs';
import { licenseValues } from '../license.mjs';
import { promptPassword } from '../password-prompt.mjs';

const [command, argument] = process.argv.slice(2);
const account = process.env.CLOUDFLARE_ACCOUNT_ID, database = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
async function query(sql, params = []) {
  if (!/^[a-f0-9]{32}$/.test(account || '') || !/^[a-f0-9-]{36}$/.test(database || '') || !apiToken) throw new Error('Connect CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and the CLOUDFLARE_API_TOKEN secret first.');
  let data;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, { method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{ Authorization:'Bearer '+apiToken,'Content-Type':'application/json' },body:JSON.stringify({ sql,params }) });
    if (!response.ok) throw new Error();
    data = await response.json();
    if (!data.success || data.result?.length !== 1 || !data.result[0].success) throw new Error();
  } catch { throw new Error('The private database operation failed. Check Cloudflare access, migrations and record validity.'); }
  return data.result[0];
}

try {
  const version = (await query('SELECT version FROM schema_version WHERE id=1')).results[0];
  if (version?.version !== 1) throw new Error('Apply the supported database migration first.');
  if (['create-user','reset-password','disable-user'].includes(command) && !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(argument || '')) throw new Error('Use a username of 3 to 64 lowercase letters, numbers, dots, underscores or hyphens.');
  if (command === 'create-user') {
    const password = process.env.PORTAL_NEW_PASSWORD || await promptPassword();
    await query('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)',[randomUUID(),argument,await hashPassword(password)]);
    console.log('Account created.');
  } else if (command === 'reset-password') {
    const password = process.env.PORTAL_NEW_PASSWORD || await promptPassword();
    const result = await query('UPDATE users SET password_hash=? WHERE username=?',[await hashPassword(password),argument]);
    if (!result.meta.changes) throw new Error('Account not found.');
    console.log('Password changed and all sessions revoked.');
  } else if (command === 'disable-user') {
    await query('UPDATE users SET enabled=0 WHERE username=?',[argument]);
    console.log('Account disabled and sessions revoked.');
  } else if (command === 'import-license') {
    const values = licenseValues(JSON.parse(readFileSync(argument,'utf8')));
    const existing = (await query('SELECT id FROM licenses WHERE provider_id=?',[values[0]])).results[0];
    const count = (await query('SELECT COUNT(*) AS count FROM licenses')).results[0].count;
    if (!existing && count >= 500) throw new Error('This adapter supports at most 500 licensed titles.');
    await query('INSERT INTO licenses VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET reference=excluded.reference,category=excluded.category,starts=excluded.starts,ends=excluded.ends,countries=excluded.countries,full_length=excluded.full_length,native_hls=excluded.native_hls,drm_required=excluded.drm_required',[existing?.id || randomUUID(),...values]);
    console.log('License record imported.');
  } else if (command === 'remove-license') {
    if (!/^[a-f0-9-]{36}$/.test(argument || '')) throw new Error('Use the provider video UUID.');
    await query('DELETE FROM licenses WHERE provider_id=?',[argument]);
    console.log('License removed. Previously issued URLs expire within five minutes.');
  } else throw new Error('Use create-user, reset-password, disable-user, import-license or remove-license followed by the username or private file/video id.');
} catch (error) {
  // Only controlled local errors reach the terminal. Provider response bodies
  // and SQL statements, which can contain hashes and license evidence, do not.
  const safe = ['Connect ','The private database','Apply ','Use ','Account not found.','Run this ','Cancelled.','This adapter'];
  console.error(safe.some(prefix => error.message.startsWith(prefix)) ? error.message : 'The private database operation could not be completed.');
  process.exitCode = 1;
}
