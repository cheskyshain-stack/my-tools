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

### The PIN on Money Flow

Money Flow opens on a PIN screen. The body ships with `class="locked"`, CSS hides
everything but the lock, and the class comes off only when the four digits hash to the
constant in the script, so nothing is painted before it is unlocked. It relocks on every
load, and the weekly backup does not arm while it is up. Be honest with the user about
what this is: a screen lock for a phone in someone else's hand. The page is public and
the ledger is in `localStorage` either way, so it is not privacy.

### Hidden tools

Budget Planner, QwikPen and Money Flow carry `class="tool hidden-tool"` and do not show
until the CJ logo on the home page is clicked three times within about a second. The
choice is remembered in `localStorage` under `cjAppsHiddenToolsVisible`, and another
triple click hides them again. Anything personal goes in this group.

### Icons

512x512, black tile, artwork bleeding to the edge, the tool's name baked into the image
as a neon label.

An icon arriving with a checkerboard around it usually has that checkerboard **painted
in**, not transparent: the School Calendar one was fully opaque and every corner pixel
was a solid grey square. Do not crop it away. Cropping inside the tile to clear its
rounded corners cost the binder rings off the top and clipped the wordmark at the sides.
Paint the checkerboard black instead and keep the whole tile: the cards set
`background:#000` behind the image, so black corners vanish into the card and the tile's
own rounded corners land right on the card's frame. Check by sampling the outer ring of
the finished file, which should be 0. The cards render them with `object-fit: cover` inside their own rounded
frame, so an icon carrying its own visible frame reads as boxed in: crop inside it. Art
that is taller than it is wide should be centred on black rather than cover-cropped, or
the longer labels lose their ends.

## The school calendar

`school/` is the Yeshiva K'tana calendar for 2026 to 2027, a hidden tool. It came from a
workbook the user supplied, and the workbook is the source of truth: the tool invents
nothing.

- **Hebrew dates appear only where the workbook gives one.** They are not computed, and
  they should not be. The sheet supplies a Hebrew date per entry, so entries carry one
  and ordinary days do not.
- **The dates were checked, not trusted.** `scratchpad/cal-extract.py` parses each entry's
  date span and asserts the weekday matches the one the sheet prints beside it. All 49
  matched. Re-run that check if the workbook is ever replaced.
- Multi day entries are expanded to one record per day, so a span like Succos paints
  across the grid and across a month boundary instead of sitting on its first day.
- The data is inlined into the page rather than fetched. There is no build step in this
  repo, so a separate JSON file would be a second thing to cache and a second thing to go
  stale against the HTML.
- **Below 560px a day cell shows a number and a colour, nothing else.** Cramming the
  wording in produced "Limud Kodes beg..." and was worse than useless. The month written
  out under the grid carries the date, the weekday, the Hebrew date and the full text,
  which is where detail belongs at that width. Note that `.dtext` had two `display`
  declarations once and the second silently won; that is how the phone bug got in.
- The en dashes in the notes are the school's own wording, quoted verbatim. The no em
  dash rule is about prose written here, not about someone else's document.
- **The year view is forward looking.** A month wholly behind us is left out, and a day
  that has passed carries nothing. A span is judged on its end, not its start, so Succos
  stays listed all the way through. An Include past pill brings it all back, and picking
  a single month always shows that month whole: navigating to one is a deliberate act.
- **The parshiyos and yomim tovim come from the zmanim project's own engine**, not from
  a Hebrew calendar written here. `scratchpad/hebdump.mjs` imports
  `zmanim-tool/js/hebrew-calendar.js` and runs `hasParsha`, `hasYomTov`, `hasRoshChodesh`
  and `hasTaanis` over the school year, and the result is baked into `DATA.heb`. That
  engine was ported 1:1 from the user's workbook and drives boards they print, so it is
  the trustworthy source. Re-run it to extend the calendar to another year.
- On a Shabbos the **parsha leads** and a Yom Tov follows it, because a Shabbos is named
  by its parsha: ט״ו בשבט 5787 falls on פרשת בשלח and the cell shows both. A Shabbos that
  is a full Yom Tov has no parsha, so the Yom Tov stands alone there.
- A sideways flick changes month, in the single month view only. **No `touch-action` is
  set anywhere**, so scrolling up and down stays entirely the browser's; a swipe is only
  recognised after the fact, from the pointer down and up positions. It needs 48px of
  travel, more horizontal than vertical by half again, and under 900ms, which is what
  keeps a scroll, a nudge and a tap from turning the page. The tests assert all four
  non-cases as well as the two that work.
- Hebrew in a cell is wrapped in `<bdi>` inside a `dir="rtl"` block, and centred. The cell is
  otherwise left to right, and the tests measure that the day number stays at the top
  left and that nothing spills past the cell edge.

## The music catalogue

`music/songs.json` and `music/albums.json` are the catalogue; the MP3s sit beside them
in `music/`. `admin/index.html` (not linked from the home page, reach it at
`/admin/`) is the tool for changing any of it: it commits to GitHub directly with a
fine-grained token the user pastes in, which lives only in that browser.

