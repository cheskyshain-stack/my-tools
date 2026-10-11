# Cloudflare deployment

This option runs only the private API on Cloudflare Workers, with accounts,
sessions, licensed-title records, favorites and history in D1. The frontend and
all existing routes stay on GitHub Pages. Use a new Custom Domain such as
`portal-api.cjaffa.com`. Keep `tools.cjaffa.com` DNS-only, with its existing CNAME.
The frontend and Yoti return address are `https://tools.cjaffa.com/333/`.
There is no home navigation card for the library.

The Worker shares `../application.mjs`, provider adapters, origin checks, age
verification and license validation with the Node server. It has no registration,
test-age override, default account, or embedded catalog. Credentials use Worker
secrets. Media goes directly from the authorized Bunny CDN to the browser.
Read [content authorization and provider requirements](../README.md) first.

## Connect the account

Wrangler can use a browser-approved OAuth login in the workspace that performs
deployment. A desktop login stays on that computer; it does not authorize a
separate cloud task. In a remote workspace, run:

```sh
npx wrangler login --device --browser=false --scopes account:read user:read workers_scripts:write workers_routes:write d1:write zone:read
```

Open the verification page printed by Wrangler, enter the current code and
approve within five minutes. Start from a fresh verification page if the code
expires. Confirm the account with `npx wrangler whoami`. On a local computer,
`npx wrangler login` also supports a browser and localhost callback.
Wrangler stores the login outside the repository; do not copy its credentials
into source files or print them. The tracked configuration selects the verified
account and D1 database for this portal.

For environment-secret authentication or the administrator CLI, create a scoped
API token in Cloudflare for the account owning `cjaffa.com`.
Use Account permissions Workers Scripts Edit and D1 Edit. For the `cjaffa.com`
zone, grant Zone Read, Workers Routes Edit and DNS Edit for the new hostname.
Restrict resources to that account and zone. Existing unrelated Worker tokens
or a Zone ID are not substitutes for this project's account access.

In the task's environment settings, provision:

- `CLOUDFLARE_API_TOKEN` as a secret.
- `CLOUDFLARE_ACCOUNT_ID` as an environment variable, the 32-character account ID.
- After database creation, `CLOUDFLARE_D1_DATABASE_ID`, the database UUID.

Keep token values out of chat, command arguments, repository files and output.
For local administration, use your secret manager's environment injection.

Use a Workers plan that permits the configured 1,000ms CPU budget. Cloudflare's
Free plan has a 10ms CPU limit and is unsuitable for this password-hashing
configuration. A billing-plan change requires the account owner's action.
Benchmark login on the actual deployed Worker before activating the frontend.

## Create the database and deploy

Run in `xxx-api/cloudflare/`, using Node 24 for deployment tooling:

```sh
npm ci
npm test
npx wrangler d1 migrations list cj-private --remote
```

The existing `cj-private` database is already bound in `wrangler.jsonc`. Reuse it.
Create a database only when provisioning a separate installation, then explicitly
update that installation's account and database IDs. For the administrator CLI,
provision `CLOUDFLARE_D1_DATABASE_ID` with the configured database UUID. Account and
database IDs are configuration, not API keys. There is no `tools.cjaffa.com` route,
`workers.dev` address or preview URL in this configuration.

```sh
npm run migrate
npm run deploy
```

Migration creates the schema and indexes, plus triggers that atomically revoke
sessions on a password reset or account disable. A cron deletes expired sessions
and rate-limit records every 15 minutes. D1 queries use parameters; rate-limit
increments are atomic across concurrent requests and isolates. D1 sessions start
on the primary to prevent stale revocation reads if replication is enabled later.
The Worker refuses a missing database, unsupported schema, alternate hostname or
production local-mode override.

Cloudflare creates the new API hostname's DNS record and TLS certificate. Verify
`https://portal-api.cjaffa.com/healthz` returns `{"ok":true}`. Worker request logging
and observability are disabled in the supplied configuration to avoid capturing
passwords, cookies, verification evidence or signed media URLs.

## Create your login

