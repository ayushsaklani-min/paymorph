<div align="center">

# PayMorph

### Pay in XRP. Settle with verifiable Flare execution.

![XRPL Testnet](https://img.shields.io/badge/XRPL-Testnet-E87F66?style=for-the-badge)
![Flare Coston2](https://img.shields.io/badge/Flare-Coston2-ED9278?style=for-the-badge)
![Status](https://img.shields.io/badge/Settlement-Evidence--first-F3AD96?style=for-the-badge)

</div>

> **Testnet-only software.** XRP, FXRP, C2FLR, and USDT0 used by PayMorph have
> no real monetary value. The project is not audited and must not be used for
> mainnet or real-value payments.

PayMorph is a cross-chain merchant checkout for XRPL Testnet and Flare Coston2.
A payer signs an exact XRP payment in Xaman. PayMorph validates the XRPL
transaction, obtains Flare Data Connector evidence, executes the committed
settlement operation, and presents a receipt only after the deployed router
emits `PaymentSettled` on Coston2.

## Hackathon submission

| Requirement              | PayMorph submission                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project**              | PayMorph                                                                                                                                               |
| **Selected bounty**      | **Bounty 1 — Interoperable Asset Products**                                                                                                            |
| **Product**              | Evidence-first merchant checkout: customers pay native XRP from Xaman while merchants settle in FXRP or guarded testnet USDT0 on Flare.                |
| **Target user**          | Online merchants, freelancers, marketplaces, and payment developers who want XRP checkout without treating a redirect or webhook as settlement proof.  |
| **Working application**  | [paymorph-seven.vercel.app](https://paymorph-seven.vercel.app)                                                                                         |
| **Demo video**           | [Watch the 3-minute PayMorph demo](https://youtu.be/DK7TuqjlFlA)                                                                                       |
| **Creator**              | [Ayush Saklani on X](https://x.com/ayushsaklani976)                                                                                                    |
| **Source and materials** | [GitHub repository](https://github.com/ayushsaklani-min/paymorph), [architecture](docs/architecture.md), and [OpenAPI contract](docs/api/openapi.yaml) |
| **Networks**             | XRP Ledger Testnet and Flare Coston2, chain ID `114`                                                                                                   |
| **Current scope**        | Testnet demonstration; tokens have no real monetary value                                                                                              |

PayMorph is submitted to the interoperable-assets bounty because Flare is the
payment verification and settlement layer, not a superficial deployment target.
The project does **not** claim the Confidential Compute bounty.

### The user problem

A wallet signature, redirect, provider webhook, or database status can say a
payment was sent without proving the merchant was finally paid across chains.
PayMorph gives the payer a native Xaman experience and gives the merchant an
evidence-backed Flare receipt. It does not call the invoice paid until the
deployed Coston2 router emits the final `PaymentSettled` event.

### How PayMorph uses Flare

1. Xaman binds the payer's XRPL account and signs the exact native XRP Testnet
   payment.
2. PayMorph validates the authoritative XRPL transaction and every committed
   payment field.
3. Flare Data Connector supplies independent `XRPPayment` evidence for that
   XRPL transaction.
4. Flare FAssets and the payer-specific Smart Account path make the XRP payment
   programmable as FXRP on Coston2.
5. `PayMorphRouter` atomically distributes FXRP to one or more merchant
   recipients, or uses the explicitly labelled `PAYMORPH_TESTNET` exact-output
   route for USDT0.
6. Public receipts are reconstructed from XRPL, FDC, FAssets, and decoded
   Coston2 events. Only `PaymentSettled` completes the invoice.

This makes Flare essential to PayMorph's core promise: independently verify an
external-chain payment, make the asset programmable, execute settlement, and
produce auditable final evidence.

### What was built during the program

PayMorph entered the program as a detailed product blueprint, not a working or
deployed payment application. During the program, the team built:

- the TypeScript monorepo, PostgreSQL data model, durable idempotent job queue,
  Next.js application/API, and production deployment;
- merchant wallet authentication, Xaman payer flows, exact XRP payment
  construction, authoritative webhook resolution, and strict XRPL validation;
- the FDC proof lifecycle, FAssets direct-mint execution, Smart Account
  operation commitment, retry/reconciliation boundaries, and evidence indexer;
- a replay-protected Solidity settlement router with multi-recipient payouts,
  service-fee accounting, pause/roles, and unit, fuzz, and invariant tests;
- live-verified FXRP settlement and a separately labelled real-token Coston2
  test route for guarded exact-output USDT0 settlement;
- invoices, reusable payment links, manual payment requests, an FXRP POS flow,
  templates, analytics projections, public receipts/explorer, scoped API keys,
  a lightweight server-side Node client, signed merchant webhooks, and a
  locally validated WooCommerce testnet gateway;
- hosted Vercel, Render, and PostgreSQL infrastructure with readiness checks and
  an explicit free-host cold-start experience.

No production payment path falls back to mocked XRPL, FDC, FAssets, swap, or
settlement success.

### Verified Coston2 deployments

| Component                             | Address / evidence                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| PayMorph settlement router            | [`0x9C7d...6008`](https://coston2-explorer.flare.network/address/0x9C7d670BE201be8a527cCDf349FE45B037eC6008)                                        |
| FXRP                                  | [`0x0b6A...dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7)                                         |
| USDT0 test token                      | [`0xC1A5...E71F`](https://coston2-explorer.flare.network/address/0xC1A5B41512496B80903D1f32d6dEa3a73212E71F)                                        |
| `PAYMORPH_TESTNET` settlement adapter | [`0x70dC...0a36`](https://coston2-explorer.flare.network/address/0x70dCd03Cf5b79f7C4b0352842B54F87A2C890a36)                                        |
| Verified FXRP settlement              | [Coston2 transaction `0xd904...b2e3`](https://coston2-explorer.flare.network/tx/0xd90407028660141ea897a7387f67194d1826383e4f0afa2457f478eea98cb2e3) |
| Verified USDT0 settlement             | [Coston2 transaction `0xeab1...1224`](https://coston2-explorer.flare.network/tx/0xeab167c4ac8f04fcaf19306de9a61f1a9ae0aa5d7cca1dcdf402cff546451224) |

Immutable manifests live in
[`packages/contracts/deployments`](packages/contracts/deployments). The USDT0
route is deliberately labelled `PAYMORPH_TESTNET`: it uses real Coston2 test
tokens and on-chain execution, but it is not presented as an official SparkDEX
or mainnet route.

### Testing, feedback, and current evidence

- Both FXRP and USDT0 payer-controlled flows were completed with Xaman on XRPL
  Testnet and independently rechecked against successful Coston2 receipts and
  decoded `RecipientPaid`/`PaymentSettled` logs.
- Merchant invoice, reusable link, request, API-key, marketplace-split,
  treasury-projection, and WooCommerce boundaries have automated or local
  acceptance coverage. POS is implemented, but its latest provider-QR change
  still needs a retained device-level hosted acceptance result.
- The current release passes 247 TypeScript tests, 31 Foundry unit/fuzz/invariant
  tests, seven Chrome journeys, all workspace builds, and the hosted readiness
  checks.
- The product has founder-led testnet usage and repeated end-to-end testing. It
  does not claim external pilot revenue, mainnet volume, or unaudited user
  acquisition.

### Roadmap beyond the hackathon

1. Run small merchant/freelancer pilots and measure checkout conversion,
   settlement latency, and support friction.
2. Move the executor from free-host cold starts to an always-on, monitored,
   independently reconciled service and complete the remaining crash/restart,
   webhook-HMAC, and official recovery live gates.
3. Add complete dashboard controls for API keys and webhooks, delivery history,
   exports, post-payment refunds, and stronger commerce integrations.
4. Integrate an official, liquid production FXRP/USDT0 route when its runtime
   health gates pass; keep FXRP as the fail-closed fallback.
5. Commission contract/application security reviews before considering Flare
   mainnet or any real-value payment use.

### Judge demo note

Open the working app first so the free Render executor can wake. A fresh FDC
voting round normally takes roughly 90–180 seconds on testnet; the UI keeps the
payment pending and tells the payer not to pay twice. For a short video, show
the live signature and XRPL payment, then cut to the final receipt and explorer
evidence rather than hiding or faking the network wait.

## Why PayMorph

| Merchant gets                                                                          | Payer gets                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Immutable invoices, links, manual requests, an FXRP POS flow, API, and signed webhooks | A guided Xaman → XRPL → FDC → Coston2 timeline with clear pending, failure, and receipt states |
| FXRP direct settlement or guarded exact-output USDT0 settlement                        | One native XRP Testnet payment, with a pushed Xaman payment request after SignIn               |
| Receipts reconstructed from normalized chain evidence                                  | No false “paid” state from a redirect, webhook, or database update                             |

## Capability audit

Last audited against the repository on **2026-08-13**. “Hosted” means the
surface is present in the deployed testnet application; it does not mean
mainnet-ready, audited, or suitable for real funds.

| Capability                                                   | Current status                               | Honest boundary                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FXRP checkout and settlement                                 | **Live verified**                            | A payer-controlled Xaman → XRPL Testnet → FDC → Coston2 run has retained `PaymentSettled` evidence.                                                                                                                                                                   |
| USDT0 checkout and settlement                                | **Live verified test route**                 | Uses the separately labelled `PAYMORPH_TESTNET` token/adapter and runtime health checks. It is not an official SparkDEX or mainnet route; FXRP remains the fallback.                                                                                                  |
| Invoices and recipient splits                                | **Hosted and functional**                    | Draft, edit, publish, cancel, immutable published terms, and one-to-ten deterministic recipients are implemented.                                                                                                                                                     |
| Invoice templates                                            | **Hosted and functional**                    | Templates copy defaults into canonical invoices; they are not a catalogue, inventory, or order-management system.                                                                                                                                                     |
| Reusable and single-use payment links                        | **Hosted and functional**                    | Each checkout creates or reuses a canonical invoice. View/start events are recorded, but the merchant UI does not yet provide a complete link-analytics report.                                                                                                       |
| Payment requests                                             | **Hosted, manual delivery**                  | Create/cancel and recipient metadata work. PayMorph does not send email, reminders, or delivery/open notifications. Request expiry validation still needs the same explicit 15-minute-to-30-day guard used by the invoice service.                                    |
| Point of sale                                                | **Hosted, device acceptance pending**        | Creates a 30-minute FXRP invoice and provider-issued Xaman SignIn QR with a browser fallback. USDT0 selection, terminal receipt acknowledgement, and a retained post-fix device scan are still open.                                                                  |
| Merchant dashboard and analytics                             | **Hosted projection**                        | Counts and time-series are rebuildable PostgreSQL projections. They are not accounting records and never override chain evidence.                                                                                                                                     |
| Payments, public receipts, explorer, and network diagnostics | **Hosted and read-only**                     | Explorer results are limited to settled attempts; receipts complete only from decoded `PaymentSettled` evidence.                                                                                                                                                      |
| Scoped API keys and versioned API                            | **Functional, UI incomplete**                | Tested API routes cover invoices, payment links, payments, and receipts. Key issue/revoke services exist, but the dashboard only lists keys; creation and revocation currently require API calls.                                                                     |
| Hosted checkout button                                       | **Redirect-only preview**                    | The small browser loader can create a checkout link. Its iframe/modal mode is not release-ready because PayMorph deliberately sends `X-Frame-Options: DENY`, and it has no retained browser acceptance suite.                                                         |
| `@paymorph/node`                                             | **Private thin client**                      | The package wraps the implemented API and verifies webhook HMACs, but currently returns `unknown`, is not generated from OpenAPI, and is not published to npm. It must not be presented as a finished typed SDK.                                                      |
| Merchant webhooks                                            | **Implemented; public acceptance gate open** | Encrypted endpoint settings, exact-body HMAC signing, durable leases, retry scheduling, and idempotent settlement enqueueing exist. There is no merchant delivery-history/replay UI, formal secret-rotation workflow, or retained stable-public delivery artifact.    |
| WooCommerce                                                  | **Locally validated testnet MVP**            | The plugin supports USD stores, one FXRP recipient, hosted redirect, and verified `payment.settled` order completion. It has PHP boundary and local WordPress/WooCommerce runtime coverage, but no public pilot store or retained public webhook-delivery acceptance. |
| Treasury                                                     | **Read-only projection**                     | Summarizes the latest 50 settled attempts. It is not a wallet balance, custody product, withdrawal interface, yield strategy, or complete accounting ledger.                                                                                                          |
| Marketplace                                                  | **Split-settlement projection**              | Shows invoices with multiple on-chain recipients. It does not implement seller onboarding, products, orders, commissions, fulfilment, or marketplace custody.                                                                                                         |
| Recovery                                                     | **Code complete; official live gate open**   | The `0xE0` path has guarded diagnosis and evidence handling, but no retained official recovery artifact. Recovery mints eligible test FXRP to the payer; it does not settle the merchant invoice or return native XRP.                                                |
| Operator console and metrics                                 | **Implemented, operational only**            | Protected retry/diagnosis and aggregate Prometheus output exist. A hosted scraper, alerts, and deliberate executor crash/restart acceptance are not complete.                                                                                                         |

### Not implemented or not claimed

- Flare mainnet, real-value payments, custody, fiat settlement/off-ramping, or a
  completed independent security audit.
- Official SparkDEX/mainnet USDT0 routing. The existing USDT0 evidence applies
  only to the clearly labelled Coston2 `PAYMORPH_TESTNET` route.
- Post-payment merchant refunds, recurring billing/auto-debits, subscriptions,
  escrow, disputes, chargebacks, or payment reversals. The router returning
  unused FXRP during an exact-output settlement is protocol accounting, not a
  merchant refund feature.
- Automated request delivery, reminders, delivery/open reporting, customer
  CRM, full marketplace/order management, or treasury custody and withdrawals.
- A production-ready typed/npm SDK, production-ready embedded modal, public
  WooCommerce pilot, Shopify integration, or mobile merchant app.
- Confidential-compute functionality or a claim against the Confidential
  Compute bounty.

### Remaining live and release gates

1. Retain a stable-public Xaman webhook-HMAC acceptance artifact.
2. Retain the deliberate executor crash/restart settlement artifact.
3. Retain an official credentialed `0xE0` recovery artifact.
4. Repeat and retain the current POS QR flow on a real Xaman testnet device.
5. Move the executor to always-on monitored infrastructure, add alerting and
   independent reconciliation, and complete application/contract security
   reviews before any mainnet consideration.

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
  sdk/                 server-side Node client
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
  executor crash/restart acceptance, an official `0xE0` recovery artifact, and
  a retained current POS device scan. See the capability audit above for
  product-surface limitations that are separate from the core settlement proof.

## License

[MIT](LICENSE)
