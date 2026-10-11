export async function promptPassword() {
  if (!process.stdin.isTTY) throw new Error('Run this account command in an interactive terminal.');
  process.stdout.write('Password (14+ characters, input hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const read = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0,-1);
        else if (char >= ' ' && value.length < 257) value += char;
      }
    };
    process.stdin.on('data', read);
  });
}
