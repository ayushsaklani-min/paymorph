# PayMorph

> Pay in XRP. Settle with verifiable Flare execution.

PayMorph is a **testnet-only cross-chain merchant checkout**. A payer signs
one native XRP payment in Xaman on XRPL Testnet. PayMorph validates the exact
XRPL transaction, obtains an Flare Data Connector (FDC) proof, mints FXRP to a
payer-specific Flare Smart Account, and settles an immutable merchant invoice
on Flare Coston2.

The product is designed around an important rule: a database entry, browser
redirect, or webhook is never settlement proof. An invoice is shown as settled
only after PayMorph decodes the on-chain `PaymentSettled` event emitted by its
router contract.

> **Testnet notice:** PayMorph currently uses XRPL Testnet and Flare Coston2.
> All XRP, FXRP, C2FLR, and USDT0 mentioned here are test assets with no real
> monetary value. This project is not audited and is not mainnet-ready.

## Product experience

### Merchant journey

1. Sign in with a Coston2-compatible EVM wallet such as MetaMask.
2. Create an invoice with an immutable amount, settlement asset, expiry, and
   one or more recipient splits; optionally save those defaults as a template.
3. Publish the invoice, or create a reusable/single-use payment link that
   materializes the same canonical invoice at checkout.
4. Follow the live settlement timeline or review the final verifiable receipt.

### Payer journey

1. Open the merchant’s checkout page.
2. Use Xaman SignIn to bind the payer’s XRPL Testnet account.
3. Request an exact quote. Before issuing it, PayMorph verifies that the
   configured FDC XRP verifier accepts an authenticated, read-only indexer
   request. The quote then commits the exact payer amount and settlement
   operation before the XRP payment is signed.
4. Scan the Xaman QR code or open the native Xaman request.
5. Review and approve the exact XRP Testnet payment in Xaman.
6. Keep the checkout open while PayMorph verifies the signature and guides the
   payer through:

   ```text
   Xaman approval → XRPL validation → FDC evidence → Coston2 settlement → receipt
   ```

7. View a receipt only once `PayMorphRouter.PaymentSettled` is independently
   decoded from Coston2 chain evidence.

The checkout deliberately keeps the Xaman QR visible until an authoritative
Xaman payload lookup confirms that it was signed. A websocket or a browser
return does not by itself advance the payment.

## What is implemented

| Area                                    | Status                 | Notes                                                                                                                          |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Merchant operating shell                | Implemented            | EIP-191 sign-in, dashboard projections, payment evidence views, invoices, templates, and settings.                             |
| Collection surfaces                     | Implemented            | Reusable/single-use links, requests, analytics, and POS create canonical invoices only.                                        |
| Public checkout                         | Implemented            | Payer-scoped Xaman SignIn, exact quotes, payment QR/deeplink, and an evidence-driven Xaman → XRPL → FDC → Coston2 timeline.    |
| Executor pipeline                       | Implemented            | Leased durable XRPL validation, FDC, Coston2 submission, event indexing, restart checkpoints, and recovery diagnostics.        |
| Developer platform                      | Implemented            | Scoped `pm_test_` keys, `/api/v1` invoice/receipt routes, SDK, hosted button, encrypted webhook settings, and delivery outbox. |
| Explorer and projections                | Implemented            | Public settlement evidence explorer plus marketplace and read-only treasury projections.                                       |
| WooCommerce gateway                     | MVP implemented        | Server-side invoice mapping and verified post-settlement paid-order transition; needs WordPress/WooCommerce acceptance.        |
| FXRP settlement                         | Live verified          | A tiny XRPL Testnet → FDC → Coston2 settlement was independently verified on 2026-08-01.                                       |
| USDT0 exact-output settlement           | Intentionally disabled | The configured Coston2 route does not pass required runtime bytecode and liquidity checks.                                     |
| Recovery (`0xE0`)                       | Code complete          | Durable recovery checkpoints and an independent verifier exist; an official live recovery artifact remains a gate.             |
| Refunds, subscriptions, escrow, mainnet | Deferred               | Explicitly outside the current testnet blueprint delivery scope.                                                               |

The authoritative phase ledger is maintained in
[docs/implementation-plan.md](docs/implementation-plan.md).

## Architecture

## Hosted checkout button

Create an active invoice or payment link first, then retain a normal anchor as
the no-JavaScript fallback. The loader never has a private API key and only
opens the existing hosted checkout URL:

