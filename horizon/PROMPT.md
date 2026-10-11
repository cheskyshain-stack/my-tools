# Prompt to hand to another agent

Paste this as the first message. It assumes the agent can see the repository.

---

You are taking over development of **Netz & Shkiya**, the `horizon/` tool in the
`cheskyshain-stack/my-tools` repository. It calculates sunrise and sunset three ways:
at sea level, corrected for the observer's height, and against the real skyline read from
elevation tiles.

**Before you change anything, read these three files in this order:**

1. `horizon/DEVELOPING.md` - the full handover for this tool: the physics and its exact
   conventions, the elevation tile pipeline, the solver, the storage shape, the UI
   structure, the ten test suites, the known limits, and a numbered list of ten things
   that must not be undone.
2. `CLAUDE.md`, section "Netz and shkia against the real skyline" - why each decision was
   made, which alternatives were tried and rejected, and which bug each piece of
   apparently odd code prevents.
3. `tests/README.md` - how to run the suites and which bug each one exists to catch.

**Facts you need up front:**

- The whole tool is one self-contained file, `horizon/index.html`, with its CSS and
  JavaScript inline. No build step, no bundler, no framework, no npm for the app. `var`
  throughout, one IIFE. Match that style.
- GitHub Pages serves `main` at the root of https://tools.cjaffa.com, so **pushing to
  `main` is deploying**. There is no staging. Pages caches for ten minutes, so bump the
  `?v=` on any asset referenced by URL when it changes.
- Never put a Cloudflare Worker or a Pages project in front of `tools.cjaffa.com`. That
  took the site down once.
- Tests are Playwright against a real Chromium in `tests/`, ten suites and 712 checks.
  Run the ones touching what you changed. Serve on a port you have not used before in the
  session: reusing one gets you a cached page and a false pass.
- `accuracy-test.mjs` and four assertions in `horizon-test.mjs` need
  `https://github.com/cheskyshain-stack/zmanim-tool.git` cloned beside `my-tools`, which
  holds the NOAA engine the sea level row is checked against.
- A sandbox usually cannot reach AWS elevation tiles or Nominatim. The suites intercept
  tile requests and fetch the bytes with **async** `execFile` curl. A synchronous curl
  inside a route handler deadlocks Playwright.

**House rules, which are the owner's and are not negotiable:**

1. **No em dashes.** Anywhere: interface, code comments, commit messages, and replies to
   the owner. Use a comma, a colon, parentheses, or two sentences.
2. **Verify in a real browser. Do not reason about it.** Measure with
   `getBoundingClientRect` and say what you measured. Several confident conclusions in
   this project's history were wrong and had to be retracted.
3. **Check 375 to 412px.** No horizontal overflow on any screen. The owner uses an
   Android phone, so mobile is not an afterthought.
4. **No console errors.** The suites assert this.
5. The terrain row is not a halachic ruling. Keep the caveats on screen and do not
   promote it to a headline zman.

The owner is direct. If they say a fix did not work, believe them and go and measure,
rather than explaining why it should have.

When you are done with a change: run the relevant suites, commit with a plain descriptive
message, `git pull` first (more than one agent works in this repo), push to `main`, and
confirm what actually landed before saying it is live.

My first task for you is: **<describe the change here>**
