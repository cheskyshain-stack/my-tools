# Working on this project

CJ Portal, the collection of small web tools at https://tools.cjaffa.com. One repo, one
folder per tool, no backend and no build step. Read `README.md` for what the site is.
This file is about changing it.

## Ground rules

**No em dashes.** Anywhere. Not in the interface, not in comments, not in commit
messages, not in replies to the user. Use a comma, a colon, parentheses, or two
sentences.

**Verify in a real browser, do not reason about it.** Serve the repo locally on a fresh,
unused port and look at the actual page. Measure with `getBoundingClientRect` rather
than predicting layout. Reusing a port you served from earlier in the session gets you a
cached page and a false pass.

**Mobile is not an afterthought.** The user is on an Android phone most of the time.
Check every change at 412x839 and 375x667 before calling it done, and confirm no
horizontal overflow.

## How this site publishes, and the one way it breaks

GitHub Pages, straight from `main`, root folder. Nothing else. The parts that make that
work, all of which must stay true:

- `CNAME` in the repo root contains `tools.cjaffa.com`. GitHub Pages reads it to claim
  the domain.
- Repo Settings, Pages: Source is "Deploy from a branch", branch `main`, folder `/`.
- At Cloudflare, the `tools` DNS record is a CNAME to `cheskyshain-stack.github.io` with
  **Proxy status DNS only**, the grey cloud. Orange means Cloudflare answers instead of
  GitHub, and GitHub cannot then issue the certificate that makes Enforce HTTPS
  available.
- `.nojekyll` keeps Pages from running Jekyll over files that are already finished.

**Never put a Cloudflare Worker or a Pages project in front of this domain.** In August
2026 a Claude session deployed a static-assets Worker named `tools` and attached
`tools.cjaffa.com` to it. A Worker with a custom domain answers every request for that
hostname before DNS is consulted, so the site froze on the snapshot baked into that
Worker. Pushes to `main` kept succeeding and kept changing nothing, new paths returned a
bare 404 rather than this repo's `404.html`, and it took two days and a lot of the
user's patience to find. If a deploy ever seems to vanish, suspect that first.

### Deploy loop

1. Edit files.
2. `git add -A && git commit && git push origin main`.
3. Wait 30 to 90 seconds.
4. Verify against the live site with a cache-buster, never a bare reload:
   `curl -s "https://tools.cjaffa.com/some/page/?b=$(date +%s)"`. Do not tell the user
   it is live until you have seen the new bytes.

If the live site disagrees with `main`, check in this order: repo Settings, Pages, for a
green "Your site is live at" with a recent timestamp; Cloudflare for a Worker or Pages
project holding the domain; the DNS record's proxy status.

### Caching

Pages serves everything with a 10 minute max-age. HTML catches up on its own, but a
replaced image at the same path can sit stale on a phone long enough to look like a
failed deploy. When a card icon changes, bump the stamp on its `src` in
`home/index.html`, `?v=2` to `?v=3`, so the grid updates the moment the page does.

## Layout of the repo

- `index.html` at the root is a **shell**: a full-height iframe that loads `/home/` and
  mirrors the iframe's path into the address bar with `pushState`, so Back and Forward
  feel normal while each tool runs in its own document. A tool must also work when
  opened directly, since that is what a bookmark or a shared link does.
- `home/index.html` is the portal page itself: logo, three swipeable tabs (Music, Tools,
  Games), and a grid of cards.
- One folder per tool, each holding `index.html`, `icon.png` and `manifest.json`.
- `assets/cj.css` is the shared design system. **Link it after the page's own `<style>`
  block**, so its tokens win. `assets/share-widget.js` renders the Share button.

### Adding a tool

1. `newtool/index.html`, plus `manifest.json` (copy a neighbour's and change the name,
   description, `start_url` and `scope`) and a 512x512 `icon.png`.
2. In the page head: title as `Name | CJ Portal`, theme-color `#080b12`, the manifest and
   apple-touch-icon links, then `<link rel="stylesheet" href="/assets/cj.css">` last.
3. Give it a way home. Scrolling pages use `.cj-page-header` with `.cj-brand`;
   full-screen pages use `.cj-float`, a small logo pinned to the top left.
4. Add a card to the Tools or Games grid in `home/index.html`, matching the markup of the
   cards around it.

### Hidden tools

Budget Planner, QwikPen and Money Flow carry `class="tool hidden-tool"` and do not show
until the CJ logo on the home page is clicked three times within about a second. The
choice is remembered in `localStorage` under `cjAppsHiddenToolsVisible`, and another
triple click hides them again. Anything personal goes in this group.

### Icons

512x512, black tile, artwork bleeding to the edge, the tool's name baked into the image
as a neon label. The cards render them with `object-fit: cover` inside their own rounded
frame, so an icon carrying its own visible frame reads as boxed in: crop inside it. Art
that is taller than it is wide should be centred on black rather than cover-cropped, or
the longer labels lose their ends.

## Data

Every tool keeps its own state in `localStorage` and there is no backend. That means data
lives on one device in one browser, and clearing site data takes it with it. Any tool
holding something the user would miss needs an export and import of its own. Money Flow
also writes a copy to the downloads folder once a week: a browser will not let a page
start a download before the person has touched it, so a due backup arms itself and the
first tap anywhere writes the file.

## Verify before you call it done

Generate the change, then check: the tool loads standalone and inside the shell iframe,
its card opens it, no console errors, nothing overflows sideways at 375px, hidden tools
still hidden by default, and the live URL serves the new bytes after the push.
