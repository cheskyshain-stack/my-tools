# Netz & Shkiya: everything you need to keep developing it

A handover for a developer or an agent taking over `horizon/`. It is written to be read
on its own: you should not have to ask anybody anything to make a correct change after
reading it.

Three companion files, all in this repository:

| file | what it is for |
| --- | --- |
| `../CLAUDE.md` | the project specification. Its "Netz and shkia against the real skyline" section is the reasoning behind every decision here, bug by bug. Read it. |
| `../AGENTS.md` | orientation for the whole portal: how it deploys, the house rules |
| `../tests/README.md` | how to run the suites and which bug each one exists to catch |

This file is the map, the physics, the conventions and the list of things that must not
be undone.

---

## 1. What the tool answers

Sunrise (נץ) and sunset (שקיעה) for any point on earth, on any date, **three ways**:

1. **Sea level.** The conventional answer, what a printed luach gives.
2. **Corrected for how high you are standing.** The sea horizon dips below level by
   `acos(R / (R + h))`, so height makes sunset later and sunrise earlier.
3. **Against the ground that is actually in the way.** The real skyline, read from
   elevation data, bearing by bearing. This is the row the tool was built for.

How much the third row is worth depends entirely on where you are:

| place | effect on shkia | why |
| --- | --- | --- |
| Lakewood NJ | about 1.5 min earlier | the worst thing to the west is a 45 m rise 3 km out |
| Chamonix | 73 min earlier, netz about 3 h later | the Alps |
| flat open country | nothing | there is nothing in the way |

**It is not a halachic ruling and must not be dressed up as one.** Whether shkia follows
the visible horizon or mishor is a machlokes, and nearly every printed luach uses sea
level. The page says so in as many words and deliberately looks nothing like the shul's
boards. Do not promote the terrain row to a headline zman.

---

## 2. Running it

There is no build step, no bundler, no framework and no npm for the app itself.
`horizon/index.html` is the entire tool: HTML, CSS and JavaScript in one file.

```sh
git clone https://github.com/cheskyshain-stack/my-tools.git
cd my-tools
python3 -m http.server 8175      # from the repo root
# open http://127.0.0.1:8175/horizon/
```

Serve on **a port you have not used before in this session**. Reusing one gets you a
cached page and a false pass. That has produced false confidence here more than once.

It needs the network for two things, and degrades rather than breaking without either:

- **AWS elevation tiles** (`s3.amazonaws.com/elevation-tiles-prod/terrarium/`) for row 3
- **Nominatim** (`nominatim.openstreetmap.org`) for the address box only

### Deploying

GitHub Pages serves `main` at the root of <https://tools.cjaffa.com>. **Pushing to `main`
is deploying.** No staging, no pipeline. Pages caches for ten minutes, so anything loaded
by URL (the icon, for instance, referenced from `home/index.html` as
`/horizon/icon.png?v=3`) needs its `?v=` bumped when the file changes.

After pushing, prove what landed before saying it is live:

```sh
curl -s https://raw.githubusercontent.com/cheskyshain-stack/my-tools/<sha>/horizon/index.html | head
```

**Never put a Cloudflare Worker or a Pages project in front of `tools.cjaffa.com`.** That
has taken the site down once already.

---

## 3. Map of the file

`horizon/index.html`, about 1600 lines. The banner comments are the signposts:

| line (about) | banner | holds |
| --- | --- | --- |
| 1 to 80 | head and CSS | all styles inline, dark theme off `../assets/cj.css` tokens |
| 82 | `Where you are` | address box, GPS, recent searches, the `#settings` details with coordinates and heights |
| 113 | `The date` | prev / date / next / today, and the time zone select |
| 120 | `The answers` | the two result cards, netz and shkia |
| 143 | `The skyline` | the SVG chart and the blocking-spot card |
| 154 | `Address hits and the blocking spot` | the "What this is" explainer |
| 335 | `tz-lookup` | vendored tz-lookup 6.1.25, CC0-1.0, one minified function, no network |
| 386 | `The sun` | NOAA solar position, refraction, the crossing solver |
| 543 | `The ground` | tile fetch and decode, ray walking, ridge finding |
| 671 | `The screen` | state, storage, recent searches, units, zones, `paint`, `drawSky` |
| 1160 | `Reading the ground` | `windowAround`, `finish`, `readTerrain` |
| 1261 | `Wiring` and `Reading by itself` | event handlers, `askRead` / `autoRead`, dates |
| 1456 | `Looking up an address` | Nominatim |

