# Working on CJ Portal

A handover for an agent picking this repo up for the first time.

**`CLAUDE.md`, beside this file, is the real specification.** It is 570 lines and it is
written for exactly this purpose: it says why each decision was made, which alternatives
were tried and rejected, and which bugs each piece of apparently odd code is there to
prevent. Read it before changing anything. This file is the orientation; that one is the
detail.

## What this is

A personal collection of small web tools at <https://tools.cjaffa.com>, owned by one
person who uses them daily on an Android phone and on a desktop. Mobile is not an
afterthought.

Each tool is **one self-contained `index.html`** with its CSS and JavaScript inline.
There is no bundler, no framework, no npm, and no build step. `assets/cj.css` carries the
shared design tokens and `assets/cj-refresh.js` the shared pull-to-refresh.

The root `index.html` is a shell that holds the current tool in an iframe and mirrors its
path into the address bar, so Back and Forward feel normal while each tool keeps its own
document. `home/index.html` is the tool list that the shell opens by default.

| | |
| --- | --- |
| Visible tools | groceries, qr-code, braille, stopwatch, horizon, music, chess, sudoku, tic-tac-toe |
| Hidden tools | budget, qwikpen, finances, school |
| Other | admin (the music catalogue editor, PAT-gated), maaser |

A hidden tool carries `class="hidden-tool"` on its card and appears only after a
triple-click on the logo, remembered in `localStorage.cjAppsHiddenToolsVisible`. It is
tidiness, not security: every page is public.

## How it deploys

GitHub Pages serves `main` at the root. **Pushing to `main` is deploying.** There is no
staging and no pipeline. Pages caches for ten minutes, so anything you change that is
loaded by URL needs its cache stamp bumped: an icon is referenced from `home/index.html`
as `/<tool>/icon.png?v=2` and that number must go up when the file changes.

After pushing, confirm the change is actually live before saying it is. Fetching
`https://raw.githubusercontent.com/cheskyshain-stack/my-tools/<sha>/<path>` proves what
landed in the repo; the live site follows a minute or so later.

## The rules that are not negotiable

1. **No em dashes.** Anywhere. Not in the interface, not in comments, not in commit
   messages, not in replies to the owner. This was an explicit instruction and the whole
   codebase was swept once to remove them. Use a comma, a colon, parentheses, or two
   sentences.
2. **Verify in a real browser. Do not reason about it.** Especially anything touching
   Hebrew, row heights, print layout, or geometry. Several confident conclusions in this
   project's history were wrong and had to be retracted. Measure with
   `getBoundingClientRect`, then say what you measured.
3. **Check 375 to 393px.** No horizontal overflow, on every screen of every tool.
4. **No console errors.** The suites assert this and it is not negotiable either.

## Testing

`tests/` holds six Playwright suites, 129 checks. `tests/README.md` explains how to run
them and, more importantly, which bug each one exists to prevent. Run the ones touching
what you changed, and read that list before deleting an assertion that looks redundant.

```sh
cd tests && npm install playwright
python3 -m http.server 8099          # from the repo root, in another shell
node horizon-test.mjs
```

Serve on a port you have not used before in this session. Reusing one gets you a cached
page and a false pass. That has produced false confidence here more than once.

## The thing most likely to catch you out

`horizon/` (Netz & Shkiya) computes sunrise and sunset three ways: at sea level, with the
observer's elevation, and against the real terrain horizon read from elevation tiles. It
is by far the most intricate tool here and `CLAUDE.md` has a long section on it. Four
hard-won points:

- **Refraction is applied twice, in different places, on purpose.** The ray from a ridge
  to the observer uses the effective-earth-radius trick; the ray from the sun through the
  whole atmosphere uses astronomical refraction. They are different rays and folding
  either into the other double counts.
- **The solver and the map pin must be one calculation.** They were two, and disagreed by
  0.22 degrees in the Alps, about a minute, with the screen contradicting itself.
- **A tile that fails to fetch is not the sea.** Only a 404 means open water. Treating a
  failed fetch as sea level made the page report a flat world and "nothing is in the way"
  whenever it was offline.
- **Never write into a form field while it has focus.** Doing so destroys the selection,
  so the next keystrokes land after whatever the page just wrote. A typed `1000` came out
  as `27.41000`.

## Working with the owner

They are direct. If they say a fix did not work, believe them and go and measure rather
than explaining why it should have. They test on an Android phone. They care about what
appears on screen and on paper, not about the shape of the code.
