# PayMorph implementation plan

This plan maps directly to Section 28 of the blueprint. A phase is complete only
when its exit gate passes. Provider-bound acceptance tests use fixtures locally
and a separately invoked real-testnet smoke; production code never falls back
to fixture behavior.

## Phase ledger

| Phase | Scope                                                                     | Exit gate                              | Status                                                 |
| ----- | ------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| 0     | Workspace, strict TS, lint/format, Postgres, Prisma, shared envelopes, CI | `pnpm verify`, health route, migration | Local complete; native DB migrated                     |
| 1     | Router, SparkDEX adapter, deployment scripts, Foundry tests               | unit/fuzz/invariant tests              | Complete; FXRP router deployed                         |
| 2     | Registry, FAssets/FTSO helpers, amounts, capability checks                | verified network report + fixtures     | Complete                                               |
| 3     | Merchant signed auth, sessions, invoices, dashboard                       | ownership and lifecycle tests          | Complete                                               |
| 4     | Public checkout, payer session, Xaman SignIn, webhook                     | payload/dedupe/mobile tests            | Code complete; live gate                               |
| 5     | Pricing, personal account/nonce, userOp, `0xFE` memo                      | golden vectors, expiry/nonce tests     | Complete                                               |
| 6     | Xaman Payment, timeline, XRPL validator                                   | exact-field validation tests           | Code complete; live gate                               |
| 7     | FDC executor, Coston2 submission, event decoding                          | real tiny FXRP smoke                   | Complete; live verified 2026-08-01                     |
| 8     | USDT0 route, exact-output settlement/refund                               | real smoke or explicit disabled reason | On-chain `PAYMORPH_TESTNET` route; payer smoke pending |
| 9     | Receipts, event reconstruction, reconciliation, export                    | projection rebuild test                | Complete; local DB projection gate                     |
| 10    | `0xE0` recovery diagnostics and payer flow                                | reproducible official recovery test    | Code complete; official gate                           |
| 11    | Abuse controls, admin, logs/metrics, accessibility, UX                    | security checklist + all suites        | Partial; boundaries, logs, a11y, metrics               |
| 12    | Containers, hosted config, smoke artifact, submission docs                | README-driven judge flow               | Local complete; host gate                              |

## USDT0 quote-path hardening — 2026-08-01

- The quote path is now asset-neutral: FXRP retains direct settlement, while a
  USDT0 invoice can proceed only after runtime DEX health passes and a fresh
  QuoterV2 exact-output `eth_call` returns the required FXRP input for the
  invoice plus service fee. Slippage is applied as an integer ceil bound.
- Before committing bytes, PayMorph verifies its settlement router's FXRP and
  USDT0 tokens and the configured adapter's router, DEX router, token pair, and
  pool-fee identity. The quote persists the quoted FXRP input and DEX route
  snapshot for audit alongside the encrypted immutable user operation.
- ADR 0006 still keeps the official SparkDEX route unavailable on Coston2. ADR
  0007 records the product-owner-authorized, separately labelled
  `PAYMORPH_TESTNET` route instead: it has a real-token exact-output router,
  factory, quoter, liquidity projection, 5-test-USDT0 liquidity transfer, and
  matching adapter deployed on Coston2. This is not a SparkDEX claim or a
  mainnet route. A payer-signed checkout and independent receipt remain the
  required end-to-end evidence.

`DB gate` means the implementation and unit coverage exist, but the acceptance
test still requires a reachable PostgreSQL instance. `Live gate` means real
testnet credentials, deployed contract addresses, and retained transaction
artifacts are required; fixtures do not satisfy it.

## Verification snapshot — 2026-07-27

- `pnpm verify`: passed (format, lint, typecheck, tests, production builds).
- Automated tests: 174 passed, including 29 Foundry
  unit/fuzz/invariant tests.
- Prisma client generation and schema validation: passed.
- OpenAPI: 24 paths, 27 operations, 84 schemas, and 323 resolved references.
- Dependency audit at high severity: passed; one low-severity advisory remains.
- Read-only Coston2 network resolution: passed at block 33,296,723.
- Production executor deploy/package smoke: passed through dependency loading
  and stopped at the expected missing-secret validation boundary.
- Playwright journeys: blocked because Chromium could not be downloaded.
- PostgreSQL migration acceptance: seven migrations applied successfully to
  native PostgreSQL 16 in Ubuntu WSL; the database-backed merchant nonce route
  returned HTTP 201. Seed, queue lease, and projection-rebuild acceptance remain.
- FXRP-only router deployment: verified on Coston2 at
  `0x9C7d670BE201be8a527cCDf349FE45B037eC6008`; transaction
  `0x25613fe12d1d980cfc2fc532850cbab3b817dc590374284c7d68094509bc4c82`.
  Manifest: `packages/contracts/deployments/coston2.json`.
- Credentialed Xaman/XRPL/FDC/Coston2 smoke: not run; it still requires a
  stable public HTTPS callback, database, FDC readiness, and retained receipts.