Everything is inside one IIFE. `var` throughout, no modules, no classes. Match that
style: this file is edited from a phone sometimes.

---

## 4. The physics, and its exact conventions

### Solar position

`sunAt(date, lat, lon)` returns `{ alt, az }` in degrees, a direct NOAA port
(geometric mean longitude, equation of centre, equation of time, hour angle). `az` is
true bearing from north, clockwise. Row 1 of the table is **cross-checked in the test
suite against `zmanim-tool/js/zmanim/solar.js`**, which is NOAA ported 1:1 from the
workbook the shul prints its boards from, at Lakewood, Jerusalem and Chamonix, summer and
winter. The largest displayed difference measured was 1.003 s. That is what makes row 1
trustworthy enough to measure rows 2 and 3 against.

### What counts as "set"

```js
targetAlt(h) = h - SEMIDIAMETER - refractionAt(h)
```

`h` is the altitude of the horizon at the sun's bearing. `SEMIDIAMETER = 0.2667` is the
sun's own radius, so the moment is **upper limb**, the convention a luach uses.

### Refraction is applied once, in two places, on purpose

This is the single most misunderstood part of the file.

- **The ray from a ridge to your eye** is a near-horizontal ray through dense low air. It
  gets the standard geodetic effective-earth-radius trick, `K_REFRACT = 7/6`, inside
  `ridgeOf`.
- **The ray from the sun** comes through the whole atmosphere at a steep-ish angle. It
  gets astronomical refraction, `refractionAt(h)`: Bennett's formula, scaled by
  `34/BENNETT0` so that a ray arriving level carries exactly the conventional 34 arcminutes,
  and falling away fast above that (a ridge 27 degrees up bends about 2 arcminutes, not 34).

**They are two different rays. Folding either into the other double counts.** If a change
here feels like a simplification, it is almost certainly this bug.

### The dip

`dipOf(h) = acos(R_EARTH / (R_EARTH + h))`, `R_EARTH = 6371008.8` m, clamped to 0 at or
below sea level. Row 2 uses `-dip` as a constant horizon.

---

## 5. Where the ground comes from

### Elevation data is a PNG

AWS publishes open **Terrarium** tiles: ordinary 256x256 PNGs with the height packed into
the colour.

```js
metres = R * 256 + G + B / 256 - 32768
```

One tile is 65536 sample points, which is why this runs in a browser with no key, no
server and no per-point API. They send `Access-Control-Allow-Origin: *`, so a canvas can
read their pixels. `getTile` fetches, `createImageBitmap`s, draws to a canvas and keeps
the `Uint8ClampedArray`. `sampleTile` reads a pixel with `Math.floor` on the fractional
tile coordinate.

### Zoom by distance

```js
zoomFor(metres) = metres < 3000 ? 13 : metres < 15000 ? 11 : 9
```

Paying for 19 m detail at 60 km would be thousands of tiles for a ridge three pixels
wide. A full reading costs about **24 tiles**.

### Walking a ray

`rayPoints(lat, lon, bearing)` steps outward with `NEAR_M = 60` m growing by
`GROW = 1.055` to `MAX_KM = 65`: dense close in, where a small rise matters and a tile
pixel is 19 m, sparse far out, where only a mountain can reach. `along()` is great-circle
forward.

`ridgeOf(pts, grids, obsH)` returns the highest angular elevation along the ray, with
`K_REFRACT` applied, plus the latitude and longitude of the sample that won, so the
blocking ground is a **place** and can get a map pin.

### The window

`windowAround(lat, lon, mid)` builds rays at `AZ_STEP = 2` degrees over
`mid ± HALF_WIDTH`, `HALF_WIDTH = 56`.

