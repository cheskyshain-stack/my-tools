# Hours & Total

Paste a list such as `Monday 6, Tuesday 7.5, Wednesday 6, Thursday 5.5, Friday 5.5`.
An input event, including native paste, immediately parses the days and computes
the breakdown, total hours and grand total. No Calculate button is required.
The example is 30.5 hours and 610.00 at the default rate of 20.

Comma, newline and semicolon separators are supported, with full weekday names
and common abbreviations. Optional colons and hour suffixes are accepted. Days
are shown in Monday-to-Sunday order. Unknown or duplicate days and invalid hours
block the total rather than silently dropping an entry. Hours are decimal values
from 0 to 24 per day with up to two decimal places. This is not an HH:MM parser.

The adjustable rate is a nonnegative number up to 1,000,000, with two decimal
places supported. No currency is assumed. Hours and rates are parsed into integer
hundredths before arithmetic. Grand total is total hours multiplied by the rate,
rounded once to two decimal places. If rounding individual daily amounts creates
a discrepancy, a rounding-adjustment row reconciles the breakdown to that total.

Copy total writes only the grand total, with two decimal places and no grouping
commas, to the clipboard. It has a legacy copy fallback and a manual-selection
fallback if copying is blocked. Invalid or empty hours cannot copy a stale total.

Raw pasted text and rate are stored under `cjHoursCalculatorV1`, including an
incomplete edit so it can be corrected after a refresh. Other tools' storage is
untouched. Calculations do not send the hours to a service.

This is one self-contained HTML page with shared CJ styles and no build step.
The PNG icon is rendered from the original SVG. The home card links to `/hours/`.

Run `CJ_BASE_URL=http://127.0.0.1:<fresh-port> npm run test:hours` from `tests/`.
The browser suite tests the actual system clipboard paste/copy flow, example
amounts, rate changes, parsing failures, rounding, persistence, four viewport
widths, maximum supported totals, and clipboard use inside the portal iframe.