## Browser acceptance update — 2026-08-01

- Playwright's managed Chromium download still exceeded the local shell limit,
  but the two browser smoke journeys passed against the locally installed
  Google Chrome using `PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm test:e2e`.
  They verify the evidence-first testnet disclosure and the landing-to-
  merchant-wallet sign-in navigation after the UI refresh. This is browser
  surface coverage, not live settlement evidence.

## FDC admission update — 2026-08-01

- Readiness and FXRP quote creation now make an authenticated, read-only XRP
  indexer request to the configured FDC verifier. Missing, unauthorized,
  malformed, or unavailable verifier responses prevent quote creation before a
  payer can sign XRP. The local public Coston2 verifier key and the live
  `/api/ready` response were verified; this is not an FDC proof or settlement
  artifact.
- `@paymorph/db` now includes its development source in the injected workspace
  package. A normal `pnpm install` followed by executor startup was verified,
  so the source executor no longer resolves a missing `@paymorph/db/src` path.

## Recovery execution update — 2026-08-01

- The recovery executor durably checkpoints the recovery FDC request/proof and
  its marker/original Coston2 submissions. `RECOVERED` is guarded by persisted,
  decoded evidence for both receipts; it rejects a recovery user operation or
  merchant settlement.
- `pnpm test:live:recovery` now independently re-validates the exact `0xE0`
  XRPL payment, the marker/original receipt evidence, and the absence of a
  PayMorph settlement before writing an ignored `live-smoke/` artifact. This
  completes the code phase, not the official credentialed testnet gate.

## Local operational-script update — 2026-08-01

- Root TypeScript operational scripts now run under explicit ESM semantics, so
  their documented top-level `await` behavior works consistently through
  `dotenv-cli` and `tsx`.
- `pnpm db:seed` successfully upserted the deterministic demo merchant/invoice;
  `pnpm db:cleanup` removed only expired rate-limit, idempotency, and
  authentication records. The Google Chrome browser smoke passed 2/2 against
  the local server. These checks do not create a payment attempt or any chain
  transaction.

## Database projection acceptance update — 2026-08-01

- `RUN_DB_PROJECTION_ACCEPTANCE=1 pnpm test:db-projection` passed against the
  native WSL PostgreSQL instance. Its guarded development-only fixture starts
  at `FLARE_CONFIRMED`, advances only through the normal
  `PaymentSettled`-evidence transition, rebuilds the public receipt from the
  normalized `PaymentSettled`/`RecipientPaid` events, verifies the one
  `payment.settled` outbox entry, and proves all fixture records are removed
  before reporting success. It does not create an XRPL, FDC, or Coston2
  transaction.
- Root script typechecking also repaired the recovery verifier's stale router
  field: it now requires `PAYMORPH_ROUTER_ADDRESS` and verifies bytecode at
  that configured address before checking that recovery receipts contain no
  router `PaymentSettled` event.
- The complete local `pnpm verify` gate passed afterward: formatting, lint,
  workspace typechecking, 207 automated tests (including all 29 Foundry
  tests), and every production build.

## Web-boundary hardening update — 2026-08-01

- All web responses now receive targeted anti-framing, anti-MIME-sniffing,
  referrer, browser-permission, and cross-domain-policy headers. A restrictive
  CSP or cross-origin isolation policy is intentionally deferred until the
  third-party Xaman QR/deeplink/WebSocket flow has browser acceptance coverage.
- Client-facing Xaman create responses now permit only HTTPS QR images, WSS
  status sockets, and HTTPS/Xaman/Xumm deeplinks without URL credentials.
  The response is rejected before checkout renders if it violates that boundary.
- API request IDs are now bounded before returning or logging them. Generic
  unexpected failures log a structured event without serializing arbitrary
  error text or objects. Focused HTTP, header, and Xaman-boundary tests passed,
  followed by `pnpm verify` (226 automated tests and all production builds)
  and `pnpm test:contracts` (29 Foundry tests). A direct local health check
  confirmed all configured response headers and canonical request-ID handling.

## Executor logging hardening update — 2026-08-01

- The executor now creates its Pino logger through one tested boundary. It
  redacts credential and opaque-evidence fields and serializes thrown errors
  only as a safe type plus an allowlisted machine-readable code when available.
  This protects logs from provider error messages, stacks, request headers, and
  raw bodies while retaining correlated job/attempt metadata.
- Focused logger tests passed, followed by `pnpm verify` (226 automated tests,
  every production build) and `pnpm test:contracts` (29 Foundry tests). This
  improves local operational safety; it does not establish any live payment or
  settlement evidence.

## Accessibility navigation update — 2026-08-01

- All 24 route-owned semantic `main` landmarks now expose the same focusable
  `#main-content` target. The root shell provides a first-tab “Skip to main
  content” link, so keyboard users can bypass repeated navigation without
  nesting or duplicating main landmarks.
