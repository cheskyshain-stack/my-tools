# Shared company backend

The frontend remains on GitHub Pages at `https://tools.cjaffa.com/catering/`.
Supabase supplies managed Auth and a separate PostgreSQL database. The portal's
hosting, domain and other tools are unchanged.

## Activation

1. Connect Supabase and select or create a dedicated project. Keep service-role
   keys server-side and out of source and browser configuration.
2. Apply `001_companies.sql`, then `002_tablecloth_shapes.sql`, as immutable
   migrations. They create or update only objects prefixed `catering_`; neither
   contains an owner identity or users. Migration 002 adds shape-specific supply
   rules and validates saved shopping selections without replacing existing data.
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