**The featured song is a radio button, not a checkbox.** `featured()` in the music page
does `songs.findIndex(s => s.featured)`, so it takes the **first** flagged song in the
list. A flag left on an earlier song silently beats one set on a later song, which is why
`setFeatured` in the admin page clears every flag before setting the chosen one. With
nothing flagged the page falls back to index 0, which is a valid state and what the star
toggles to when you tap the lit one.

**"Latest releases" means newest, and nothing carries a `year`.** The sort was written
around a `year` field no song has ever had, so it fell through to the file's own order
and the rail was frozen on the first ten songs ever added: a new song could not appear
there at all, and reordering could not fix it. It now ranks by `year` if present, then
by when the song was added (`added`, or the timestamp the admin page mints into a
`song-<ms>` id), then by position with later meaning newer. The admin page stamps
`added` on every new song.

To test the admin page, stub `window.fetch` for `api.github.com` against an in-memory
copy of the two JSON files. Every commit the page makes is then inspectable without a
token and without touching the repo.

The admin page carries a `build` stamp beside its subtitle. It is the entry point, so
nothing can cache-bust it from the inside, and Pages serves it with a ten minute
max-age that a phone will stretch much further. When a change seems not to have landed,
read the stamp before believing anything else.

## The shell frame and the address bar

The root `index.html` is an iframe shell and the outer document is `overflow: hidden`,
so **the frame must never be taller than what is on screen**. Anything past the bottom
edge cannot be scrolled to, by the shell or by the tool inside it.

`100vh` on Android is the height with the address bar *hidden*. With it showing, the
frame hung 112px past the fold and the bottom of every tool was quietly unreachable:
the tool's own scrollbar could reach its end, but that end was drawn in a strip nobody
could see. It looked like a page that would not scroll.

The frame is now driven from `visualViewport.height`, written to `--shell-h`, which is
the only number that means "on screen". `100dvh` is left as the fallback for anything
without a visual viewport.

To test it, stub `visualViewport.height` shorter than the window and check that
`frame.bottom - visibleHeight` is zero. There is no address bar in a headless browser,
so this is the only way to see it.

**Known and not caused by this:** qr-code, braille, sudoku and tic-tac-toe scroll
sideways when loaded in the frame, though not when opened directly. Verified against the
pre-change shell: identical. Separate job.

## An input the keyboard cannot reach

Android does not shrink the layout viewport when the keyboard opens, so
`position: fixed; bottom: 0` puts a control **behind** the keyboard rather than above
it. The Shopping List's Add bar disappeared this way.

Lifting it with a `visualViewport` listener works, and it was tried, and the user
rejected it: raising the bar makes the page shift and the header scroll out of sight.
**The answer was to stop pinning it to the bottom at all.** The composer now sits in
normal flow under the tabs, where the keyboard cannot cover it and nothing has to move
when it opens. Measured with a 480px keyboard: header still at y=0, composer still at
y=110, page scroll 0.

So: for a control that has to survive the keyboard, put it above the fold rather than
teaching it to dodge. Keep `interactive-widget=resizes-content` and `height: 100dvh` so
the list shortens instead of running under the keyboard.

To test any of this, stub `window.visualViewport` and `window.innerHeight` before the
page's own script runs, then shrink them. A headless browser has no keyboard, which is
exactly why this bug survived testing the first time.

## The stopwatch

The dial is drawn, not drawn on. `buildFace()` lays out the ticks, the numerals and
the label from one number, the seconds in a turn, which is chosen in the app and kept
in `localStorage` under `cjStopwatchSeconds`.

Two rules keep a face readable at any length. `labelStep` prints a numeral every
*n* seconds, stepping up until twelve or fewer fit, and prefers a step that divides the
turn exactly so the gap before the 0 at the top matches every other gap. `minorsPerSecond`
picks the finest subdivision that keeps the rim under 120 ticks. At ten seconds those
come out at every second and fifths, which is the face this watch has always had:
**if a change alters the ten second dial, it is wrong.** The test asserts fifty ticks,
ten heavy, numerals nought to nine.

A turn of one or two seconds has almost no whole seconds to print, so the numerals
become fifths, written `.2` and `.4`. They are still seconds, which is what keeps the
promise that nothing on the face means anything but time.

Changing the length zeroes the round counter and restarts the sweep from the top,
because a round of ten and a round of thirty are not the same thing and adding them
would be a lie. Whether it was running is preserved.

### Keeping the screen on

Two ways, because the first is not always there. `navigator.wakeLock` needs a secure
context; where it is missing or refused, a 2px video playing a canvas stream does the
same job, which is the trick a video call uses.

Three things this got wrong once each, so do not undo them:

- The guard tested `"wakeLock" in navigator`, the key rather than the value, so
  `.request` threw on browsers that do not have it.
- `requestWakeLock` returned early on `if (wakeLock)`. A sentinel the system has
  already let go of is not a lock, and the release event does not reliably arrive, so
  once a phone quietly took it back the page could never ask again for the rest of the
  session. It now tests `wakeLock && !wakeLock.released`.
- The status line faded after two seconds. It stays up while the watch runs and names
  which of the two ways is holding the screen, because a message that has faded cannot
  tell you anything the next day when the screen went dark.

