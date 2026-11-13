# Simcha King

The workspace at /catering/ remains buildless HTML/JS on GitHub Pages. Its portal
card stays in the personal tools group. The header logo is decorative at the
owner's explicit request: tapping it must keep the current screen open.

## Records and supplies

State version 2 adds inventory, suppliers, purchases, and fees. The original
cjCateringV1 key and version 1 JSON backups are upgraded without deleting records.
Unreadable data is preserved; malformed backups never replace valid records.

Existing booking quantities and prices remain snapshots. Adding a new template
item defaults to appending it to matching OPEN bookings without replacing other
supplies, overrides or packing checks; the checkbox can be turned off. Completed
and cancelled bookings remain unchanged. Each booking also has Add supply for
custom or missing template supplies, plus Add missing template supplies without
a full refresh.

Starter quantities come from Sheet3 of the supplied workbook. Sheet1 supplies
matching package sizes and prices. Sample customer contact details and unrelated
figures are absent. Unexplained zero prices remain unknown. The template notice
asks the owner to confirm the conflicting herring portion of three 2 lb containers
per table. Review starter food portions and prices before real use.

Dining tables add regular, kids and head counts; coffee stations are additional.
Rules also support individual table types, adults, children, guests and once per
event. Purchases round up to whole packs. Missing prices make totals incomplete.
Service fees apply once. Waiter fees use count, per-event or hourly rates, hours,
and assignment notes. Calculated charges are supplies + service + waiters;
an agreed charge, if entered, controls the balance.

## Combined shopping and tablecloth shapes

Shopping list combines any selected parties. Use the next three/seven days, the
current Sunday-to-Saturday week, a custom inclusive date range, or all open
bookings. Uncheck individual parties or select all shown. Completed bookings can
be included explicitly; cancelled bookings are excluded.

Full combined supply list adds units before rounding once into purchase packs,
using the current catalog pack size and price. Items with different saved units
remain separate. Only what still needs buying deducts physical stock and confirmed
incoming orders due in time, accounting for earlier open bookings. Reusable stock
uses peak overlapping event/return dates. Issued stock stays unavailable until
returned. Service and waiter fees are excluded. Print and CSV include the selected
parties. Shopping checkmarks never change packing or inventory movements.

Selections and bought checks survive reopening offline. They are local in
device-only mode. Once company sync is activated, each approved editing login's
shopping plan also synchronizes with that login on other devices through the same
revision-controlled company document. Changing a shopping quantity requires a new
checkmark. Apply migrations 001 and 002 before activating shared accounts.

Each booking can choose round, rectangular, or mixed tablecloths. Mixed bookings
enter round dining tables; the remainder are rectangular. Regular, kids and head
tables are included. Round and rectangular cloths have separate inventory products,
prices and shopping totals. Set each product's actual pack size, price and opening
stock in Inventory. New shape prices start unknown rather than assuming that both
cost the same. Existing bookings keep their generic cloth snapshot until a shape
is selected. Cloth stock already issued locks the saved shape to preserve history.

## Inventory and supplier orders

Physical supplies link stable catalog IDs across templates and bookings. Set
opening counts, units, supplier, pack sizes, prices, reorder levels and locations.
Starter catalog entries still need opening counts. Stock units cannot change
after movements exist.

Stock on hand comes from a movement ledger. Counts record adjustments; packing
checks do not deduct stock. Issue stock supports partial dispatch and supplies
added later. Returns / damage records unused supplies, equipment returns and
losses. Damaged equipment already issued does not go back on hand. Issued stock
cannot exceed booking requirements; returns plus damage cannot exceed issues.

Open bookings reserve unissued requirements. Consumables reserve across open
bookings; reusable equipment reserves overlapping event/return dates only.
The inventory date picker selects reusable reservation dates. Stock already issued
is off hand and is not reserved twice.

Supplier purchases can be draft, ordered, partially received, received or
cancelled. Only ordered unreceived quantities count as incoming. Receipts use
UNITS and cannot exceed the purchase. Stock history and linked bookings must be
retained. The database enforces these rules inside each shared commit.

Assign supplier contacts to inventory, then create purchases directly or from a
booking. Booking drafts start with shortages after stock, other reservations and
incoming orders. Review all quantities. Edit and save email subjects/bodies,
copy them, open a mail client, or download an unsent EML. No order, message,
notification or payment is automatically sent. Opening email does not mark a
purchase ordered.

## Company accounts and offline use

Empty public settings deliberately leave the app in local-only mode, explicitly
labeled This device only. Existing records and all local operations remain usable.

After configuring Supabase, managed Auth owns logins and email verification.
The platform owner approves every company and user. Staff can edit; viewers can
read. Database row-level security and procedures enforce isolation independently
of the interface. Company admins cannot approve users themselves. See the backend
README for setup and manually shared activation links that send no email.

Caches are separate per user and company. Existing local records migrate only
after review and a downloaded backup. Original records are removed only after a
successful online save. Shared backup import adds missing records and retains
existing records and permanent stock history; a backup tagged for another company
is refused in the wrong workspace. Sign-out removes the user's cached company
copies, warning before discarding unsynchronized changes.

Edits save locally and sync approximately every five seconds while visible, after
saves, and on reconnect/focus. A server revision check and idempotent operation
receipt prevent lost or duplicated commits. Three-way merge keeps independent
changes; conflicts in the same field require a choice. Stock checks run in the
same database transaction, preventing competing dispatches or receipts from
overdrawing inventory or overreceiving purchases. Unconfirmed movements can be
reviewed; accepted history is permanent. Offline booking/notes edits queue, while
shared stock confirmations require a connection and synchronization first.

The service worker controls /catering/ only. It precaches the app and PUBLIC cloud
configuration, plus shared appearance assets. It never caches private API data.
Fonts are optional offline. Bump its cache version when app resources change.
Never claim the portal root or attach a Worker in front of tools.cjaffa.com.

## Verification

From tests/, install npm dependencies and serve the repo root on a fresh port:

    CJ_BASE_URL=http://127.0.0.1:8879 node catering-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-operations-test.mjs
    node catering-database-test.mjs
    node catering-cloud-test.mjs
    node catering-invite-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-shopping-test.mjs

Browser checks cover 375/393/412/1280px, all editing surfaces, the portal iframe,
offline caching, supplies, fees, supplier drafts, receipts and returns. PostgreSQL
checks run the actual deployment SQL in PGlite. The two-device suite uses the same
database and authorization; only managed password/verification endpoints are
simulated. It covers isolation, approvals, offline queues, independent merges,
explicit conflicts and sign-out. Actual Supabase Auth and email delivery must be
verified against the configured project before production accounts are claimed.
Invitation tests check authentication, administrator and recipient approval,
redirects, unsent activation links and separation of the server key.
Shopping tests cover combined pack rounding, date boundaries, specific selections,
incoming order timing, reusable overlap, print/CSV/offline reopening, tablecloth
splits, shape inventory, legacy snapshots and the deployment migration. The cloud
suite also checks shopping selections and bought checks across two devices.