**56 degrees is necessary, not generous.** The window has to contain the bearing the sun
is on when it meets the *real* skyline, not the one it would set on over flat ground, and
behind a mountain those are far apart: at Chamonix the sun clears the eastern wall 36
degrees round from where netz would otherwise be. A narrow window does not fail loudly,
it pins the answer to its own edge.

**Halving `AZ_STEP` to 1 was tried and bought nothing.** A mountain skyline is jagged, not
smooth, so sampling does not converge the way it would on a curve. It just doubled the
tiles.

### East and west are separate, and outside them the answer is null

Two windows are read, one around the flat sunset bearing and one around the flat sunrise
bearing. Outside a measured window `lookup` returns **`null`** and the caller falls back
to the smooth earth, which is the honest answer where nothing was measured. Clamping to
the nearest edge instead is what once put a **western** ridge onto **sunrise** and moved
netz 24 minutes the wrong way.

When the solution lands outside the patch, the row says "beyond the patch read" and
`patchMissed` is set, which is the one case where changing only the date sends for more
ground.

### A tile that will not load is not the sea

`sampleTile` reads a missing grid as sea level. That is right for a **404** (open water,
off the edge of the tile pyramid) and badly wrong for a failed fetch: offline, every tile
came back null and the page confidently reported a flat world and "nothing is in the way".

So: **only `res.status === 404` returns `null`.** Anything else throws, the catch returns
the `FETCH_FAILED` sentinel, `gridsFor` refuses the entire reading if any tile is marked,
and the failed key is dropped from the cache on a `setTimeout` so pressing Read again can
genuinely retry.

---

## 6. The solver

### One equation, not two

`crossing(dayUTC, lat, lon, rising, horizonFor, span)` solves

```js
g(t) = sun altitude at t  -  targetAlt(horizon at the sun's bearing at t)
```

Bearing and time are solved **together**. Solving them separately and iterating looked
right on flat ground and was wrong in the mountains: the marker sat off the ridge, and
Chamonix read 97 minutes where the consistent answer is 73.

### g is not monotonic, so crossings are found in order

Where the skyline has a notch, the sun drops behind a ridge, comes back out through the
gap, and sets again. Measured over a year of sun paths: **Chamonix reaches 15 crossings in
a day**, Grindelwald 13, Zermatt 7, Keene Valley 5. On 11 December at Chamonix a plain
bisection over the half day returned 4:04:08 PM, the **last** crossing, where the first is
4:02:27 PM. One minute 41 seconds out, with nothing on screen to suggest doubt.

So:

