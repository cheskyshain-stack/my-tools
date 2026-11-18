# Birthday countdowns

`/birthday/` is a static, self-contained tool linked from the portal's Tools tab.
People can add, edit and remove multiple annual countdowns in the English
(Gregorian) or Hebrew calendar. Birth year is optional and enables the age display.
Cards sort by the next date, and removals have Undo.

Countdowns count calendar days in the device's time zone. Day ordinals use UTC
representations of local year/month/day, so daylight saving does not add or remove
a countdown day. On the displayed birthday date the card celebrates all day; it
advances to the following occurrence after local midnight. A timer plus focus,
visibility and pageshow checks catch date changes without touching form fields.
Hebrew cards also state the previous evening, when the birthday begins at sunset.
They do not claim an exact sunset countdown or request location data.

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
editing, removal/Undo, reload persistence, midnight rollover while typing,
other-tab updates, direct/portal navigation and measured geometry at 375, 393,
412 and 1280px. No calendar or location API is used.
