# Catering Planner

An offline-capable tool at `/catering/`. The portal card is in the personal tools
group, revealed by three clicks on the home logo. Customer records never enter
the repository or a server. The app stores one device's records in
`localStorage.cjCateringV1`, plus a previous readable copy in
`cjCateringLastGoodV1`. Full JSON backup/restore and a per-booking CSV download are
provided. Restore validates the complete data before replacing anything and
downloads the old readable records first. Unreadable stored data is preserved
instead of silently starting over.

## Supply rules

The starter rates are transcribed from Sheet3 of the supplied `template.xlsx`.
Sheet1 supplies matching prices and package sizes. The workbook's customer
sample, phone number, address, unrelated numbers, and original broken formulas
are deliberately absent. Empty or unexplained zero prices are unknown, not free.
The kiddush herring rate of three 2 lb containers per table conflicts with the
other sheet's example; the template review notice explicitly asks the owner to
confirm it. Zero-rate paper goods remain editable but inactive. Items with no
per-table rule in the workbook, such as service fees and event-wide food, must
be deliberately added using the Event basis.

Regular, kids, and head counts are separate and add up to dining tables. Coffee
stations are additional. An item may alternatively use only one table type,
an adult/child/all-guest count, or once per event. Required units are retained
at their calculated precision. Purchase packs round up, and cost is pack count
times price per pack. Unpriced rows make the estimate explicitly incomplete.

Neighborhoods replace selected template rates. A booking snapshots its template
and neighborhood rates, pack sizes, and prices. Later template edits never
rewrite a booking. Editing its event type/neighborhood or explicitly requesting
a refresh replaces those snapshots and clears booking overrides. Changing
counts recalculates supplies using saved rules and clears packing checks for
changed quantities. A booking can override total units and pack prices without
touching its template. Zero overrides are available under omitted items so they
can be reversed. Feedback records shortages and leftovers in units and never
changes a template automatically.

## Offline behavior

`sw.js` controls `/catering/` only. It precaches the HTML, manifest, icon, logo,
and shared CSS/refresh script. It does not claim the portal root or other apps.
“Ready offline” appears only after the worker becomes ready. Open the direct
URL once online and bookmark or install it. Records, calculations, editing,
feedback, and downloads work without a connection. Remote fonts are optional;
system fonts remain available offline. Clearing site data removes local records
and the local recovery copy, so keep downloaded backups separately. Devices do
not sync automatically.

When changing app resources, bump the cache version in `sw.js` so the worker
installs a coherent new set of core resources. Preserve every other tool's
storage and service-worker scope.

## Verification

Serve the repository root on a fresh port, then run:

```sh
cd tests
npm ci
CJ_BASE_URL=http://127.0.0.1:8847 node catering-test.mjs
CJ_BASE_URL=http://127.0.0.1:8847 node simcha-king-test.mjs
```

The suite uses real Chromium to check independent supply arithmetic, historical
snapshots, table types, neighborhood rates, event overrides, feedback, downloads,
restore, offline reopening and edits, storage corruption, print styles, all
sections/dialogs at 375/393/412/1280px, and portal Back/Forward. It also produces
a checklist PDF in the execution workspace's `/tmp` for inspection.