```html
<a href="https://your-host/pay/your-invoice-slug">Pay with PayMorph</a>
<span
  data-paymorph-button
  data-mode="modal"
  data-checkout-url="https://your-host/pay/your-invoice-slug"
></span>
<script async src="https://your-host/paymorph-button.js"></script>
```

## WooCommerce integration

[`apps/woocommerce-gateway`](apps/woocommerce-gateway) is a testnet-only
gateway MVP. It uses a server-only `pm_test_` key with `invoices:write` to
create and publish one immutable invoice per WooCommerce order, then redirects
the buyer to the normal PayMorph checkout. The order stays unpaid through every
browser redirect and Xaman/XRPL intermediate state. Its WordPress REST endpoint
checks PayMorph's timestamped exact-body HMAC and marks the matching order paid
only on a `payment.settled` webhook that PayMorph emits from decoded router
evidence. See the integration [setup and operational notes](apps/woocommerce-gateway/README.md).

## Developer platform and webhooks

The API contract is [docs/api/openapi.yaml](docs/api/openapi.yaml). API keys
are scoped, hashed `pm_test_` keys; they are returned once, never sent to the
browser, and need a UUID `Idempotency-Key` on every mutation.

| Endpoint                                  | Required scope        | Purpose                               |
| ----------------------------------------- | --------------------- | ------------------------------------- |
| `GET /api/v1/invoices`                    | `invoices:read`       | List merchant invoices                |
| `POST /api/v1/invoices`                   | `invoices:write`      | Create a merchant draft invoice       |
| `POST /api/v1/invoices/:id/publish`       | `invoices:write`      | Publish immutable terms idempotently  |
| `GET /api/v1/payment-links`               | `payment-links:read`  | List hosted links with cursor paging  |
| `POST /api/v1/payment-links`              | `payment-links:write` | Create a hosted collection link       |
| `POST /api/v1/payment-links/:id/checkout` | `payment-links:write` | Launch the canonical hosted checkout  |
| `POST /api/v1/payment-links/:id/archive`  | `payment-links:write` | Archive a collection link             |
| `GET /api/v1/payments`                    | `payments:read`       | List canonical payment/evidence state |
| `GET /api/v1/payments/:id/receipt`        | `payments:read`       | Fetch final verified evidence         |

The workspace `@paymorph/node` SDK exposes invoice, payment-link, checkout,
payment-list, receipt, and exact-body webhook-verification helpers. The hosted
button has no private key and retains a normal anchor as its no-JavaScript
fallback.

Server-to-server integrations may omit `Origin`. A browser-based API mutation
must originate from `APP_URL` or an explicitly configured
`MUTATION_ALLOWED_ORIGINS` origin; cross-site requests are rejected before the
bearing API key is inspected.

Configure an HTTPS merchant webhook endpoint and secret in Settings, then run
the delivery worker on a schedule at least once per minute:

```bash
pnpm webhooks:deliver
```

PayMorph signs `timestamp + '.' + exact raw body` with HMAC-SHA256. Deliveries
are leased, use deterministic exponential backoff from one minute to 24 hours,
and become terminal after 12 attempts. `payment.settled` is created only from
decoded `PaymentSettled` evidence; a successful delivery is not settlement
proof.

```text
Merchant EVM wallet ─── EIP-191 sign-in ───┐
                                           │
Payer + Xaman ── SignIn + XRP payment ────┼──> Next.js web/API
                                           │          │
                                           │          ├── PostgreSQL
                                           │          ├── Xaman API
                                           │          └── durable jobs
                                           │
                                           └──> Executor worker
                                                       │
XRPL Testnet ── validated payment ──> FDC proof ──────┤
                                                       v
                                             Flare Coston2 Smart Account
                                                       │
                                                       v
                                             PayMorphRouter settlement
                                                       │
                                                       v
                                      PaymentSettled + RecipientPaid events
```

### Repository layout

```text
apps/
  web/               Next.js dashboard, checkout, public API, receipt UI
  executor/          Durable XRPL/FDC/Coston2 worker
  woocommerce-gateway/ Server-side testnet WooCommerce payment gateway MVP
packages/
  contracts/         Solidity router, adapter, Foundry tests, deployment manifest
  db/                Prisma schema, generated client, transactional job queue
  sdk/               @paymorph/node server SDK
  shared/            State machine, validation, amount math, ABIs, provider types
  ui/                Shared accessible React components
scripts/             Network inspection, seed, deployment verification, live smoke
docs/                Blueprint, architecture, ADRs, OpenAPI contract, runbooks
infra/               Infrastructure assets
```

