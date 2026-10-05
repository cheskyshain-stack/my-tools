# Tests

Browser tests, because every bug in this repo that mattered was a browser bug. They
drive the real pages in a real Chromium and assert on measured values, not on what the
code looks like.

## Running them

```sh
npm init -y && npm install playwright     # the package only, not the browsers
python3 -m http.server 8099                # from the repo root, in another shell
node horizon-test.mjs
```

Serve on a **port you have not used before in this session**. Reusing one gets you a
cached page and a false pass.

Two things that are not obvious:

- **The browser.** `pw.mjs` looks for a Chromium already on disk (`/opt/pw-browsers/...`)
  before letting Playwright find its own, because a container often ships a build whose
  number does not match the Playwright version installed. Set `CJ_CHROME` to override.
- **The map tiles.** `horizon/` fetches elevation tiles from AWS, and a sandbox usually
  cannot reach them. The suites intercept those requests with `ctx.route` and fetch the
  bytes with `curl`, which normally can get out, caching them under `tests/tiles/`. Fetch
  them with **async** `execFile`: a synchronous curl inside a route handler blocks Node's
  event loop, which is also Playwright's, and the page hangs waiting for a tile that is
  waiting for the loop.

## What each one covers

| file | checks | covers |
| --- | --- | --- |
| `horizon-test.mjs` | 25 | the solar arithmetic, the elevation dip, the terrain read, the skyline chart |
| `feat-test.mjs` | 33 | address lookup, the map pin on the blocking ground, the explainer dropdown |
| `auto-test.mjs` | 22 | reading the ground automatically, and typing into a field mid-read |
| `keep-test.mjs` | 21 | surviving a refresh, surviving offline, the field labels |
| `addr-test.mjs` | 15 | the address and the place name persisting |
| `icon-check.mjs` | 13 | the icon, the naming, and that the header mark is not a link |

`horizon-test.mjs` cross-checks the sea level sunrise and sunset against
`zmanim-tool/js/zmanim/solar.js`, the NOAA engine ported 1:1 from the workbook the shul
prints its boards from. If that repo is not checked out beside this one, those four
assertions are skipped and the rest still runs.

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
