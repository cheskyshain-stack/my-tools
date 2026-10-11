import { openStore, createUser, importLicense, hashPassword } from './store.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const db = openStore(process.env.PORTAL_DB || fileURLToPath(new URL('./private/portal.sqlite',import.meta.url)));
const [command, arg] = process.argv.slice(2);
async function password() {
  if (!process.stdin.isTTY) throw new Error('Run this account command in an interactive terminal.');
  process.stdout.write('Password (14+ characters, input hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const read = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0,-1);
        else if (char >= ' ' && value.length < 257) value += char;
      }
    };
    const finish = () => { process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    process.stdin.on('data', read);
  });
}
try {
  if (command === 'create-user') { await createUser(db, arg, await password()); console.log('Account created.'); }
  else if (command === 'reset-password') {
    const user = db.prepare('SELECT id FROM users WHERE username=?').get(arg);
    if (!user) throw new Error('Account not found.');
    const hash = await hashPassword(await password());
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    console.log('Password changed and all sessions revoked.');
  } else if (command === 'disable-user') {
    db.prepare('UPDATE users SET enabled=0 WHERE username=?').run(arg);
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username=?)').run(arg);
    console.log('Account disabled and sessions revoked.');
  } else if (command === 'import-license') {
    const data = JSON.parse(readFileSync(arg, 'utf8'));
    importLicense(db, data); console.log('License record imported.');
  } else if (command === 'remove-license') {
    db.prepare('DELETE FROM licenses WHERE provider_id=?').run(arg); console.log('License removed. Previously issued URLs expire within five minutes.');
  } else throw new Error('Use create-user, reset-password, disable-user, import-license or remove-license followed by the username or file/video id.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
