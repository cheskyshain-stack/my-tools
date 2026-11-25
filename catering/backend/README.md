# Shared company backend

The frontend remains on GitHub Pages at `https://tools.cjaffa.com/catering/`.
Supabase supplies managed Auth and a separate PostgreSQL database. The portal's
hosting, domain and other tools are unchanged.

## Activation

1. Connect Supabase and select or create a dedicated project. Keep service-role
   keys server-side and out of source and browser configuration.
2. Apply `001_companies.sql`, `002_tablecloth_shapes.sql`, then
   `003_payments_profit.sql`, then `004_sms_bookings.sql`, as immutable
   migrations. They create or update only objects prefixed `catering_`; none
   contains an owner identity or users. Migration 002 adds shape-specific supply
   rules and validates saved shopping selections without replacing existing data.
   Migration 003 validates payment/expense entries and actual booking costs,
   prevents excess refunds or discounts, and retains financial history. It replaces
   the commit procedure while preserving company authorization and stock checks.
3. Insert the owner's explicitly supplied email into
   `catering_platform_admins(email)`, normalized with `lower(trim(...))`. The
   allowlist binds to the verified Auth user ID on first sign-in. Never appoint
   the first visitor or infer an owner from an unverified signup.
4. Set Auth's site and allowed redirect URLs to
   `https://tools.cjaffa.com/catering/`. Keep email verification enabled.
5. Deploy `functions/catering-invite/index.ts` as `catering-invite`.
   Gateway `verify_jwt=false` is deliberate: the handler verifies the caller
   with Auth, checks `catering_is_admin`, and checks approved recipient membership
   before using its automatic server-side service key. The default allowed
   origin is `https://tools.cjaffa.com`. No private key enters browser code.
6. Put the public project URL and publishable/anon key in `cloud-config.js`.
   Bump the service-worker cache version, publish, and verify the live bytes.
7. Activate the owner's verified login through managed Auth. The owner approves
   companies and users in **Company & sync**. **Login invite** generates an
   activation link for an approved new user to share directly. The recipient
   follows it and chooses a password. This sends no email and does not silently
   reset an existing user's password.

Self-signup and forgotten-password email depend on the project's Auth email
delivery configuration and limits. Configure supported SMTP before promising
general delivery. Operator-created activation links do not require automatic
invitation email. Supplier ordering messages always remain drafts.

## Security and sync

All tables enable row-level security. Users can read only approved active
companies. Every membership-changing procedure requires platform administrator
access; company admins cannot approve users themselves. Direct document writes
are revoked. The commit procedure authorizes company access, locks the document,
checks its revision, validates business records and stores an idempotent receipt.
Stale writes return shared records to merge instead of overwriting them.

The same transaction enforces stock balances, booking references, purchase
receipt caps, issue/return/damage limits and permanent inventory history.
Disabling a user or suspending a company removes server access. Already downloaded
offline copies are not a remote-wipe mechanism.

Audit records retain approvals and accepted revisions. Passwords, session keys
and activation links never enter company documents or audit history.

Empty public settings intentionally leave the app in local-only mode. Do not
claim online accounts are active until the project, schema, owner identity and
managed Auth have been configured and verified.

## Texting setup

The site can preview text conversations without an account. Real customer texts
are not active until both the shared backend and a texting provider are configured.
A new dedicated texting number is still to be set up. Do not reuse the public
site's contact number or purchase a number without the owner's instruction.

1. Complete the company/Auth activation above and apply migration 004. It adds
   company-scoped channels, conversations, requests, inbound receipts and an
   outbound queue, with read-only RLS for approved company users. Gateway writes
   are private service-role procedures. Ordinary booking commits also validate
   SMS links and retain bookings linked to approved requests.
2. In the owner's Twilio account, select an SMS-capable number and complete the
   provider's required business registration for the destination country. Review
   its number and messaging charges with the owner. There are no voice endpoints.
3. Deploy `functions/catering-sms/index.ts` as `catering-sms` and
   `functions/catering-sms-send/index.ts` as `catering-sms-send`. Keep both functions'
   shared `_shared` directory. Gateway `verify_jwt=false` is intentional: incoming
   messages verify Twilio's signature; the staff-send endpoint verifies Auth and
   company write permissions before claiming an outbound record.
4. Set server-only secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_WEBHOOK_URL`. The last value must be the exact HTTPS URL entered in
   Twilio, including any query string. Signature verification uses that canonical
   URL rather than proxy/forwarded host headers. Supabase supplies the server URL,
   anon key and service-role key through its Edge Function environment. Set
   `CATERING_APP_ORIGIN=https://tools.cjaffa.com` if overriding the default.
   Never put provider credentials or the service-role key in cloud-config.js.
5. Set the number's incoming Messaging webhook to POST to that canonical URL.
   Configure provider opt-out handling for STOP/START/HELP. When Twilio reports
   `OptOutType`, the handler records it without a duplicate automatic reply.
6. As the verified platform administrator, configure each company's distinct
   recipient number using the authenticated RPC `catering_sms_configure`:

       {"p_company":"<company UUID>","p_phone":"<E.164 number>",
        "p_name":"Simcha King","p_timezone":"America/New_York","p_enabled":true}

   The number determines company routing. Company staff cannot change routing.
   Disabled channels or suspended companies cannot process or send booking texts.
7. With an explicitly authorized test recipient, verify a real conversation,
   provider retry, STOP/START, pending request, reviewed saved booking, staff
   approval and final text. Verify another company cannot see or reply to it.
   Unit/browser tests use fake numbers and a simulated provider, not real delivery.

Incoming SMS is serialized by conversation revision and deduplicated by provider
message ID. Submission creates a pending request, never an automatic booking.
Staff must create and synchronize a booking before approval. Confirmation takes
its service/date/agreed charge from that saved booking, rather than assuming that
the requested date or advertised package is available. Prices and menu details
still need operator review. Other services deliberately require choosing one of
the current Bris/Kiddush supply templates without renaming the requested service.

Outbound records are idempotent by request and operation. Claiming transitions to
sending once. A provider rejection becomes failed and can be explicitly retried;
network interruption, provider 5xx or an ambiguous success becomes unknown and
must not be automatically retried. If a function stops while sending, inspect the
provider logs before taking recovery action. The queue records provider acceptance,
not final delivery; delivery-status callbacks are not configured in this version.
A failed confirmation leaves the staff approval recorded and the failed text
visible for retry. STOP blocks both new actions and queued sends.

SMS records remain in the online database and are not cached as private API
responses by the service worker. Refreshing and sending need internet; the local
conversation preview and planner still work offline. Planner JSON backups do not
include the separate SMS tables. Include those tables in the managed database's
backup policy. Export shown requests provides a staff CSV of loaded requests.
