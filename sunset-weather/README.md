# Sunrise & Sunset Weather

A separate sea-level sunrise (netz) and sunset comparison at `/sunset-weather/`. It does not change
Horizon or read terrain tiles. Search by ZIP code, street address or town using
Nominatim, or choose device geolocation. The selected coordinates determine an
IANA time zone using the same embedded CC0 tz-lookup dataset as Horizon.

The frontend is self-contained in `index.html`. Serve the repository root; there
is no build step. The icon PNG is rendered from the accompanying original SVG.

## What is calculated

- Standard sunrise and sunset: Sun's upper limb at a flat sea-level horizon, with a fixed
  16-arcminute radius and 34 arcminutes of refraction.
- Weather adjusted: the same geometry and solar radius, with refraction found
  by tracing a ray through current weather-model atmospheric profiles in the event's direction.
- Difference: adjusted minus standard in seconds, from the actual instants.
  Displayed instants are rounded to the nearest second.

Solar position is the existing project's NOAA calculation. Each event is matched
to the selected civil date in the location's time zone, including date-line cases.
Each standard/adjusted pair shares its solar half-day: morning for sunrise and
evening for sunset. If the adjusted instant crosses local midnight, its actual
date is shown rather than comparing events from different days.

## Atmospheric data and the added path requirement

The owner explicitly requested temperature and pressure throughout the light's
atmospheric path, including changes away from the observer. Do not replace this
with a local-temperature/pressure scaling while calling it a path calculation.

Open-Meteo's `/v1/gfs` endpoint with `models=gfs_global` supplies current NOAA GFS
data at eight positions along each event's bearing: 0, 25, 75, 150, 300, 500, 750 and
1000km. Sunrise uses its own eastern path; sunset uses its own western path.
Each position requests elevation 0. Both near-surface temperature and
sea-level pressure are displayed, but the calculation also requests temperature
and geopotential height at 27 pressure levels, from 1000 to 10 hPa.

Underground pressure levels are excluded. Geopotential heights are converted to
spherical geometric heights. Temperature is interpolated linearly with height,
pressure logarithmically, and refractive index linearly between horizontal
columns. The visible layer table lets readers inspect every requested column.

The data are model estimates, not measurements everywhere along the ray. All
columns must be present, valid, time-aligned and within three hours of the browser
clock. Missing layers, invalid units, invalid pressure, stale weather or service
errors make that path's adjusted result unavailable. Standard times remain calculable,
and a failure in one direction does not discard the other direction's valid result.
There is no silent fallback to local weather or standard conditions.

## Ray calculation

Each sea-level ray starts horizontally in the vertical plane toward its event. With
Cartesian position `r`, direction unit vector `u` and refractive index `n`, the
equation is `du/ds = (grad(n) - u*(u dot grad(n))) / n`. The code integrates its
two-dimensional angular form with RK4 on a spherical Earth of radius 6371008.8m.
Both vertical and along-path horizontal gradients enter the equation.

Standard dry-air dispersion at 550nm uses the Ciddor standard-air coefficients,
followed by ideal-gas pressure/temperature density scaling. This is not the full
humid-air Ciddor formulation. Do not use radio-frequency wet refractivity here.

The highest supplied weather pressure level is 10 hPa, generally around 30km high.
Above it, an isothermal hydrostatic tail with inverse-square gravity is extrapolated.
Beyond the last horizontal position, the final column is extended. Integration
stops around 80km altitude. The tail, finite spatial coverage and missing small
inversions are disclosed in the UI. The result must not be described as a complete
3D measurement of the entire atmosphere or as guaranteed observed-sunset accuracy.

Each standard event gives its initial path bearing. After tracing, the computed
adjusted event supplies an updated bearing; profiles are re-requested if it
differs by more than 0.2 degrees, for at most three passes. Failure to settle, a
ray returning below the sea-level surface, or failure to reach the upper
atmosphere is reported as unavailable instead of inventing a time.

The model ignores cross-plane gradients, humidity, clouds, aerosols, wave heights,
fine-scale inversions and resolved image/mirage structure. It is an estimate and
has not been validated against observed sunrise or sunset recordings.

## Dates, timestamps and persistence

The user selects the astronomical date. The atmosphere is always current. Past
and future dates are prominently marked as what-if estimates using today's
conditions, not historical observations or a forecast for that date. Changing
the date fetches both directional atmospheric paths.

Weather reading is `current.time`, requested as a UTC Unix timestamp. Last fetched
is the retrieval time. They are formatted independently in the location's IANA
zone. Do not label the reading time as a station observation or model-run publication
time. Open-Meteo derives its current data from model fields.

Selected place, date and the chosen weather-view direction are stored under `cjSunsetWeatherV1`.
Weather is fetched fresh on reload. A manually chosen date persists; Today keeps
following today's date at the selected location. Other tools' storage is untouched.
While visible, the page refreshes atmospheric data every fifteen minutes, including
after returning from another tab when the previous retrieval is old enough.
The weather panel's east/west buttons select which path's temperature, pressure,
timestamps and layer table are displayed. This does not change the result cards;
both sunrise and sunset are always shown.

## Validation

From `tests/`, with a fresh server at the repository root:

```sh
CJ_BASE_URL=http://127.0.0.1:8193 npm run test:sunset
```

`sunset-model-test.mjs` checks vacuum and uniform-index rays, an independent
spherical Snell-invariant integral for exponential refractivity, integration step
convergence, failure for a ray bending into the surface, and sensitivity to remote
temperature changes with identical local temperature and pressure.

`sunset-weather-test.mjs` checks ZIP/address/GPS flows, layer coverage and sources,
timestamp handling, independently unavailable paths, date persistence, civil dates
and daylight saving, reference-engine sunrise/sunset times, mobile/desktop layout
and portal history. It also checks that eastern and western requests differ, and
that stronger refraction moves sunrise earlier and sunset later.
The separate `zmanim-tool` checkout is required beside this repository for the
independent reference calculation, as in the existing Horizon accuracy suite.

Live provider checks should also exercise the real API through the browser.
Passing numerical and browser tests does not establish real-world precision to
the second; the visible caveat about observed sunset must remain.

Scientific references: [NIST standard-air dispersion coefficients](https://emtoolbox.nist.gov/wavelength/EquationA22.asp),
[SDSU temperature profiles and refraction](https://aty.sdsu.edu/explain/thermal/thermal.html),
[USNO sunset conventions](https://aa.usno.navy.mil/faq/RST_defs), and
[Open-Meteo GFS data definitions](https://open-meteo.com/en/docs/gfs-api).