**Only the system lock actually holds a screen.** The video is a hope, not a promise,
so the line must not say "kept awake" when that is all there is: it says a fallback is
being tried and may not hold. A reassuring message over a dark screen is worse than no
message. A `NotAllowedError` on Android is nearly always battery saver, so the line says
that rather than the name of the exception, and the count of re-takes is shown when it
climbs, because that is the phone fighting the lock.

A watchdog re-checks every three seconds while running and asks again if either method
has quietly stopped. `pageshow` and `focus` also re-arm it, since not every Android
build fires `visibilitychange` coming back from the app switcher.

The pushers read left to right as **setting, Reset, Start/Stop**. The user is right
handed and the one pressed most often belongs under the thumb; the order was asked for
and is not arbitrary.

## Data

Every tool keeps its own state in `localStorage` and there is no backend. That means data
lives on one device in one browser, and clearing site data takes it with it. Any tool
holding something the user would miss needs an export and import of its own. Money Flow treats a business payment's splits as a checklist rather than as
something that already happened: those three transfer rows are written with
`pending: true`, stay out of every balance and out of the charity set aside
total until they are ticked off on the dashboard, and rows saved before that
idea existed carry no flag and count as done. Money Flow
also writes a copy to the downloads folder once a week: a browser will not let a page
start a download before the person has touched it, so a due backup arms itself and the
first tap anywhere writes the file.

### The Tiller inbox

Tiller keeps a Google sheet of what the banks report, and it has no API another app can
call. So the exchange is a CSV: the sheet downloads one, the Inbox tab reads it. Rows
land as unlabelled items in `state.inbox` and write nothing to the ledger until the user
says what each one is.

Four fields on `state` carry it, and `normalizeState` fills them in for any file written
before the inbox existed:

- `inbox`, the rows still waiting, sorted oldest first so a payment is answered before
  the transfers it sets up.
- `seen`, every Tiller id that has ever been through, marked **at import time, not when
  the row is labelled**. Marking it late meant a second import duplicated everything
  still sitting in the inbox. Undo removes the ids again.
- `hints`, what a payment was called last time, keyed on the description with the digits
  stripped out, because a bank writes a different reference number every time. This is
  what makes the second month faster than the first.
- `accountMap`, the Tiller account name mapped to one of the four accounts here.

Two behaviours are the point of the whole thing and must not regress:

- A payment that splits at the bank arrives as **two** deposits, the part kept and the
  part sent to charity. `partnerFor` finds the second one within four days at between
  8.5% and 25.5%, and saving the first takes both off the list, recording one payment
  with both its pieces. Enter each payment once.
- A business payment's splits turn up in the bank days later. `pendingMatch` spots an
  amount that equals a transfer already on the to do list and offers to **tick it off**
  rather than write a second row saying the same thing.

The cut off date is inclusive and starts at the newest row already stored, so the day
itself can come through twice. That is deliberate: missing a payment is worse than
seeing it in an inbox that writes nothing on its own.

### Sync

Off by default and untouched until someone turns it on. `sync/worker.js` is a
Cloudflare Worker over a KV namespace, live at
`https://moneyflow-sync.cheskyshain.workers.dev`, which the app offers as the default
server. `sync/README.md` has the deploy steps.

It is on `workers.dev` on purpose. A custom hostname is the one step that creates a
domain binding, and it buys nothing here. **Never put this, or any Worker, in front of
tools.cjaffa.com**, which is the August incident all over again. The `[[routes]]` block
in `wrangler.toml` stays commented out.

The ledger is sealed in the browser with AES-GCM and only then sent. The server holds the
data key sealed twice over, once by the passphrase and once by the recovery code, so it
can open nothing. Two ways in rather than one is the point: forgetting the passphrase is
recoverable, and so is losing the code, and any device already connected holds the key
and can simply be given a new passphrase.

Four things must not regress:

- **The sealed key belongs to the vault, not to a device.** A device pushes back whatever
  `wrapped` it just read unless `sync.pushKeys` says it is the one changing the key.
  Without that, a stale copy on the phone silently undid a passphrase change made on the
  desktop, and neither secret opened the vault afterwards.
- **A sync must never save through `save()`.** `save` schedules a sync, so a sync that
  saves schedules another, for ever. `quietSave` exists for exactly this.
- **A write names the version it was based on.** A 409 hands back the server's copy, and
  `mergeIn` folds the two together: rows by id with the later `rev` winning, deletions
  recorded as tombstones so a row the other device still holds is not handed back.
- **An idle sync costs a read and no write.** `fingerprint` compares what would be sent
  against what was last sent, which is what keeps this inside Cloudflare's free tier.

Deleting a row now writes `state.tombs[group]`, and every row carries `rev`, set by
`touch()`. Any new code path that changes a row must call `touch` or the change will lose
a merge.

## Verify before you call it done

Generate the change, then check: the tool loads standalone and inside the shell iframe,
its card opens it, no console errors, nothing overflows sideways at 375px, hidden tools
still hidden by default, and the live URL serves the new bytes after the push.
