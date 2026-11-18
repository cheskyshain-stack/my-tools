# Weather history

`/sunset-weather/history/` is a saved study view within Sunrise & Sunset Weather.
It shows the four largest earlier/later changes found, an SVG time-series graph,
year selection, line visibility controls, and date inspection with regular and
weather-adjusted clock times. It shares the calculator's icon and manifest.
The calculator links here; the page also works directly and in the portal iframe.

The study covers the 08701 ZIP reference point (40.0754169, -74.2122167)
from November 17, 2021 through November 16, 2026. Coverage is stored in `study.json`
and embedded in the page. The four values remain provisional while events are pending.
There are no weather requests from the browser.

The `Fill missing weather history` GitHub Actions workflow runs about every four hours
and can also be run manually. It uses `scripts/weather-history/update.mjs`, preserving
all saved outcomes. Only pending events enter the solver. Downloads, quota reservations,
retry times, and unfinished bearing refinements are saved in `checkpoint.json.gz`.
The workflow also saves an Actions cache before pushing, so a failed push can resume
without repeating successful requests. A conflict with an existing result stops the
job instead of overwriting that result. Calculation source changes stop the worker
for an explicit model review, rather than mixing model versions silently.

The free Open-Meteo service allows 600 weighted calls/minute, 5,000/hour, 10,000/day,
and 300,000/month. Variables and locations multiply the charge. The worker uses
conservative rolling caps of 480/minute, 4,000/hour and 7,000/day, and at most 1,000
weighted calls per run. HTTP 429 Retry-After and reset headers persist across jobs.
Network failures remain pending and back off 20 minutes; absent or invalid fields
back off six hours. The next scheduled job retries them. Successful hourly columns
are retained, including when another column or a later request fails.

Most original gaps were unfinished downloads after an hourly quota rejection; the
alternative bulk download also failed. They do not establish archive data absence.
Two original events had complete data but the ray returned to the surface:
November 27, 2022 sunset and December 16, 2022 netz. They remain unavailable and are
not retried on every quota reset. A deliberate model revision is needed to revisit
those outcomes. Null responses and network failures never become model failures or zero.

Run a bounded update locally with `node scripts/weather-history/update.mjs --budget 100`.
The worker uses Node 24, curl and Python's standard library, with no API key.
`ny-grid.json.gz` contains a regional crop of Open-Meteo's public NOAA GFS terrain
grids, used to match sea-level model cells consistently (13 km temperature, 25 km
pressure/layers). The initial selector was checked against 44,728 saved path points.
The worker reuses the calculator's physics and solar functions unchanged.
The workflow commits to `main` and explicitly requests a native GitHub Pages build:
GitHub token commits alone do not trigger branch builds. Hosting remains main/root,
with Cloudflare DNS only. Cache backup is recovery, not a separate data source.

The snapshot is embedded in the HTML to keep the results, graph and coverage
consistent. Missing and unavailable values are `null`, with distinct status codes.
They never become zero or a line joining the dates on either side. A real zero
adjustment remains a calculated result. Cards and coverage follow the selected
year. Extrema ties choose the first date for earlier shifts and last date for
later shifts, and disclose the other matching days.

Each `days` row is `[date, riseStandard, riseAdjusted, riseStatus, setStandard,
setAdjusted, setStatus]`. Instants are Unix seconds. Status 0 means pending,
1 means calculated, and 2 means model unavailable. Both times use the study's
America/New_York zone when displayed. All geometry is sea level and clear horizon.

To replace the snapshot from a future saved analysis:

```sh
python3 sunset-weather/history/update-data.py \
  --csv /path/to/incomplete-daily-comparison.csv \
  --details /path/to/incomplete-analysis-details.json
```

The updater checks unique/continuous dates, coverage, time-zone abbreviations,
null results and agreement between the stored differences and clock times. It
updates only the marked JSON block and the downloadable CSV. It does not calculate
new times. Keep the visible study status aligned with actual coverage and retain
the caveat about observed times. The reconstructed history uses archived NOAA
GFS hourly fields interpolated to the standard event time and the existing ray
tracer; it is not a recording of previous live-site output or observed sunsets.

Serve the repo on a fresh port and run `npm run test:sunset-history` from `tests/`.
The browser suite checks source values, ties, gaps, missing/unavailable/zero
results, interactive controls, keyboard/touch access, mobile geometry and the
calculator link within the portal. No new scientific calculation is introduced.

`npm run test:weather-history-update` uses temporary studies and fake weather responses
to test result preservation, process restarts, partial cache reuse, HTTP 429/reset
handling, network and null-field retries, rolling budgets, recovery after a failed
push and refusal to overwrite conflicting results. It makes no external requests.
