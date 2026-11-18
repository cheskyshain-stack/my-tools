# Birthday countdowns

`/birthday/` is a static, self-contained tool linked from the portal's Tools tab.
People can add, edit and remove multiple annual countdowns in the English
(Gregorian) or Hebrew calendar. Birth year is optional and enables the age display.
Cards sort by the next date, and removals have Undo. The main screen contains
compact rows with a name, countdown, English/Hebrew toggle, Delete button and the exact target date in both calendars. Tapping that date opens its verification form. The Set up button opens a native modal
with all dates, ages, adjustments, adding, editing and removal controls. The form
starts hidden, including for an empty list. Saving returns to the countdowns;
Done or Escape closes setup and preserves an unfinished draft for reopening.

Countdowns end at midnight at the start of the birthday's daytime date, in the
device's time zone. Whole months use the selected calendar, anchored to the
current date/time, and clamp the day to the last day of a short target month.
The remaining elapsed time is divided into 24-hour days, hours and minutes, so
daylight saving can change the hours shown. With at least one month remaining,
cards show months, weeks and remaining days. Under one month, hours and minutes
also appear. Zero month, week and day units are omitted. The last minute says "Less than 1 minute".

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

Every saved record keeps the originally entered calendar, day, month and year.
`viewCalendar` changes only the displayed anniversary. `birthdayIn()` converts from
that original birth date, never from a future occurrence. Both a known birth year
and a verified `birthTime` are required for the other calendar. Missing information
opens the existing record for verification without changing its entered date.

`birthTime` distinguishes daytime, after sunset but before midnight, and after
midnight but before sunrise. Only the middle case shifts the corresponding Hebrew
date forward or the corresponding English date backward. An originally entered
English date remains unchanged. Both actual birth dates are shown for verification
in setup; both target dates are visible on the compact countdown row.

V1 records stay in the same storage key. Older entries without `birthTime` open
their first verification form once, tracked by `cjBirthdayNightReviewV1`; the
birthday records themselves are not rewritten until saved. A Check saved dates
button remains while information is missing. Each person's selected calendar is
remembered. Delete on the row or in setup removes the whole birthday, and Undo
restores the original date and selected view.

Data lives only in `localStorage.cjBirthdayCountdownsV1` on that browser/device;
there is no account, server, cross-device sync or birthday data in the URL. The
tool listens for updates from other tabs. Names render as text. Storage read/write
failures leave the calculator usable and show the saving limitation.

Run `npm run test:birthdays` in `tests/`, with the site served on a fresh port and
`CJ_BASE_URL` pointing to it. The three suites check independent date conversion,
Adar/short-month/February behavior, validation, optional years, multiple entries,
editing, removal/Undo, reload persistence, month/minute/midnight rollover while
typing, DST and short-month arithmetic, hidden setup, modal keyboard dismissal,
other-tab updates, direct/portal navigation and measured main/modal geometry at
375, 393, 412 and 1280px. No calendar or location API is used. Saved V1 birthday
records remain compatible; this interface update does not rewrite them on load.
The switching suite also verifies original-date preservation, known birth-year
conversion, both night cases, one-time review of legacy records, direct deletion,
Undo and compact rows (including four time units) at phone and desktop widths.