Deployment checkpoint, 2026-10-11: Cloudflare OAuth authorization and ownership
of `cjaffa.com` were verified. The existing D1 database has schema version 1 and
no login accounts or licensed-title records. The Worker build passed, but the
upload was rejected with Cloudflare error `100328` because the Free plan does
not support the configured CPU limit. The API is not live and the frontend API
meta tag remains blank. The account owner must enable a suitable Workers plan
before retrying deployment; this does not require changing the main website's
plan or DNS record. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [CPU limits](https://developers.cloudflare.com/workers/platform/limits/)
describe the subscription and resource requirements.

Account creation is available through the administrator CLI, not a public web
endpoint. The CLI uses Cloudflare's authenticated D1 API with bound parameters:

```sh
NODE_USE_ENV_PROXY=1 node admin.mjs create-user your-username
```

Enter a unique password of at least 14 characters at the hidden terminal prompt.
For execution environments without an interactive terminal, provision
`PORTAL_NEW_PASSWORD` as a temporary environment secret instead. Remove that secret
after the account operation. The CLI sends only the salted hash to D1 and never
prints the password, token, SQL, license evidence or upstream response body.

The Worker uses OWASP's scrypt profile `N=32768, r=8, p=3`, a 32MiB profile that
fits the isolate memory budget. Two derivations at most run concurrently across
an isolate. Hashes include their fixed profile, salt and derived key. Existing
Node database hashes use a different profile and are not automatically imported;
create or reset Cloudflare accounts with this CLI. No production accounts existed
at the time this deployment option was prepared.

Other commands:

```sh
NODE_USE_ENV_PROXY=1 node admin.mjs reset-password your-username
NODE_USE_ENV_PROXY=1 node admin.mjs disable-user your-username
NODE_USE_ENV_PROXY=1 node admin.mjs import-license /private/path/title.json
NODE_USE_ENV_PROXY=1 node admin.mjs remove-license provider-video-uuid
```

License manifests have the shape and restrictions in `../README.md`. Only actual
contract-backed titles belong in production. Removing a title cascades deletion
of its favorites and history; existing CDN bearer URLs can last until expiry.

## Connect providers and the frontend

Set the following through Worker Settings, Variables and Secrets, using type
Secret, or through each interactive `wrangler secret put NAME` prompt:

- `BUNNY_API_KEY` and `BUNNY_TOKEN_KEY`.
- `BUNNY_LIBRARY_ID` and `BUNNY_CDN_HOST` for the licensed library.
- `YOTI_API_KEY` and `YOTI_SDK_ID`.

Set the non-secret `BUNNY_CUSTOM_HLS_APPROVED` variable to `true` in the tracked
configuration only after the licensing, CDN token-authentication and provider
domain-control checks in `../README.md` pass. Its default is `false`.
Provider requests use manual redirect handling and reject redirects without
following them. Missing credentials or unsupported rights keep playback closed.

Verify real login/logout, cookies, CSRF, age verification, a licensed title,
unsigned-media denial, token expiry, playback seeking and resume on an actual
iPhone and Android device. Then set only the public API origin in the frontend
`cj-portal-api` meta tag and publish through the existing GitHub Pages workflow.
Until those checks pass, leave the meta tag blank. The portal has no login account
until the deployed database is explicitly provisioned as described above.

## Tests and operations

`npm test` bundles the real Worker with Wrangler and runs it in workerd via
Miniflare and a real local D1 binding. Synthetic provider replies stay in tests.
The tests exercise the deployed entry point, password verification, secure cookies,
origin/CSRF denial, session-bound age results, full-length/DRM restrictions, signed
HLS, per-user favorites/history, expiry, password reset, account disabling,
redirect rejection, concurrent rate limits, deletion cascades and schema denial.
The existing Node backend and browser suites still run from `../../tests/`.

Use D1 Time Travel or Cloudflare's database export for backups. Store exports
outside the public repository with restricted access. D1 schema version 1 is
tracked separately from the local Node SQLite database; future changes need
explicit migrations and restore checks. Before restoring a backup, disable the
API and revoke restored sessions before enabling it again.

To close access, clear the frontend API meta tag or disable the API Worker. Roll
back the Worker to a compatible version without changing the main site hostname
or overwriting unrelated GitHub Pages changes.

Verified documentation:

- [Wrangler OAuth login](https://developers.cloudflare.com/workers/wrangler/commands/general/#login).
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
- [D1 bindings](https://developers.cloudflare.com/d1/worker-api/d1-database/) and
  [migrations](https://developers.cloudflare.com/d1/reference/migrations/).
- [D1 Query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/).
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
- [Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
  and [Worker resource limits](https://developers.cloudflare.com/workers/platform/limits/).
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