For module ownership and trust boundaries, see
[docs/architecture.md](docs/architecture.md).

## Settlement authority and safety model

PayMorph separates useful workflow signals from actual proof:

| Stage                   | Required evidence                                              | Authority            |
| ----------------------- | -------------------------------------------------------------- | -------------------- |
| Payer identity          | Authoritative signed Xaman SignIn payload                      | Xaman/XRPL signature |
| XRP payment             | Validated `tesSUCCESS` transaction with exact committed fields | XRPL Testnet         |
| Mint eligibility        | `XRPPayment` proof                                             | Flare Data Connector |
| Smart Account execution | Coston2 transaction/events                                     | Flare Coston2        |
| Merchant settlement     | Decoded `PaymentSettled` and `RecipientPaid` events            | PayMorphRouter       |

Key safeguards include:

- Payer and merchant private keys never enter PayMorph.
- Money is represented as `bigint` or canonical base-unit decimal strings;
  floating-point arithmetic is not used for financial values.
- The quote, payer account, Smart Account nonce, and exact user operation are
  committed before the payer signs XRP.
- The XRPL memo contains the immutable commitment to that exact operation.
- Xaman webhooks are notifications only; PayMorph fetches the authoritative
  payload before changing signed transaction state.
- Provider-supplied checkout URLs are protocol-allowlisted before the browser
  receives them: HTTPS QR/deeplink URLs (plus Xaman/Xumm native deeplinks) and
  WSS status sockets only. Global response headers prevent framing, MIME
  sniffing, unnecessary browser permissions, and excessive referrer leakage.
- Executor logs redact credentials and opaque payment evidence. Unexpected
  provider exceptions are reduced to safe error metadata before logging.
- Every mutation, webhook, job, and chain projection is idempotent.
- On-chain `settled[paymentId]` replay protection is mandatory.
- FXRP and `AssetManagerFXRP` are discovered at runtime through the Flare
  registry and bytecode checked. Dynamic protocol addresses are not copied into
  application source.

Read [SECURITY.md](SECURITY.md) and
[docs/runbooks/security-review.md](docs/runbooks/security-review.md) before
deploying a shared environment.

## Networks and current deployment

| Network       | Purpose                              | Configuration          |
| ------------- | ------------------------------------ | ---------------------- |
| XRPL Testnet  | Payer’s native XRP payment           | `XRPL_NETWORK=testnet` |
| Flare Coston2 | FXRP minting and merchant settlement | Chain ID `114`         |

The current FXRP-only router deployment is recorded in the immutable manifest:

