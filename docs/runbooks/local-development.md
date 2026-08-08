# Local development runbook

## Start dependencies

PayMorph's local setup does not require Docker Desktop. For the web app on
Windows, `pnpm dev:web:local` starts and keeps the PostgreSQL cluster alive,
loads the repository-root `.env.local`, and binds its local application origin
to `http://localhost:3000`. It runs the web process only; use `pnpm dev` when
the executor is intentionally needed.

To start PostgreSQL manually, use Ubuntu WSL:

```bash
wsl -d Ubuntu-24.04 -u root -- pg_ctlcluster 16 main start
```

If the WSL distribution is configured to shut down after the command exits,
keep it alive in a separate terminal while developing:

```bash
wsl -d Ubuntu-24.04 -u root -- sh -lc "pg_ctlcluster 16 main start; exec sleep infinity"
```

Use the stable Windows loopback forwarding endpoint in the repository-root
`.env.local`: `postgresql://paymorph:paymorph@127.0.0.1:5432/paymorph`. Root
development, database, deployment, network, and smoke commands load this
single file for both applications. Only testnet credentials are permitted.

Generate `OPERATOR_SESSION_TOKEN` as documented in
`docs/runbooks/operator-api.md` only when exercising the local operator API.

## Initialize

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Verify the local receipt-projection boundary with a short-lived development
fixture. This is deliberately opt-in and refuses any non-development
environment. It creates no provider payload and sends no XRPL or Coston2
transaction; all temporary records are removed before the command exits:

```bash
RUN_DB_PROJECTION_ACCEPTANCE=1 pnpm test:db-projection
```

The command proves that a persisted `PaymentSettled` event gates its fixture
attempt, the public receipt can be rebuilt from normalized events, and the
`payment.settled` merchant webhook outbox entry is enqueued.

Run a normal `pnpm install` again after changing a workspace package manifest.
PayMorph uses injected workspace packages for deployable-process isolation, and
the install recreates those local package links. Do not copy package folders
into an application manually.

## Run

```bash
pnpm dev:web:local
```

The web process runs at `http://localhost:3000`. Start the executor separately
with `pnpm dev` only when live processing is enabled and it has C2FLR.

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

Use an HTTPS tunnel with a stable callback for local Xaman testing. The
localhost-only launcher is not a public callback endpoint. Configure the exact
`/api/webhooks/xaman` URL in the Xaman developer console. Never expose
database, admin, or executor ports.

## Stop

```bash
wsl -d Ubuntu-24.04 -u root -- pg_ctlcluster 16 main stop
```

Do not delete the WSL PostgreSQL data directory unless intentionally deleting
the local development database.