- `crossingsIn` steps forward at `SCAN_STEP = 30000` ms (about 0.12 degrees of bearing,
  near the data's own resolution) and `refine` bisects each sign change.
- The search is bounded to the band of altitudes the skyline actually occupies (`span`,
  from `spanOf`), since no crossing can happen while the sun is above all of it or below
  all of it. The sun's altitude **is** monotonic within a solar half-day, so `whenAlt` can
  safely bisect for those two bounds.
- `crossing` returns the **first** crossing, which is the honest answer to "when did it
  disappear", and the rest in `again`, which the card reports to the reader rather than
  hiding.
- With no `span` (rows 1 and 2, constant horizon) g is monotonic and one bisection is
  still exact.

### The solver and the pin are one walk

`lookup` and `blocker` both call `exactAt`, memoised by twentieths of a degree. The sun
sets on one exact bearing, which is almost never one of the sampled rays. Reading the time
off an interpolation between the two nearest rays while putting the pin on the real walk
had them **0.22 degrees apart in the Alps, about a minute**, with the card and the row
contradicting each other on screen.

The chart's marker is still placed on the **drawn** (sampled) curve via `drawnAt`, because
a marker floating off its own ridge is what looks broken. The note and the spot card
report the exact figure.

---

## 7. State and storage

Two `localStorage` keys. Nothing else, no server, no account.

### `cjHorizonV1`

```js
{
  lat, lon,              // numbers
  elev,                  // metres, or null meaning "let the map fill it in"
  eye,                   // metres above the ground, ships at 0
  eyeDefaultVersion: 1,  // migration flag, see below
  tz,                    // IANA zone name
  tzMode,                // "auto" (from the coordinates) or "manual"
  units,                 // "feet" (default) or "metres"
  addr, place,           // what was typed, and what the geocoder named
  date,                  // yyyy-mm-dd
  sky,                   // "rise" or "set", which half the chart is showing
  read: {                // the last reading, about 20KB. Never the tiles, which are MB
    at, tiles, base, when,
    west: bare(profile.west),
    east: bare(profile.east)
  }
}
```

**Heights are stored in metres always**, whatever the display units. `heightDisplays`
tracks the strings shown so that switching units, changing the date or refreshing cannot
shift the canonical elevation through repeated rounding.

`bare()` strips the closures; `reviveSide()` puts them back on load. The page paints the
stored reading first and re-checks it quietly, and says so: a restored profile
interpolates between rays where a live one walks the exact bearing, so it lands about
0.08 degrees out, roughly 27 seconds. The message says the reading was rebuilt from the
saved profile rather than presenting it as freshly measured. **A date already past is not
restored**, because a stale yesterday on a zmanim page is worse than landing on today.

`save()` refuses to write while `validInputs()` is false, so a half-typed coordinate
cannot replace the last usable location.

**`eyeDefaultVersion`** is the migration pattern this project uses, the same idea as
`LEGACY_*` in the zmanim repo. The box used to ship at 1.7 m and now ships at 0. A stored
1.7 with no flag is almost certainly the old default nobody touched, so it is carried
forward to 0 once. Anything else that was typed is left alone. Use this shape for the next
default that changes.

### `cjHorizonRecentSearchesV1`

An array of up to 10 `{ name, query, lat, lon }`, newest first, deduped on coordinates to
5 decimal places (`recentKey`). Each has a remove button. `validRecent` rejects anything
malformed, and a `null` history with an old single saved place migrates that place in once.

---

## 8. The screen

### Layout

Coordinates, units and the two height boxes live inside nested `<details>`:
`#locationControls` > `#settings`. The address box, GPS and recent searches are above
them. This is deliberate: the common case is an address, and the numbers are for when you
want them. The layout suite asserts **both headline times are on the first phone screen**
at 375, 393, 412 and 1280px.

### The result cards

Each of `#riseBox` and `#setBox` holds a headline time (`#riseMain` / `#setMain`) with a
"N min earlier/later than sea level" line under it (`#riseChange` / `#setChange`), then a
three-row table inside `#comparison`:

| row | horizon used |
| --- | --- |
| Sea level | 0, "what a luach prints" |
| Height correction | `-dip` |
| Adjusted for the ground | the measured skyline |

**The skyline row is the headline and the sea level row is the comparison under it.** That
is the current arrangement and it was asked for.

Where a row has no answer it says "No crossing" rather than a time, and a note explains
that the sun stays above or below that horizon for the whole solar half-day. Where there
are extra crossings a second note names the first, the count and the last.

### Units

`#units` switches feet (default) and metres. The handler reads the fields, converts
`state.elev` and `state.eye` through `METRES_PER_FOOT`, rewrites both boxes from the
canonical metres and relabels everything (`updateUnitLabels`). Distances in the spot card
go through `distanceText`, miles or km to match.

### Time zones

`#tz` is every zone `Intl.supportedValuesOf("timeZone")` offers. **It follows the
location**: `locationZone()` runs `tzlookup(lat, lon)` from the vendored tz-lookup 6.1.25
dataset, purely local, no API. Picking a zone by hand sets `tzMode = "manual"` and reveals
`#zoneAuto`, a "use the location's zone" button. Daylight saving comes from `Intl`.

`clock()` formats 12 hour with **seconds kept**: the whole point here is a difference of a
minute or two, and a reading that rounds that away is no use. Newer ICU puts a narrow
no-break space before AM, which is invisible and then surprises anything that measures or
matches the string, so it is normalised away.

`todayStr()` is **today where the location is**, not where the browser is. At 23:25 UTC
looking at Chamonix it is already tomorrow there, and the page is right to say so. A test
of mine once asserted otherwise and the test was wrong.

### The reading happens by itself

`askRead` debounces 280 ms, because typing a latitude and then a longitude is two change
events and one move. It fires on anything that moves the observer: a recent search, the
GPS button, a picked address, typed coordinates, a corrected height, and the location the
page opens on. Three guards:

- `placeKey` skips a reading for a place already in hand, and **deliberately does not key
  on the elevation box**, which the reading itself fills in. Keying on it made every
  reading look like a change and ask for another.
- `readSeq` drops the answer for a place already left, so a slow read cannot overwrite a
  newer one.
- A new **date** sends for nothing, since the ground has not moved, unless `patchMissed`.

`#run` stays as a forced refresh. Failures are said in the status line under it, never in
an `alert`: this runs on its own now, and a box you have to dismiss every time you move is
worse than the thing it reports.

### The page never writes into a focused field

The elevation box is filled in from the map. A reading landing while somebody was typing
in it destroyed the selection, so their keystrokes landed *after* the page's figure: a
typed `1000` came out as `27.41000`. It went wrong about one attempt in seven and was found
only by instrumenting every write to that box. Two guards:

```js
if (elevAuto && el("elev").value === "" && document.activeElement !== el("elev")) { ... }
```

plus `elevAuto` going false on the first **keystroke** rather than on blur.
`auto-test.mjs` holds the tiles back and types into the box mid-reading on purpose, rather
than leaving it to whoever wins a race.

### The height above ground ships at 0, and it is a sharper knob than it looks

Measured at Lakewood on 30 September: at 0 the sun sets behind a **1.6 m rise 90 m away**
and shkia is 6.4 minutes early; at 1.7 m the blocker jumps to the 44 m hill 3.15 km out and
it is 1.6 minutes. Both are arithmetically right. The first is not trustworthy: a tile
pixel is about 19 m across with several metres of vertical error, and the model is bare
earth with no buildings and no trees, so a small rise just down the road is the least
knowable thing the data holds. The spot card therefore warns whenever the blocking ground
is within 300 m.

### The address box

Nominatim, OpenStreetMap's own geocoder: free, no key, answers a browser directly. Its
terms ask for no more than a request a second and no bulk use, so the lookup runs **only
on a deliberate press or an Enter, never on a keystroke**. It is a convenience above the
real input: when it cannot be reached, the message points back at latitude and longitude
rather than reading as a dead end. The example in the box is a made-up street, not
anybody's house.

---

## 9. Tests

Ten Playwright suites in `../tests/`, 712 checks, all green at `5bda89f`.

```sh
cd tests && npm ci
python3 -m http.server 8175          # from the repo root, another shell
CJ_BASE_URL=http://127.0.0.1:8175 node horizon-test.mjs
```

| file | checks | covers |
| --- | --- | --- |
| `horizon-test.mjs` | 27 | the solar arithmetic, the dip, the terrain read, the chart |
| `feat-test.mjs` | 35 | address lookup, the map pin, the explainer |
| `auto-test.mjs` | 22 | reading by itself, and typing into a field mid-read |
| `keep-test.mjs` | 25 | surviving a refresh and going offline, the labels, a deliberate 1.7 m |
| `addr-test.mjs` | 34 | address and place persistence, recent search order, reuse, removal |
| `accuracy-test.mjs` | 391 | 11 locations x 12 months against the NOAA engine, DST, polar, invalid input |
| `layout-test.mjs` | 116 | both headline times on the first phone screen at 4 widths, overflow |
| `usability-test.mjs` | 45 | feet by default, unit conversion, metric migration, location zones |
| `notch-test.mjs` | 6 | multiple crossings: the first is reported and the rest are named |
| `icon-check.mjs` | 13 | the icon, the naming, and that the header mark is not a link |

Two environment facts that will cost you an afternoon if you do not know them:

- **The browser.** `pw.mjs` looks for a Chromium already on disk (`CJ_CHROME`, then
  `/opt/pw-browsers/...`) before letting Playwright find its own, because a container
  usually ships a build whose number does not match the installed Playwright.
- **The map tiles.** A sandbox normally cannot reach AWS. The suites intercept tile
  requests with `ctx.route` and fetch the bytes with `curl`, caching under `tests/tiles/`.
  Use **async `execFile`**: a synchronous curl inside a route handler blocks Node's event
  loop, which is also Playwright's, and the page hangs waiting for a tile that is waiting
  for the loop.

`accuracy-test.mjs` and four assertions in `horizon-test.mjs` need `zmanim-tool` checked
out beside this repo:

```sh
git clone https://github.com/cheskyshain-stack/zmanim-tool.git    # beside my-tools
```

Nominatim is also unreachable from a sandbox, so the address path is tested against a
stubbed response that exercises the parsing, the list and the pick. **Nothing here has
ever confirmed the live geocoder answers.** Only a real browser can say that.

---

## 10. Do not undo these

Each one is a bug that shipped, was measured, and was fixed. They all look like
simplifications.

1. **Refraction in two places.** Ridge ray gets `K_REFRACT`; sun ray gets `refractionAt`.
   Different rays.
2. **One equation for bearing and time.** Not a fixed-point loop over the two.
3. **The first crossing, not whichever one a bisection brackets.** 1 min 41 s at Chamonix.
4. **Only a 404 is water.** Everything else fails the whole reading.
5. **Null outside the measured window.** Never clamp to the nearest edge.
6. **56 degrees of half-width.** A narrow window fails silently.
7. **Never write into a field that has the focus.**
8. **The solver and the pin call the same `exactAt`.**
9. **Heights are stored in metres**, whatever is displayed.
10. **The terrain row is not a halachic headline.** Keep the caveats on screen.

---

## 11. Known limits, stated honestly

Somebody asked whether the tool computes the exact second-by-second 3D intersection of the
sun's path with the terrain, and whether it confirms open sky was not available a minute
earlier at a slightly different bearing. The honest answers:

- **It does solve the moving sun against the bearing-dependent skyline as one equation**,
  and since the crossings fix it does report every crossing, not just one. So the second
  half of that question is now "yes, and it tells you".
- **It is bare earth.** No buildings, no trees, no vegetation. In a town that is the
  dominant error.
- **A tile pixel is about 19 m** at zoom 13 and coarser further out, with several metres of
  vertical error. Nearby obstructions are the least knowable thing here, which is why the
  card warns under 300 m.
- **It samples bearings at 2 degrees** and walks the exact solved bearing only once the
  bearing is known. A notch narrower than that can be missed.
- **It stops at 65 km.** Beyond that, ground would have to be implausibly high to matter at
  these latitudes.
- **Refraction is a standard model, not a measurement.** Real refraction at the horizon
  varies with temperature and pressure by more than the minute this tool is arguing about.
- A restored (not freshly read) profile is about 0.08 degrees, roughly 27 seconds, out, and
  says so.

The test suite checks numerical consistency and map behaviour. **It does not check a
measured sighting of the sun**, and nobody should claim it does.

---

## 12. House rules

These are the owner's, not negotiable, and they apply to replies as much as to code.

1. **No em dashes.** Anywhere: interface, comments, commit messages, replies. Use a comma,
   a colon, parentheses, or two sentences. The codebase was swept once to remove them.
2. **Verify in a real browser. Do not reason about it.** Measure with
   `getBoundingClientRect`, then say what you measured. Several confident conclusions in
   this project's history were wrong and had to be retracted.
3. **Check 375 to 412px.** No horizontal overflow, on every screen.
4. **No console errors.** The suites assert it.
5. **Serve on a fresh port** for every round of testing.

The owner is direct. If they say a fix did not work, believe them and go and measure,
rather than explaining why it should have. They test on an Android phone, so mobile is not
an afterthought. They care about what appears on the screen, not about the shape of the
code.

---

## 13. Things deliberately not built

Not oversights, so do not "fix" them without asking:

- **No server, no account, no sync.** Everything is in `localStorage` on one device.
- **No weather, pressure or temperature input** for refraction. It would imply a precision
  the terrain data cannot support.
- **No ignoring of close ground** beyond the warning. It was offered and not taken up: a
  200 m floor was discussed, the card's warning shipped instead.
- **No halachic labelling.** No "shkia" verdict, no comparison with a published luach.
