# Local development runbook

## Start dependencies

PayMorph's local setup does not require Docker Desktop. Install PostgreSQL in
Ubuntu WSL and start its cluster:

```bash
wsl -d Ubuntu-24.04 -u root -- pg_ctlcluster 16 main start
```

If the WSL distribution is configured to shut down after the command exits,
keep it alive in a separate terminal while developing:

```bash
wsl -d Ubuntu-24.04 -u root -- sh -lc "pg_ctlcluster 16 main start; exec sleep infinity"
```

Use the WSL IP reported by `wsl -d Ubuntu-24.04 -- hostname -I` in the
repository-root `.env.local` `DATABASE_URL`; the database must allow the
Windows host gateway to connect. Root development, database, deployment,
network, and smoke commands load this single file for both applications. Only
testnet credentials are permitted.

Generate `OPERATOR_SESSION_TOKEN` as documented in
`docs/runbooks/operator-api.md` only when exercising the local operator API.

## Initialize

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Run a normal `pnpm install` again after changing a workspace package manifest.
PayMorph uses injected workspace packages for deployable-process isolation, and
the install recreates those local package links. Do not copy package folders
into an application manually.

## Run

```bash
pnpm dev
```

The web process runs at `http://localhost:3000`. The executor is an always-on
separate process and must have C2FLR only when live processing is enabled.

`GET /api/ready` additionally checks PostgreSQL, the live Coston2 FXRP route,
and an authenticated read-only request to the configured FDC XRP indexer.
Resolve a non-200 response before creating a quote: PayMorph intentionally
refuses to ask a payer to sign XRP when the FDC verifier key or endpoint is not
usable.

## Browser acceptance

Run the browser smoke suite with Playwright's managed Chromium when it is
available:

```bash
pnpm test:e2e
```

If the managed Chromium download is unavailable on a local Windows machine but
Google Chrome is installed, use the installed browser explicitly. This is a
local fallback only; CI continues to use Playwright's default Chromium:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL = 'chrome'
pnpm test:e2e
```

The browser smoke confirms the public testnet disclosure and the landing-to-
merchant sign-in journey. It does not substitute for the credentialed Xaman,
FDC, and Coston2 live-settlement smoke.

## Merchant webhook delivery

Configure an HTTPS endpoint and secret in merchant settings. PayMorph encrypts
the secret at rest and sends `paymorph-timestamp`, `paymorph-signature`, and
`paymorph-event`; the signature is HMAC-SHA256 of `timestamp + '.' + rawBody`.
Run the durable delivery worker on a schedule in addition to the executor:

```bash
pnpm webhooks:deliver
```

Schedule the command at least once a minute in a deployed environment. Each
delivery is atomically leased, has deterministic exponential retry delays (one
minute through a maximum of 24 hours), and becomes `FAILED` after 12 attempts.
A stale lease is recovered only after five minutes; do not run a second custom
sender against the same table.

Only a persisted decoded `PaymentSettled` transition creates a
`payment.settled` delivery record. Delivery success is never settlement proof.

## Xaman callbacks

Use an HTTPS tunnel with a stable callback for local Xaman testing. Configure
the exact `/api/webhooks/xaman` URL in the Xaman developer console. Never expose
database, admin, or executor ports.

## Stop

```bash
wsl -d Ubuntu-24.04 -u root -- pg_ctlcluster 16 main stop
```

Do not delete the WSL PostgreSQL data directory unless intentionally deleting
the local development database.
