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

## Payments, adjustments and profit

Open a booking and use Add payment directly in its header. Enter the amount and
choose Save payment. Only the amount is required: the date defaults to today,
the method can stay Not recorded, and an empty note becomes Customer payment.
The method is optional; date, reference and note are under More details. Full
balance fills the remaining amount without saving until the user presses Save.
The same simplified flow opens from the booking's Payments & profit tab. It keeps
the current booking tab open and immediately updates the balance. A stable form
entry ID prevents the same form from submitting a payment twice.

Each booking has Payments & profit with dated customer payments, method, reference
and note. Prior `paid` totals remain a separate opening credit, without inventing
dates or methods. Add subsequent payments in the ledger. Customer refunds reduce
net payments; extra customer charges and discounts change the bill. Other income
and extra expenses adjust profit without changing the customer's balance.

Profit uses customer charges plus other income, less supply costs, waiter costs
and extra expenses. Customer deposits and later payments settle that same bill
and never count as additional revenue. An actual total supply cost, if supplied,
replaces the physical-supply estimate. Service-category template lines are charges,
rather than assumed physical supply costs. Waiter costs are separate from the
waiter fee charged to the customer. Enter 0 for a confirmed free cost and leave
unknown costs blank. Missing required prices or waiter costs make profit incomplete.
Uncompleted bookings, estimated supply costs and calculated customer charges are
labeled as estimates. Supplier purchases and inventory movements are not deducted a second
time in the profit calculation.

The financial overview filters by party date, status, name and balance. It defaults
to open/completed events and can include cancelled events explicitly. It exports
booking totals and a separate transaction CSV, retaining methods and void history.
Individual booking finances can also be printed. Overpayments and losses are shown.

Financial entries have stable independent IDs so concurrent receipts merge across
devices. Ordinary edits cannot rewrite or remove a saved financial entry. Void an
incorrect entry with a reason and add a replacement; history stays visible. Refunds
cannot exceed recorded net payments and discounts cannot exceed the customer bill.
Bookings with payment or adjustment history are retained. Duplicating a booking
starts with no payments, adjustments or actual cost overrides. Full backups include
financial entries and costs; explicitly replacing a device backup can restore an
earlier local state, while shared imports retain accepted history.

These are recorded payments, not payment processing. All financial operations work
offline. Apply backend migration 003 before enabling shared accounts; its validation,
revision transaction and history protection run inside the same company commit.

## Price changes and booking history

Changing a catalog price or pack size in Inventory or Supply templates reveals a
scope selector before saving. Each edit defaults to New bookings only. The other
choices apply the new price and pack size to all upcoming booked events, or to
specific upcoming bookings selected from a checklist. Each choice previews the
matching supplies' estimated cost using that booking's own quantities.

The three groups are explicit: completed/past/cancelled bookings keep their saved
snapshots; already-booked events dated today or later can be opted in; bookings
created later use the new catalog values. Saved supply units must match before
applying an update. Linked inventory products can appear in both bris and kiddush
bookings; the scope covers all matching saved lines. An unlinked template affects
only its own item and event type.

Repricing preserves saved quantity rules, overrides, agreed charges, payments,
service and waiter fees, feedback, supplier orders and stock history. Packing
checks remain unless the changed pack size changes the number of purchase packs.
The scope choice applies to this edit only. Price updates work offline and use
existing revision-controlled records without a new database migration. Direct
booking adjustments and explicitly refreshing supplies remain separate actions.

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
checkmark. Apply migrations 001, 002 and 003 before activating shared accounts.

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

Supplier cards offer Repeat last order for the latest non-cancelled purchase.
Any order also offers Repeat order, including orders with receipts. The new draft
copies the supplier, delivery address, notes, items, quantities and saved pack
prices. It requires a new delivery date and has fresh order/line IDs and reference.
Previous booking links and receipts stay with the original order. The email draft
is regenerated from the new details. Opening or cancelling a repeat saves nothing.

New orders open a searchable inventory checklist. Select several products, enter
whole PACK quantities beside each, then add them together or save the order.
Search by item, SKU or supplier, filter to the current supplier, or select all
shown. Selections and entered quantities survive filtering. Existing order items
are marked and cannot be added again; their quantities, pack sizes and prices can
be edited in the order lines. New selections use current catalog prices. Historical
inactive products remain visible in repeated orders but cannot be newly selected.
Repeating and selecting supplies work offline and use the existing backup/sync
records without a new database migration.

## Text booking requests

Text bookings includes an offline conversation preview. It uses the same engine
as the signed SMS webhook and the public booking choices: Kiddush, Vacht Nacht,
Shalom Zachor, Bris and Other, with Classic, Royal and King packages or help choosing.
Customers answer short questions about date, guests, name, venue, dining tables,
round/rectangular/mixed cloths and preferences. They review before SEND submits a
request. BACK restores the last draft answer; MENU restarts; HELP explains; STOP
stops replies and START resumes. General questions and later texts are supported.
No calls are placed. The preview sends nothing and creates no actual booking.

Real SMS requires the managed company backend plus a dedicated Twilio texting
number and server-side credentials. No number has been provisioned and the empty
cloud settings still mean device-only operation. See backend/README.md for setup.
The online inbox is company-scoped. Open Text history to inspect the customer
conversation. Review & create booking transfers details into the existing booking
editor. Vacht Nacht, Shalom Zachor and Other require an explicit supply template;
the original service name remains on the booking. Estimated guests do not invent
an adult/child split. Review table counts, timing, supplies and agreed charge.
Save and sync the booking, then return to Text bookings and choose Approve & text.
Only that explicit action sends the reviewed booking confirmation. Declining a
request with a linked booking requires cancelling the booking first. Reply by text
sends a custom staff response; no arbitrary recipient number can be substituted.

The inbox retains request status, incoming messages and staff outbox records.
Provider acceptance is labeled separately from delivery. An explicit provider
rejection can be retried with its original operation; an uncertain timeout or
interrupted send requires provider-log review before any new send. The same
operation cannot send an accepted message twice. Linked bookings are retained;
mark them cancelled instead of deleting them. Incoming SMS and staff messages live
in the online database, outside the local planner JSON backup. Export shown requests
exports the requests currently loaded, with Load older requests for additional pages.
Receiving, refreshing, approving and sending real texts require internet access.
The ordinary planner and conversation preview remain available offline.

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
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-sms-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-shopping-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-supplier-orders-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-pricing-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-finance-test.mjs
    CJ_BASE_URL=http://127.0.0.1:8879 node catering-quick-payment-test.mjs

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
Supplier-order tests cover repeated drafts, fresh identities, unchanged receipts,
saved and unknown prices, inactive products, bulk quantities, filters, invalid
hidden inputs, mobile and iframe layouts, and offline repeat orders.
Pricing tests check all three groups, selected upcoming bookings, new bookings,
linked/unlinked templates, incompatible saved units, pack rounding, preserved
financial and stock records, deployment SQL, offline reopening and phone layouts.
The cloud suite also checks selected price changes across devices and companies.
Finance tests cover opening credits, methods, partial payments, refunds, overpayments,
charges/credits, extra expenses and income, actual costs, incomplete profit, losses,
voids, permanent history, duplicate bookings, print/CSV, offline reopening and phone
layouts. SQL tests run migration 003 and reject rewritten records or excess refunds.
The cloud suite merges independent offline receipts and checks company isolation.
Quick-payment checks cover the direct booking action, amount-only saves, defaults,
optional details, full-balance filling, duplicate submission, invalid amounts,
unchanged profit, offline reopening and phone/iframe layouts.