- Router: `0x9C7d670BE201be8a527cCDf349FE45B037eC6008`
- Deployment transaction:
  [`0x25613f…bc4c82`](https://coston2-explorer.flare.network/tx/0x25613fe12d1d980cfc2fc532850cbab3b817dc590374284c7d68094509bc4c82)
- Manifest: [packages/contracts/deployments/coston2.json](packages/contracts/deployments/coston2.json)

USDT0 is disabled on purpose. The currently documented Coston2 swap router did
not pass the required bytecode gate, so PayMorph will not claim a swap route or
fall back to mock liquidity. See
[ADR 0006](docs/adr/0006-disable-unverified-coston2-usdt0-route.md).

## Prerequisites

- Node.js 24 or newer
- pnpm 10 or newer
- Foundry, for contract work and contract tests
- PostgreSQL 16 in Ubuntu WSL on Windows, or a reachable PostgreSQL instance
- MetaMask (or another Coston2-compatible EVM wallet) for merchant testing
- Xaman for payer testing

Docker Desktop is **not required** for the supported local setup.

Merchant webhook delivery is durable and separate from the settlement worker.
Configure the endpoint/secret in Settings, then schedule `pnpm webhooks:deliver`.
The `payment.settled` event is enqueued only after decoded on-chain settlement evidence.

## Local development

### 1. Start PostgreSQL without Docker

The recommended Windows setup is a native PostgreSQL 16 cluster in WSL:

```powershell
wsl -d Ubuntu-24.04 -u root -- pg_ctlcluster 16 main start
```

If WSL stops services when the distribution goes idle, keep it alive while
developing:

```powershell
wsl -d Ubuntu-24.04 -u root -- sh -lc "pg_ctlcluster 16 main start; exec sleep infinity"
```

Use the address reported by the following command in `DATABASE_URL`:

```powershell
wsl -d Ubuntu-24.04 -- hostname -I
```

### 2. Configure the environment

```powershell
Copy-Item .env.example .env.local
```

Set the non-secret local values first:

```dotenv
APP_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://paymorph:paymorph@<WSL-IP>:5432/paymorph
MUTATION_ALLOWED_ORIGINS=http://localhost:3000
```

Generate long random values for `SESSION_SECRET` and
`DATA_ENCRYPTION_KEY_V1`. Never commit `.env.local`.

For a real testnet checkout, also configure only testnet credentials:

- `XAMAN_API_KEY`, `XAMAN_API_SECRET`, and `XAMAN_WEBHOOK_SECRET`
- `EXECUTOR_PRIVATE_KEY` for a funded **Coston2 testnet** executor wallet
- `PAYMORPH_ROUTER_ADDRESS` from the deployment manifest
- XRPL, FDC, and Coston2 RPC settings from `.env.example`

The payer uses their own Xaman/XRPL Testnet account; the merchant uses their
own Coston2 wallet. Do not add those private keys to PayMorph.

### 3. Install, migrate, and run

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` starts both deployable processes:

- Web app: http://localhost:3000
- Executor: durable background worker for XRPL/FDC/Coston2 stages

Useful local routes:

- http://localhost:3000/login — merchant wallet sign-in
- http://localhost:3000/dashboard — merchant invoices
- http://localhost:3000/dashboard/payment-links — hosted collections
- http://localhost:3000/dashboard/pos — merchant QR terminal
- http://localhost:3000/dashboard/developers — API key management
- http://localhost:3000/explorer — public settled-payment evidence search
- http://localhost:3000/network — read-only network diagnostics
- http://localhost:3000/api/health — web process health check
- http://localhost:3000/api/ready — database, Coston2, FXRP, and authenticated FDC verifier readiness
- http://localhost:3000/api/metrics — protected aggregate Prometheus metrics when `METRICS_TOKEN` is configured

### 4. Configure Xaman callback delivery

Xaman requires a public HTTPS callback for reliable notification delivery. Use
an HTTPS tunnel for local testing and configure its exact callback URL in the
Xaman Developer Console:

```text
https://<public-host>/api/webhooks/xaman
```

The public tunnel only exposes the web callback; do not expose PostgreSQL,
admin, or executor ports. Webhooks remain notifications—PayMorph still performs
an authoritative Xaman payload fetch before accepting a signature.

More detail: [docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## End-to-end testnet checklist

Before starting a live payment:

1. Confirm PostgreSQL, the web app, and executor are running.
2. Fund the executor with C2FLR on Coston2.
3. Fund the payer’s XRPL Testnet account with test XRP.
4. Confirm `http://localhost:3000/api/ready` reports database, FXRP, and FDC
   readiness, then confirm the network diagnostics page reports the FXRP path
   as ready.
5. Create and publish a small FXRP invoice.
6. Open its public checkout in the same browser session.
7. Complete Xaman SignIn, request an exact quote, and approve the exact payment.
8. Follow the guided timeline until a verified receipt appears.

After a real tiny checkout has completed, independently verify it:

```bash
RUN_LIVE_TESTNET=1 LIVE_ATTEMPT_ID=<attempt-uuid> pnpm test:live
```

The live verifier re-reads the public receipt, requires a validated XRPL
`tesSUCCESS` transaction, confirms the Coston2 receipt, and requires the
matching `PaymentSettled` event. It writes an artifact under `live-smoke/`.
Never manually turn a failed live run into success.

## Commands

| Command                                                  | Purpose                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                               | Run web and executor using `.env.local`.                          |
| `pnpm verify`                                            | Format check, lint, typecheck, unit tests, and production builds. |
| `pnpm test`                                              | Run workspace tests.                                              |
| `pnpm test:contracts`                                    | Run Foundry contract tests, fuzz tests, and invariants.           |
| `pnpm test:e2e`                                          | Run Playwright browser journeys when Chromium is installed.       |
| `pnpm db:migrate`                                        | Apply Prisma migrations.                                          |
| `pnpm db:seed`                                           | Seed development data.                                            |
| `RUN_DB_PROJECTION_ACCEPTANCE=1 pnpm test:db-projection` | Exercise the development-only receipt-projection DB fixture.      |
| `pnpm webhooks:deliver`                                  | Deliver due merchant webhook events once.                         |
| `pnpm network:resolve`                                   | Inspect runtime network and registry configuration.               |
| `pnpm verify:deployment`                                 | Verify the configured deployment.                                 |
| `pnpm contracts:deploy:coston2`                          | Deploy contracts to Coston2 with testnet-only keys.               |
| `pnpm test:live`                                         | Run the opt-in real testnet receipt verifier.                     |
| `pnpm test:live:recovery`                                | Verify and archive an evidence-backed official recovery.          |

Latest local verification (2026-08-01):

- `pnpm test` passed: 226 automated tests, including 29 Foundry
  unit/fuzz/invariant tests.
- Repository linting, typechecking, and formatting checks passed. The explicit
  full contract suite passed after the payment-link API checkpoint.
- `pnpm db:seed` and `pnpm db:cleanup` passed against native WSL PostgreSQL;
  the seed upserts only the deterministic demo merchant/invoice and cleanup
  removes expired operational records only.
- `RUN_DB_PROJECTION_ACCEPTANCE=1 pnpm test:db-projection` passed against the
  same local database. It creates and removes only a guarded development
  fixture while proving the `PaymentSettled`-gated transition, receipt
  reconstruction, recipient evidence, and settlement webhook-outbox enqueue.
- Three browser smoke journeys passed in locally installed Google Chrome via
  `PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm test:e2e`, including a keyboard path
  from the app-wide skip link to the primary content landmark.
- The full `pnpm verify` gate passed: formatting, linting, workspace
  typechecking, 226 automated tests, and all production builds.
- The protected metrics route passed focused authorization/format tests and a
  read-only local PostgreSQL route smoke; it exposes aggregate counts only.
- A direct local `/api/health` check confirmed the response security headers
  and a canonical echoed `X-Request-Id` after the web-boundary update.
- Playwright's managed Chromium and PHP/WordPress are not installed on this
  machine, so the default Chromium path and WooCommerce runtime acceptance
  remain external gates.

## API and operations

- API contract: [docs/api/openapi.yaml](docs/api/openapi.yaml)
- Executor operation: [docs/runbooks/executor.md](docs/runbooks/executor.md)
- Operator API: [docs/runbooks/operator-api.md](docs/runbooks/operator-api.md)
- Idempotency behavior: [docs/runbooks/idempotency.md](docs/runbooks/idempotency.md)
- Recovery flow: [docs/runbooks/recovery.md](docs/runbooks/recovery.md)
- Live smoke procedure: [docs/runbooks/live-smoke.md](docs/runbooks/live-smoke.md)
- Architecture decisions: [docs/adr/README.md](docs/adr/README.md)

## Honest limitations and next gates

PayMorph contains real provider and chain adapters, but code completion is not
the same as a passed live acceptance gate. The remaining gates are documented
in [memory.md](memory.md) and the implementation plan. In particular:

- The FDC and Coston2 finalization path is live-verified by a tiny FXRP smoke
  completed on 2026-08-01: XRPL transaction
  `D83B7183AC74626CA23A7D653EC7245426F320C1489A2CE740AFD05B6A95F39C`,
  Coston2 transaction
  `0xd90407028660141ea897a7387f67194d1826383e4f0afa2457f478eea98cb2e3`,
  and a matching decoded `PaymentSettled` event in block `33504164`. The
  independent verifier output is retained locally under `live-smoke/`.
- USDT0 must remain disabled until an official Coston2 router, factory, pool,
  liquidity, exact-output quote, and simulation all pass runtime checks.
- The official `0xE0` recovery sequence has a durable implementation and
  independent verifier, but still needs a real testnet acceptance artifact.
- The WooCommerce gateway requires an installed WordPress/WooCommerce test
  environment before it can be called live-ready.
- A production release needs a stable HTTPS host, managed PostgreSQL, secret
  management, monitoring, backups, an external security review, and mainnet
  specific protocol validation. It must not reuse this testnet setup.

## Contributing

Read [AGENTS.md](AGENTS.md) first. Keep protocol invariants intact, make small
targeted changes, add or update tests, run the smallest relevant verification,
and update [memory.md](memory.md) when a verified decision or delivery state
changes.

## Security

PayMorph is testnet software and has not been audited. Do not use it for
real-value payments. Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).
