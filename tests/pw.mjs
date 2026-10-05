import { chromium } from "playwright";
import fs from "node:fs";

/* Some containers ship a Chromium that Playwright did not install itself, so the
   version it expects is not the version that is there. Point at the one on disk when
   there is one, and let Playwright find its own otherwise. */
const CANDIDATES = [
  process.env.CJ_CHROME,
  "/usr/bin/chromium",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
].filter(Boolean);

export const EXE = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
export const launch = (opts = {}) =>
  chromium.launch(EXE ? { executablePath: EXE, ...opts } : opts);

export const BASE = process.env.CJ_BASE_URL || "http://127.0.0.1:8099";