- The local Chrome browser suite now passes three journeys: evidence/testnet
  disclosure, landing-to-merchant sign-in, and keyboard skip navigation.
  `pnpm verify` (226 automated tests/all production builds) and
  `pnpm test:contracts` (29 Foundry tests) also passed. This only improves
  semantic navigation and does not alter checkout or settlement behavior.

## Protected metrics update — 2026-08-01

- `/api/metrics` is now a read-only Prometheus text endpoint authenticated by a
  dedicated high-entropy `METRICS_TOKEN`. It exposes only aggregate payment
  attempt, durable executor-job, merchant-webhook delivery counts, and the
  number of due executor jobs. It never returns identities, amounts, hashes,
  provider payloads, proofs, raw errors, or settlement claims.
- Metrics authentication/label-boundary tests and a read-only local PostgreSQL
  route smoke passed. `pnpm verify` (226 automated tests/all production builds)
  and `pnpm test:contracts` (29 Foundry tests) passed afterward. Alerting,
  hosted scraper reachability, and live settlement remain deployment/live gates.

## Product-platform update — 2026-07-31

- Merchant operating shell, templates, payment links, requests, POS, public
  explorer, marketplace projection, and read-only treasury projection are
  implemented over the canonical invoice/attempt evidence model.
- The developer platform now has scoped hashed test API keys, the versioned
  invoice and receipt endpoints, idempotent API invoice publication,
  `@paymorph/node`, a hosted checkout button, encrypted merchant webhook
  settings, and a leased, signed webhook outbox with deterministic exponential
  retries. `payment.settled` remains created only from decoded
  `PaymentSettled` evidence.
- The versioned bearer API now also manages payment links with dedicated
  `payment-links:read` and `payment-links:write` scopes. Its checkout launch
  materializes the same canonical invoice used by the public link, preserves
  single-use serialization, and returns the hosted URL without creating a
  payment attempt. Local acceptance covered create, list, launch, archive, and
  temporary-key revocation.
- All versioned bearer-key mutations now pass through the same origin boundary
  as the merchant-cookie API. Server integrations remain valid without an
  `Origin` header, while browser cross-site mutations are rejected before key
  authentication; a focused regression test covers the fail-closed path.
- The developer API now lists merchant-owned payment attempts through a
  cursor-paginated `payments:read` resource. It exposes canonical base-unit
  amounts and evidence checkpoints only; it never returns raw Xaman payloads,
  FDC proof data, or decrypted user operations.
- Its versioned payment-link list now uses the same cursor-pagination contract,
  while the merchant-cookie dashboard endpoint retains its intentionally simple
  full-list response.
- The current read-only Coston2 resolution and router-verification scripts pass
  with FXRP available. USDT0 remains disabled under its existing no-code swap
  router safety gate; neither script broadcasts a transaction.
- A testnet-only WooCommerce gateway MVP creates and publishes a canonical
  invoice server-side, persists its external order mapping before retry, and
  changes a WooCommerce order to paid only after exact-body HMAC verification
  of that evidence-backed webhook. It still needs a WordPress/WooCommerce
  acceptance environment.
- Local migration `20260731140000_webhook_delivery_schedule` is applied to the
  native PostgreSQL database, bringing the local schema to 15 migrations.
- Latest full verification passed: `pnpm verify` completed formatting, all
  workspace lint/typechecks, 226 automated tests (including 29 Foundry
  unit/fuzz/invariant tests), and every production build. The explicit
  `pnpm test:contracts` gate also passed. PHP/WordPress is not installed
  locally, so plugin syntax and external-order acceptance remain unexecuted.

## Cross-phase workstreams

### Contracts

Implement token-conserving settlement first. Mock ERC-20 and swap pools exist
only in tests. Deployment always resolves FXRP dynamically and validates
configured Coston2 contracts before broadcasting.

### Domain and persistence

Build immutable quote/payment identifiers, exact amount math, transition guards,
API schemas, encryption envelope, normalized chain events, Prisma relations,
and restart-safe queue claims before provider orchestration.

### Providers and executor

Every provider sits behind a typed adapter. Official Flare/Xaman behavior is
ported, not guessed. The executor records stable external identifiers and uses
reconciliation to survive crashes between submission and persistence.

### Web product

Build merchant auth/invoice flows, public checkout, Xaman two-step experience,
real-time/polling status, permanent receipts, diagnostics, operator tooling,
and honest degraded states. All monetary views carry a testnet disclaimer.

## Verification strategy

- Pure/domain: Vitest property and golden-vector tests.
- Database/API: Vitest integration tests against PostgreSQL.
- Contracts: Foundry unit, fuzz, invariant, and malicious-adapter tests.
- UI: component tests and Playwright user journeys with provider boundaries
  controlled by test doubles.
- Live: opt-in machine-readable smoke against XRPL Testnet and Coston2.

## Delivery rules

- Update `memory.md` at each phase boundary.
- Record official-protocol deviations in `docs/adr/`.
- Keep a machine-readable deployment manifest under `deployments/`.
- Do not label a credential-dependent live gate complete unless hashes and
  receipt artifacts were produced.
