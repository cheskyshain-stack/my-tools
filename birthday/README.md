# Birthday countdowns

`/birthday/` is a static, self-contained tool linked from the portal's Tools tab.
People can add, edit and remove multiple annual countdowns in the English
(Gregorian) or Hebrew calendar. Birth year is optional and enables the age display.
Cards sort by the next date, and removals have Undo. The main screen contains
only each person's name and countdown. The Set up button opens a native modal
with all dates, ages, adjustments, adding, editing and removal controls. The form
starts hidden, including for an empty list. Saving returns to the countdowns;
Done or Escape closes setup and preserves an unfinished draft for reopening.

Countdowns end at midnight at the start of the birthday's daytime date, in the
device's time zone. Whole months use the selected calendar, anchored to the
current date/time, and clamp the day to the last day of a short target month.
The remaining elapsed time is divided into 24-hour days, hours and minutes, so
daylight saving can change the hours shown. With at least one month remaining,
cards show months and days. Under one month, they show days/hours/minutes and
hide leading zero units. The last minute says "Less than 1 minute".

On the birthday date the card celebrates all day, then advances to next year's
occurrence after midnight. A one-second timer plus focus, visibility and
pageshow checks update the displayed units without touching form fields or
moving focus. Timer regions do not announce every update to screen readers.
Hebrew birthday details in setup state the previous evening, when the birthday
begins at sunset, and explicitly explain the midnight target. No location is
requested and the app does not claim an exact sunset countdown.

The inline Hebrew forward calendar and Rosh Hashana calculation come from the
owner's `zmanim-tool/js/hebrew-calendar.js`. Reverse conversion indexes actual
dates between successive Rosh Hashana dates. It deliberately does not reuse that
repository's `dateFromHebrew`, whose leap-year Adar conversions did not round-trip
when checked during development. The other repository was left unchanged.
Tests cross-check 5,648 dates across 1900-2100 against native `Intl` Hebrew dates
and check that those dates round-trip through the index.

Regular Adar defaults to Adar II in a leap year, with an Adar I option. Explicit
Adar I/II birthdays use Adar in common years, except 30 Adar I uses 30 Shevat.
Missing 30 Cheshvan/Kislev dates use day 1 of the next month. Cards disclose these
adjustments. February 29 can use February 28 (default) or March 1. An entered birth
year must actually contain the date and must not be in the future. Age follows
the calendar selected for that birthday.

Data lives only in `localStorage.cjBirthdayCountdownsV1` on that browser/device;
there is no account, server, cross-device sync or birthday data in the URL. The
tool listens for updates from other tabs. Names render as text. Storage read/write
failures leave the calculator usable and show the saving limitation.

Run `npm run test:birthdays` in `tests/`, with the site served on a fresh port and
`CJ_BASE_URL` pointing to it. The two suites check independent date conversion,
Adar/short-month/February behavior, validation, optional years, multiple entries,
editing, removal/Undo, reload persistence, month/minute/midnight rollover while
typing, DST and short-month arithmetic, hidden setup, modal keyboard dismissal,
other-tab updates, direct/portal navigation and measured main/modal geometry at
375, 393, 412 and 1280px. No calendar or location API is used. Saved V1 birthday
records remain compatible; this interface update does not rewrite them on load.
