# Tests

Browser tests, because every bug in this repo that mattered was a browser bug. They
drive the real pages in a real Chromium and assert on measured values, not on what the
code looks like.

## Running them

```sh
npm ci                                  # in tests/, package only, not browsers
python3 -m http.server 8175               # from the repo root, in another shell
CJ_BASE_URL=http://127.0.0.1:8175 node horizon-test.mjs
```

Serve on a **port you have not used before in this session**. Reusing one gets you a
cached page and a false pass.

Two things that are not obvious:

- **The browser.** `pw.mjs` looks for a Chromium already on disk (`/opt/pw-browsers/...` or `/usr/bin/chromium`)
  before letting Playwright find its own, because a container often ships a build whose
  number does not match the Playwright version installed. Set `CJ_CHROME` to override.
- **The map tiles.** `horizon/` fetches elevation tiles from AWS, and a sandbox usually
  cannot reach them. The suites intercept those requests with `ctx.route` and fetch the
  bytes with `curl`, which normally can get out, caching them under `tests/tiles/`. Fetch
  them with **async** `execFile`: a synchronous curl inside a route handler blocks Node's
  event loop, which is also Playwright's, and the page hangs waiting for a tile that is
  waiting for the loop.

Every suite accepts `CJ_BASE_URL`, so a fresh port needs no source edits.
`tiles.mjs` shares the asynchronous tile fetch logic. Only an actual HTTP 404 is
served as water; a timeout, error status or invalid PNG fails the test. Successful
downloads are cached atomically; failed downloads are never cached as water.

## What each one covers

| file | checks | covers |
| --- | --- | --- |
| `horizon-test.mjs` | 27 | the solar arithmetic, the elevation dip, the terrain read, the skyline chart |
| `feat-test.mjs` | 35 | address lookup, the map pin on the blocking ground, the explainer dropdown |
| `auto-test.mjs` | 22 | reading the ground automatically, and typing into a field mid-read |
| `keep-test.mjs` | 25 | surviving a refresh, surviving offline, the field labels and a deliberately entered 1.7m height |
| `addr-test.mjs` | 34 | address and place persistence, recent search ordering, reuse, removal, empty history and another tab |
| `icon-check.mjs` | 13 | the icon, the naming, and that the header mark is not a link |
| `accuracy-test.mjs` | 391 | 11 locations through all 12 months, 1000m height corrections, US/Israel daylight saving, polar conditions, invalid input and Today in the selected time zone |
| `layout-test.mjs` | 116 | both main skyline times on the initial phone screen, collapsed comparisons and chart, long recent addresses, keyboard removal, expanded controls, height changes, both skyline views and portal navigation at 375, 393, 412 and 1280px |
| `usability-test.mjs` | 45 | default feet, physical height preservation when changing units, saved metric height migration, ground elevation differences, skyline headline consistency and location time zones with a persistent manual override |

`horizon-test.mjs` cross-checks the sea level sunrise and sunset against
`zmanim-tool/js/zmanim/solar.js`, the NOAA engine ported 1:1 from the workbook the shul
prints its boards from. If that repo is not checked out beside this one, those four
assertions are skipped and the rest still runs.

The expanded `accuracy-test.mjs` requires that reference checkout and fails if it is
missing. To obtain it, clone `https://github.com/cheskyshain-stack/zmanim-tool.git`
beside this repository. Run all nine suites for a full Horizon regression check.

The page defaults to feet and miles. Stored heights and the terrain engine remain
in metres. The original physical reference cases explicitly select metres; the
usability suite checks the feet inputs, conversions and migration separately.
Map heights retain their unrounded values in storage, so changing display units
or dates cannot shift the reference elevation through repeated rounding.
Location time zones use the embedded `tz-lookup` 6.1.25 dataset (CC0-1.0), with
browser `Intl` applying daylight saving. No time zone API request is needed.

The October 2026 browser check compared 264 sea level times with that engine, with a
largest displayed difference of 1.003 seconds. The 72 elevated times differed by at
most 1.357 seconds (the engines use slightly different earth radii). The terrain
checks used real AWS tiles: Chamonix on September 30 loses 73.58 minutes of sunset
and delays sunrise by 179.80 minutes; Lakewood at 1.7m above ground loses 1.57
minutes of sunset. These check numerical consistency and map behavior, not a
measured sighting of the sun. Atmospheric refraction, map error, trees and buildings
still limit physical accuracy, especially for nearby obstructions.

## Several of these exist because of a specific bug

Do not delete them without understanding what they caught:

- the sun's marker drawn off the ridge it was setting behind, from solving the bearing
  and the time separately instead of as one equation
- a ridge to the **west** applied to **sunrise**, from clamping a lookup to the nearest
  edge of the window it was measured in
- a confident "nothing is in the way" when offline, because a tile that failed to fetch
  was read as sea level
- a typed `1000` becoming `27.41000`, because the page wrote into a field while somebody
  was typing in it
