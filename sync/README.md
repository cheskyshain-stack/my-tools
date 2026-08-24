# Money Flow sync

A single Cloudflare Worker with a KV namespace behind it. It holds one
encrypted blob per vault and can read none of it.

## What it stores

    v:<32 hex vault id>  ->  { version, salt, wrapped: {pass, recovery}, blob, updatedAt, by }

`blob` is the ledger, sealed with AES-GCM in the browser. `wrapped` is the key
to that seal, itself sealed twice: once by the passphrase, once by the recovery
code. Neither of those is ever sent, so the key cannot be recovered from
anything stored here. A dump of the KV namespace is noise.

`version` counts accepted writes. A write carries `If-Match` naming the
version it was based on, or `*` to create. A stale write is refused with 409
and the current record, and the browser merges and retries rather than
flattening whatever the other device did.

## Deploying it

Needs the Cloudflare account that already holds cjaffa.com, and wrangler.

```
npm install -g wrangler          # if it is not already there
wrangler login
cd sync
wrangler kv namespace create VAULT
```

Paste the id it prints into `wrangler.toml`, then:

```
wrangler deploy
```

That gives a `*.workers.dev` URL. Either use that as it is, or give it a
hostname of its own:

```
wrangler deploy                  # after uncommenting the [[routes]] block
```

**Its own hostname. Never in front of tools.cjaffa.com.** A Worker holding
that name is what took the whole site down for a day in August, and Pages
never got a look in because the Worker answered first. `sync.cjaffa.com` is
fine. A route pattern that overlaps `tools.cjaffa.com` is not.

If you use a custom hostname, add it to `ALLOWED_ORIGINS` is not needed: the
list is the origins of the *page*, not of the Worker. `https://tools.cjaffa.com`
is already there and is the only one that matters in production.

## Checking it

```
ID=$(openssl rand -hex 16)
BASE=https://sync.cjaffa.com/v1/vault/$ID
curl -s -o /dev/null -w '%{http_code}\n' $BASE                       # 404
curl -s -X PUT $BASE -H 'Content-Type: application/json' -H 'If-Match: *' \
  -d '{"salt":"c2FsdA==","wrapped":{"pass":"a.b","recovery":"c.d"},"blob":"e.f"}'
                                                                     # {"version":1,...}
curl -s -X PUT $BASE -H 'Content-Type: application/json' -H 'If-Match: *' \
  -d '{"salt":"c2FsdA==","wrapped":{"pass":"a.b","recovery":"c.d"},"blob":"e.f"}'
                                                                     # 409
```

Then in Money Flow, Data tab, put the Worker's URL in **Sync server** and turn
it on.

## Cost

Cloudflare's free tier allows 100,000 KV reads and 1,000 writes a day. One
person entering a handful of things a day uses a few dozen writes. A sync with
nothing to say does a read and no write at all.

## Testing it without deploying

`scratchpad/mocksync.mjs` in the working session runs this exact file against
an in-memory KV over plain http, which is how the browser tests exercise it.
