# Weather history

`/sunset-weather/history/` is a saved study view within Sunrise & Sunset Weather.
It shows the four largest earlier/later changes found, an SVG time-series graph,
year selection, line visibility controls, and date inspection with regular and
weather-adjusted clock times. It shares the calculator's icon and manifest.
The calculator links here; the page also works directly and in the portal iframe.

The current study covers the 08701 ZIP reference point (40.0754169, -74.2122167)
from November 17, 2021 through November 16, 2026. It is incomplete: 1,711 of
3,652 events have a result, 1,939 await data, and two could not be calculated.
The four values are provisional. There are no live weather requests from this page.
This page does not resume the archive download or imply that it has completed.

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
