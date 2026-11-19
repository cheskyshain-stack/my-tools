# Birthday countdowns

`/birthday/` is a static, self-contained tool linked from the portal's Tools tab.
People can add, edit and remove multiple annual countdowns in the English
(Gregorian) or Hebrew calendar. Birth year is optional and enables the age display.
Cards sort by the next date, and removals have Undo. The main screen contains
compact rows with a name, countdown, English/Hebrew toggle and the exact target date in both calendars. Hebrew target dates use Hebrew letters for the day, month and year,
including the correct Adar I/II and 15/16 numeral forms. They are isolated with
`bdi`, `dir="rtl"` and `lang="he"`. The target matching the selected calendar is
highlighted in the same color as its toggle. Tapping that date opens its verification form. The Set up button opens a native modal
with all dates, ages, adjustments, adding, editing and removal controls. The form
starts hidden, including for an empty list. Saving returns to the countdowns;
Done or Escape closes setup and preserves an unfinished draft for reopening.

English countdowns end at midnight at the start of the birthday date, in the
device's time zone. Hebrew countdowns end at the calculated sunset on the
evening before the Hebrew birthday's daytime date, in the selected location.
The card says Midnight or Sunset and shows the actual target date, plus the
sunset clock time for Hebrew birthdays. Its time element and data-target contain
the real UTC start instant; data-date retains the birthday's daytime civil date.
The verification form and tooltip also include sunset seconds and the location.

Whole months use the selected calendar and clamp short target months. English
months preserve the current device clock time. Hebrew months preserve the time
elapsed since the opening sunset within the current Hebrew date. The candidate
month's opening sunset plus that elapsed time is the month anchor. This keeps
month/day boundaries consistent with Hebrew days beginning at sunset.
The remaining elapsed time is divided into 24-hour days, hours, minutes and seconds,
so daylight saving can change the hours shown. Cards show months, weeks and
remaining days on one line and hours, minutes and seconds on the next, including
distant birthdays. All unit numbers and labels use matching sizes. Zero month,
week and day units are omitted; hours, minutes and seconds stay visible, with
two-digit minutes and seconds. Under one day only the clock line remains.

An English birthday celebrates until the next midnight. A Hebrew birthday
celebrates from its opening sunset until the following sunset, then advances
immediately to next year's occurrence. The effective Hebrew date advances at
sunset rather than at midnight. A one-second timer plus focus, visibility and
pageshow checks update the displayed units without touching form fields or
moving focus. Timer regions do not announce every update to screen readers.
Hebrew birthday details state both the daytime date and the previous evening.
English minutes and seconds usually match across birthdays because every
English target is midnight. Hebrew targets vary with the date's sunset.

Sunset defaults to the owner's selected location, Lakewood, NJ (08701), at
40.0754169, -74.2122167, America/New_York. Set up contains a sunset-location
section with ZIP/address/town search, Use my location and a Lakewood preset.
A compact location link appears above the cards when a Hebrew view is selected.
The location applies to all Hebrew countdowns and saves independently in
localStorage.cjBirthdaySunsetPlaceV1, without rewriting any birthday records.
Other-tab location changes are observed. Lookup/GPS failures keep the prior
location. GPS is requested only by pressing its button.

Sunset uses NOAA solar terms and two-pass refinement, matching the owner's
zmanim-tool solar.js engine with the standard 5/6-degree sea-level horizon.
No terrain or current-weather correction is applied. The local civil day is
matched using the location's IANA time zone, including DST and date-line cases.
Sunset values are cached locally in memory; there are no weather or solar API
requests, and ticking the timer does not fetch anything. Missing polar sunsets
are reported as unavailable, with no silent midnight substitution.

Location search uses Nominatim only on a deliberate submit, spaced by at least
1.1 seconds. Lakewood/08701 selection is local. GPS coordinates and search results
use vendored tz-lookup 6.1.25 (CC0-1.0, license in vendor/) for the IANA zone;
Intl applies that zone's calendar date and daylight-saving rules. The geocoder
is exercised with stubbed responses in the tests; the local Lakewood preset and
all solar calculations work without reaching it.

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
remembered. Delete appears only in setup beside Edit. It first opens an inline confirmation
for that named birthday, with Confirm delete and Cancel buttons. Nothing is
removed or written to storage until Confirm delete is pressed. Cancel gets focus
first; editing, closing setup or receiving another tab's update cancels pending
confirmation. Undo still restores the original date and selected view afterward.

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
375, 393, 412 and 1280px. No calendar or weather API is used. Saved V1 birthday
records remain compatible; this interface update does not rewrite them on load.
The switching suite also verifies original-date preservation, known birth-year
conversion, both night cases, one-time review of legacy records, confirmation, cancellation, closing setup without deleting,
Undo and compact rows with equally sized time units at phone and desktop widths.
The suites also check written Hebrew dates, selected-date highlighting after
switching and reloading, seconds ticking on distant and near birthdays without
moving focus, the final minute and birthday rollover.
The sunset suite checks 108 dates across nine locations against the independent
solar.js reference, including UTC date-line shifts. It checks sunset-to-sunset
celebration, exact boundary rollover, English midnight behavior, Hebrew month
anchors, unavailable polar sunsets, location search/GPS/error handling, persisted
locations, original-record preservation, focused drafts, four widths and portal
navigation. Numerical agreement with the reference is not a measured sighting
of the sun; real atmospheric conditions and visible obstructions can shift it.
