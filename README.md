<div align="center">

# PayMorph

### Pay in XRP. Settle with verifiable Flare execution.

![XRPL Testnet](https://img.shields.io/badge/XRPL-Testnet-F06F7D?style=for-the-badge)
![Flare Coston2](https://img.shields.io/badge/Flare-Coston2-7638F5?style=for-the-badge)
![Status](https://img.shields.io/badge/Settlement-Evidence--first-FA4B9E?style=for-the-badge)

</div>

> **Testnet-only software.** XRP, FXRP, C2FLR, and USDT0 used by PayMorph have
> no real monetary value. The project is not audited and must not be used for
> mainnet or real-value payments.

PayMorph is a cross-chain merchant checkout for XRPL Testnet and Flare Coston2.
A payer signs an exact XRP payment in Xaman. PayMorph validates the XRPL
transaction, obtains Flare Data Connector evidence, executes the committed
settlement operation, and presents a receipt only after the deployed router
emits `PaymentSettled` on Coston2.

## Why PayMorph

| Merchant gets                                                                               | Payer gets                                                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Immutable invoices, links, requests, POS, dashboard, API, webhooks, and WooCommerce support | A guided Xaman → XRPL → FDC → Coston2 timeline with clear pending, failure, and receipt states |
| FXRP direct settlement or guarded exact-output USDT0 settlement                             | One native XRP Testnet payment, with a pushed Xaman payment request after SignIn               |
| Receipts reconstructed from normalized chain evidence                                       | No false “paid” state from a redirect, webhook, or database update                             |

## Product surfaces

- Public scroll-led payment story with a supplied Xaman testnet wallet rendered
  on an interactive 3D handset, an XRP → FDC → FXRP settlement explanation, and
  the explicit `PaymentSettled` completion boundary.
- Merchant wallet sign-in, invoices, recipient splits, templates, payment links,
  requests, POS, analytics, payment evidence, and network diagnostics.
- Payer checkout with Xaman SignIn, exact quote, QR/deeplink fallback, and live
  settlement status.
- Public receipt explorer and settlement evidence views.
- Scoped `pm_test_` developer API, hosted checkout button, typed Node SDK, and
  HMAC-signed merchant webhooks.
- Testnet WooCommerce gateway that marks an order paid only after a verified
  `payment.settled` webhook.

## Evidence model

```text
Xaman approval → validated XRPL payment → FDC proof → Coston2 execution → PaymentSettled receipt
```

Only a decoded `PayMorphRouter.PaymentSettled` event can mark an invoice
settled. Xaman webhooks are notifications and are always re-fetched from the
authoritative provider payload before state changes.

## Local development

Requirements: Node.js 24+, pnpm 10+, PostgreSQL 16 (or a reachable PostgreSQL
database), a Coston2-compatible merchant wallet, and Xaman for live testnet
checkout.

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev:local
```

`pnpm dev:local` is the one-command Windows launcher. It starts WSL PostgreSQL,
the web app at [localhost:3000](http://localhost:3000), and the executor.
Use it only with intentional testnet work because the executor can process
queued jobs.

For web-only work, use:

```powershell
pnpm dev:web:local
```

Set all required values in `.env.local`; never commit it. The local launcher
uses `http://localhost:3000`, which cannot receive Xaman callbacks. Use a
stable public HTTPS deployment for an end-to-end callback test.

## Deploy

PayMorph uses Vercel for the Next.js web/API application and Render for a
testnet executor service plus PostgreSQL.

### 1. Create the Render services

Create a new Render Blueprint from this repository. [`render.yaml`](render.yaml)
creates:

- `paymorph-db` — PostgreSQL 17 with PgBouncer;
- `paymorph-executor` — a health-checked web service that runs the
  XRPL/FDC/Coston2 executor and checks merchant webhook deliveries each minute.

Populate every `sync: false` value in Render's `paymorph-runtime` environment
group. At minimum, set `APP_URL`, `DATA_ENCRYPTION_KEY_V1`,
`EXECUTOR_PRIVATE_KEY`, `PAYMORPH_ROUTER_ADDRESS`, and
`FDC_VERIFIER_API_KEY`. Copy the remaining testnet settings from `.env.example`.

Use the Render database's **external pooled connection string** as
`DATABASE_URL` for Vercel. The internal Render URL is only for Render services.

> **Free-hosting limitation:** a free Render Web Service can spin down when
> idle. Set Vercel's `EXECUTOR_WAKE_URL` to the Render service's credential-free
> HTTPS `/health` endpoint so the landing splash can begin warming the service
> before checkout, while signed payments, signed recoveries, and operator
> retries also wake it after durable work commits. This remains suitable
> only for a testnet demonstration; use an always-on worker before depending on
> time-sensitive or unattended settlement.

### 2. Create the Vercel project

Import the repository as a Vercel project with **Root Directory** set to
`apps/web`. [`apps/web/vercel.json`](apps/web/vercel.json) installs the pnpm
workspace, generates Prisma, builds each runtime workspace dependency, applies
checked-in migrations, and builds the Next.js app.

Set these Vercel environment values for Production (and separate values for
Preview if previews are enabled):

```text
APP_ENV=production
APP_URL=https://your-paymorph-domain.example
EXECUTOR_WAKE_URL=https://your-render-executor.example/health
DATABASE_URL=<Render external pooled PostgreSQL URL>
SESSION_SECRET=<32+ random characters>
DATA_ENCRYPTION_KEY_V1=<32-byte base64 key>
XAMAN_API_KEY=<testnet key>
XAMAN_API_SECRET=<testnet secret>
XAMAN_WEBHOOK_SECRET=<testnet webhook secret>
PAYMORPH_ROUTER_ADDRESS=<verified Coston2 router>
FDC_VERIFIER_API_KEY=<FDC verifier key>
METRICS_TOKEN=<high-entropy token>
```

Copy the same `APP_URL`, `DATA_ENCRYPTION_KEY_V1`, protocol route values, and
testnet provider credentials to Render. The encryption key must be identical
where encrypted merchant webhook settings are read or written.

### 3. Configure Xaman and verify readiness

Set the Xaman developer-console callback to:

```text
https://your-paymorph-domain.example/api/webhooks/xaman
```

After deployment, confirm:

```text
https://your-paymorph-domain.example/api/health
https://your-paymorph-domain.example/api/ready
```

Do not create a payer payment attempt until `/api/ready` returns HTTP 200. It
checks the database, configured Flare route, and authenticated FDC verifier.

## Build and quality gates

```bash
pnpm verify
pnpm test:contracts
```

The repository keeps application source, contracts, tests, deployment assets,
and CI. Local-only research, runbooks, test artifacts, secret files, and
operational smoke tooling are intentionally excluded from GitHub.

## Repository structure

```text
apps/
  web/                 Next.js checkout, dashboard, public API, receipts
  executor/            durable chain executor and webhook delivery command
  woocommerce-gateway/ testnet WooCommerce plugin
packages/
  contracts/           Solidity router and Foundry tests
  db/                  Prisma schema and database access
  sdk/                 typed Node client
  shared/              payment state, amount math, provider boundaries
  ui/                  shared React UI
render.yaml            Render database and executor web-service blueprint
```

## Security

PayMorph never receives payer or merchant private keys. The executor key is
testnet-only and server-side. Money uses `bigint` or canonical base-unit decimal
strings; no floating point values are used in settlement. Read
[SECURITY.md](SECURITY.md) before any shared deployment.

## Current testnet status

- FXRP settlement: independently verified on XRPL Testnet and Flare Coston2.
- USDT0 settlement: independently verified through the labelled
  `PAYMORPH_TESTNET` exact-output route; it is not an official SparkDEX or
  mainnet claim.
- Remaining live gates: stable public Xaman webhook-HMAC acceptance, deliberate
  executor crash/restart acceptance, and an official `0xE0` recovery artifact.

## License

[MIT](LICENSE)
