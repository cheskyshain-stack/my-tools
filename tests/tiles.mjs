import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
const run = promisify(execFile);
const pending = new Map();

// Only a real 404 is water. A network failure must fail the test instead of
// replacing an unverified ridge with a sea level tile and producing a false pass.
export async function tileBytes(url) {
  const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(url);
  if (!m) throw new Error("Not a Terrarium URL: " + url);
  const path = `tiles/${m[1]}_${m[2]}_${m[3]}.png`;
  if (pending.has(path)) return pending.get(path);
  const job = (async () => {
    await fs.mkdir("tiles", { recursive: true });
    try {
      const cached = await fs.readFile(path);
      if (cached.length) return cached;
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    const temp = `${path}.${process.pid}.tmp`;
    try {
      const { stdout } = await run("curl", ["-sS", "-L", "-m", "60", "--retry", "2",
        "-w", "%{http_code}", "-o", temp, url]);
      if (stdout.trim() === "404") return null;
      if (stdout.trim() !== "200") throw new Error(`Tile returned HTTP ${stdout}: ${url}`);
      const body = await fs.readFile(temp);
      if (body.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("Tile response is not a PNG: " + url);
      }
      await fs.rename(temp, path);
      return body;
    } finally { await fs.rm(temp, { force: true }); }
  })();
  pending.set(path, job);
  try { return await job; }
  catch (e) { pending.delete(path); throw e; }
}
