# PayMorph project memory

Last updated: 2026-08-01

## Product objective

PayMorph is a testnet cross-chain merchant checkout. A payer identifies with
Xaman and signs one native XRP payment on XRPL Testnet. Flare's FAssets/FDC and
Smart Account flow mints FXRP on Coston2 and atomically settles an invoice in
FXRP, or swaps through a verified allowlisted route for exact-output USDT0.
Receipts must be reconstructed from on-chain evidence.

## Source of truth

- Normative product blueprint:
  `docs/reference/PayMorph_Complete_Blueprint.pdf` (version 1.0, 51 pages,
  dated 2026-07-27).
- Expanded merchant-platform product blueprint:
  `docs/reference/PayMorph_Full_Product_Blueprint.docx` (received 2026-07-31).
  It is aligned with the normative evidence model and governs product-surface
  expansion; the PDF remains authoritative for payment-protocol invariants.
- Repository instructions: `AGENTS.md`.
- Architecture decisions: `docs/architecture.md` and `docs/adr/`.
- API contract: `docs/api/openapi.yaml`.

Do not turn an assumption into an implementation fact. Unverified external
protocol details stay behind typed adapters and are recorded under "Open
verification items".

## Non-negotiable facts

- Networks: XRPL Testnet and Flare Coston2 (chain ID 114).
- Coston2 registry configured by environment; blueprint reference address:
  `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`.
- XRP and FXRP use 6-decimal base units in the blueprint protocol.
- The XRPL `0xFE` memo is exactly 42 bytes:
  instruction ID (1), wallet ID (1), executor fee UBA (8, uint64), and
  `keccak256(abi.encode(PackedUserOperation))` (32).
- Quotes and committed user-operation bytes are immutable and single-use.
- Published invoice financial terms are immutable.
- Recipient basis points total exactly 10,000; 1-10 unique, nonzero recipients.
- The payer funds invoice amount plus service fee; default 50 bps, maximum
  on-chain 300 bps.
- Settlement requires `PayMorphRouter.PaymentSettled`.
- All customer-facing financial screens must say testnet tokens have no real
  value.

## Current status

- Repository isolated from unrelated parent Git state.
- Blueprint moved to `docs/reference/`.
- The clean pnpm monorepo, strict TypeScript configuration, CI, containers,
  Prisma migrations, seed tooling, API contract, and runbooks are implemented.
- The local verification gate passes: format, lint, typecheck, 226 automated
  tests, all production builds, 29 Foundry unit/fuzz/invariant tests, Prisma
  generation/validation, and the OpenAPI structural check.
- Phase 2 read-only Flare provider, direct-mint amount solver, capability gate,
  fixtures, and network resolver are implemented and verified.
- Merchant wallet authentication, invoice lifecycle/dashboard, public checkout,
  immutable quote construction, Smart Account operation encoding, and the
  exact 42-byte `0xFE` memo are implemented.
- Phase 4 public checkout identity is implemented: invoice-bound opaque payer
  sessions, persisted Xaman SignIn payloads, authoritative resolution,
  HMAC/replay-safe webhook handling, and the mobile QR/deeplink checkout UI.
- Implemented invoice creation, public quote, and Xaman Payment payload routes
  enforce resource-scoped UUID idempotency, canonical request hashing,
  concurrent claims, and stored successful-response replay.
- Implemented operator attempt search and safe retry enqueueing behind a
  separate environment-provisioned operator cookie. The API exposes redacted
  projections only; the protected `/admin/attempts` UI adds filters, job
  summaries, safe retry actions, and read-only recovery diagnosis. Neither
  surface treats an enqueue response as execution evidence.
- The executor now runs a leased durable pipeline for `VALIDATE_XRPL`,
  `REQUEST_FDC`, `SUBMIT_FLARE`, and `INDEX_EVENTS`. Each stage persists a
  restart checkpoint before changing workflow state; committed user-operation
  bytes are decrypted only inside the Flare handler with quote-specific AAD.
- Receipt projection writes bigint-safe raw Flare receipt checkpoints and
  separately normalized `PaymentSettled`/`RecipientPaid` event payloads.
  `SETTLED` remains reachable only through persisted `PaymentSettled` evidence.
- Database projection acceptance (2026-08-01): the guarded
  `RUN_DB_PROJECTION_ACCEPTANCE=1 pnpm test:db-projection` verifier passed
  against native WSL PostgreSQL. Its temporary development-only fixture proves
  the real `PaymentSettled` transition guard, public receipt reconstruction,
  RecipientPaid projection, and the single settlement webhook-outbox enqueue;
  it checks that every fixture row is removed before reporting success. It does
  not contact Xaman, XRPL, FDC, or Coston2. The recovery live verifier now also
  requires the configured router address and bytecode before inspecting its
  receipt logs.
- The production-only executor package has been smoke-loaded successfully:
  workspace dependencies and the package-owned generated Prisma client resolve,
  and startup stops at the expected strict missing-secret validation boundary.
- Native PostgreSQL 16 is running in Ubuntu WSL; all seven Prisma migrations
  are applied to the local `paymorph` database and a real HTTP merchant nonce
  request returned 201 with persisted challenge data. Docker Desktop is not
  part of this setup. Playwright browser acceptance remains blocked because
  Chromium could not be downloaded. Unit and build coverage passes.
- The FXRP-only `PayMorphRouter` is deployed and independently verified on
  Coston2. The immutable deployment manifest is
  `packages/contracts/deployments/coston2.json`; deployment transaction
  `0x25613fe12d1d980cfc2fc532850cbab3b817dc590374284c7d68094509bc4c82`
  created router `0x9C7d670BE201be8a527cCDf349FE45B037eC6008` from source
  commit `a674e446f90c9dc4949babb85dbcbea0fac4f3f8`.
- Credentialed Xaman/FDC/Coston2 submission was independently live-verified on
  2026-08-01 for a tiny FXRP checkout. The retained local verifier artifact
  confirms XRPL `tesSUCCESS` transaction
  `D83B7183AC74626CA23A7D653EC7245426F320C1489A2CE740AFD05B6A95F39C`,
  Coston2 transaction
  `0xd90407028660141ea897a7387f67194d1826383e4f0afa2457f478eea98cb2e3`,
  and matching `PayMorphRouter.PaymentSettled` at Coston2 block `33504164`.
  This proves that one configured testnet path settled; it is not a production
  readiness claim or a substitute for separate recovery/USDT0 gates.
- Visual-system refinement (2026-08-01): PayMorph now uses its own warm
  ember/orange editorial system with layered glass surfaces, display/data
  typography, a native CSS earth motif, moving public-chain protocol-fact
  cards, scroll motion, and reduced-motion support. The landing,
  login, dashboard, checkout/status, explorer, network, and receipt surfaces
  share this system. Card and panel surfaces now use a square-cornered box
  treatment across the application; rounded controls, status pills, and
  indicators remain intentionally distinct and actionable. NullPay was used
  only as a local visual reference; no
  code, raster asset, wording, or settlement behavior was copied or changed.
  The landing rail pairs linked XRPL/Flare protocol facts with an affirmative
  PayMorph confidence story: clear live progress, exact committed payment
  instructions, and an evidence-earned receipt. Its understated public-context
  links point to individual r/XRP posts about status ambiguity, recipient
  credit delays, and destination-tag errors, but the product copy does not
  reproduce or display those critiques. This is not a privacy claim, a protocol
  fact, or an attributed Discord message. Web typecheck, lint, 126 web tests,
  both local Chrome landing journeys, and direct HTTP shell checks passed. The
  isolated production build exceeded the shell's 94-second command limit
  without reporting a source failure and was stopped; do not treat that as a
  production-build pass.
- Browser acceptance update (2026-08-01): the public disclosure,
  landing-to-merchant-wallet sign-in, and keyboard skip-to-main journeys pass
  in local Google Chrome via `PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm test:e2e`.
  The configured default remains Playwright Chromium for CI. This covers the
  rendered shell after the UI refresh; it does not prove credentialed
  settlement behavior.
- FDC admission hardening (2026-08-01): `/api/ready` and FXRP quote creation
  now require an authenticated, read-only XRP indexer response from the
  configured FDC verifier. This prevents a payer from being asked to sign when
  the verifier key is missing, unauthorized, malformed, or unavailable. The
  local documented public Coston2 testnet key was verified through the actual
  readiness endpoint and against the previously validated XRPL transaction;
  this is not a proof, mint, or settlement artifact.
- Read-only local preflight (2026-08-01): after restarting the documented
  native WSL PostgreSQL and local web/executor processes, `/api/health` and
  `/api/ready` both returned HTTP 200. The readiness projection reported
  database, FXRP, and authenticated FDC verifier `ready`; the current network
  reported Coston2 chain 114 with FXRP available. USDT0 remains fail-closed as
  `SWAP_ROUTER_NO_CODE`. These checks were read-only and did not create a
  Xaman payload, payment attempt, XRPL transaction, FDC proof, or Coston2
  transaction.
- Local executor startup hardening (2026-08-01): the injected `@paymorph/db`
  package now includes its declared development source export. After a normal
  workspace install, the executor started successfully with the configured
  FDC verifier; startup is not evidence of an XRPL, FDC, or Coston2 payment.
- Recovery execution reconciliation (2026-08-01): the durable `0xE0` recovery
  implementation already persists recovery-FDC, marker, and original Coston2
  checkpoints and verifies the evidence before `RECOVERED`. The runbook and
  phase ledger now reflect that code-complete status; receipt decoding and the
  independent live verifier also reject any recovery marker/original user
  operation or PayMorph settlement. An official recovery artifact is still an
  external live gate.
- Root operational-script verification (2026-08-01): the root package is now
  explicitly ESM so the documented `tsx` scripts may safely use top-level
  `await`. `pnpm db:seed` upserted the deterministic demo merchant/invoice and
  `pnpm db:cleanup` removed only expired operational data. The local Chrome
  browser smoke also passed after the native WSL PostgreSQL keepalive was
  restored. Neither action creates a payment attempt or chain transaction.
- Developer API expansion (2026-08-01): scoped bearer-key integrations now
  list/create/archive payment links and launch their canonical hosted checkout.
  The launch route delegates to the existing serializable link service, so it
  creates or reuses only the canonical invoice and never an independent payment
  session/attempt. `payment-links:read` and `payment-links:write` are separate
  least-privilege scopes. A local acceptance run created/listed/launched/
  archived a link and revoked its temporary key without creating a payment
  payload or chain transaction. The final API checkpoint passed the full 195
  test suite, all workspace lint/typecheck checks, formatting, and the explicit
  29-test Foundry gate. The all-in-one production build command exceeded this
  shell's 95-second limit without reporting a source failure; the individual
  web production build passed before the final test-only assertion refinement.
- Versioned API mutation hardening (2026-08-01): every current bearer-key
  mutation now uses a shared fail-closed origin guard. This retains legitimate
  server-to-server calls with no `Origin` header, but rejects a cross-site
  browser request before bearer-key authentication. The route boundary and
  regression test add no payment, provider, or chain behavior.
- SDK build hygiene (2026-08-01): SDK source tests are excluded from production
  `dist/` output and the test runner excludes generated artifacts, preventing a
  stale compiled test from being executed as a second source test after a local
  build. The authoritative workspace source-suite count is 196.
- Payment-list API expansion (2026-08-01): `GET /api/v1/payments` is now a
  merchant-scoped cursor-paginated `payments:read` projection. It returns
  canonical base-unit amounts, status, and available XRPL/Coston2 evidence
  checkpoints only; it excludes Xaman payload material, FDC proof blobs, and
  decrypted user-operation bytes. This is read-only and does not create or
  advance an attempt. Local acceptance used a temporary read-only key and then
  revoked it; the 207-test workspace suite, workspace lint/typecheck, format,
  contract gate, and current isolated web production build all passed.
- Payment-link API pagination (2026-08-01): `GET /api/v1/payment-links` now
  accepts canonical `cursor`, `limit` (1–100), and `status` parameters and
  returns a merchant-scoped `{ items, nextCursor }` page under the existing
  `payment-links:read` scope. The cookie-authenticated dashboard retains its
  complete local list; no payment link, invoice, attempt, provider payload, or
  chain state is created by the read-only API. Its parser/pagination coverage,
  full 119-test web suite, SDK test/typecheck/lint, web typecheck/lint, and
  focused Chrome browser journeys passed.
- Read-only testnet revalidation (2026-08-01): the configured Coston2 registry,
  AssetManagerFXRP, MasterAccountController, FTSO feed, FXRP token, and deployed
  PayMorph router all resolved and verified at current chain blocks. FXRP is
  available; USDT0 remains intentionally disabled because its configured swap
  router has no bytecode. These checks sent no XRPL or Coston2 transaction.
- Web boundary hardening (2026-08-01): all Next responses now receive targeted
  anti-framing, anti-MIME-sniffing, referrer, permission, and cross-domain
  policy headers. Checkout rejects unsafe provider response URLs before
  rendering them: QR images are HTTPS only, status sockets are WSS only, and
  deeplinks are HTTPS/Xaman/Xumm URLs without credentials. API correlation IDs
  are bounded before response/log use, and unexpected error logs preserve only
  safe event metadata. Focused web boundary tests, typecheck, and lint passed,
  followed by the full `pnpm verify` gate (226 automated tests/all production
  builds) and `pnpm test:contracts` (29 Foundry tests). A direct local
  `/api/health` request confirmed the headers and canonical request-ID echo.
- Executor logging hardening (2026-08-01): the application now creates its
  Pino logger through a tested redaction boundary. Credential/opaque-evidence
  field names are censored, while arbitrary provider error messages and stacks
  are replaced by a safe error type and optional allowlisted code. Focused
  logger testing plus the full `pnpm verify` gate (226 automated tests/all
  production builds) and `pnpm test:contracts` (29 Foundry tests) passed. This
  is local logging protection, not a live payment or settlement artifact.
- Accessibility navigation update (2026-08-01): each of the 24 route-owned
  semantic main landmarks now has the same focusable `#main-content` ID. The
  root shell's first-tab skip link works before hydration, and the local Chrome
  browser smoke passed all three journeys including that keyboard path. The
  full `pnpm verify` and `pnpm test:contracts` gates passed afterward. This
  changes only semantic navigation, not payment behavior.
- Protected metrics update (2026-08-01): `/api/metrics` now requires a
  dedicated `METRICS_TOKEN` bearer token and emits only aggregate Prometheus
  counts for attempts, durable executor jobs, merchant webhook deliveries, and
  jobs due for execution. Authentication/label tests plus a read-only local
  PostgreSQL route smoke passed; the final full gate covered 226 automated
  tests, all production builds, and 29 Foundry tests. Metrics do not prove
  readiness, settlement, or any external alerting configuration.
- Local web runtime recheck (2026-08-01): a stale web process that did not
  inherit `.env.local` was replaced with the documented environment-loaded
  PayMorph web process. `GET /api/health` and `GET /api/ready` both returned
  HTTP 200 with `no-store` and canonical request IDs. An unauthenticated
  `GET /api/metrics` returned the expected HTTP 403 because no
  `METRICS_TOKEN` is configured locally. This was read-only and created no
  provider payload, payment attempt, XRPL transaction, FDC proof, or Coston2
  transaction.
- Local executor runtime recheck (2026-08-01): before starting the
  environment-loaded executor, a read-only queue inspection found only two
  succeeded `VALIDATE_XRPL` jobs and two succeeded `REQUEST_FDC` jobs; no
  queued or leased job existed. The watched executor process is now active.
  Starting it did not create a job, provider payload, XRPL transaction, FDC
  proof, or Coston2 transaction.
- Live FXRP checkout preflight (2026-08-01): `/api/ready` returned HTTP 200
  with the configured public-HTTPS application URL, Xaman credentials and
  webhook secret, executor key, and deployed router all present. An active,
  unexpired `demo-fxrp-checkout` invoice has no attempts and is safe for a
  fresh payer session. This was a read-only configuration/database check; no
  Xaman payload, XRPL payment, FDC proof, or Coston2 transaction was created.
- Checkout reconciliation and FDC propagation hardening (2026-08-01): the
  browser now keeps non-terminal Xaman resolution failures in a clear
  “Safely confirming the signed payment” state and polls every four seconds;
  only known terminal signer/payment failures are shown as red errors. The
  payment notification transaction retries serializable/unique conflicts so a
  browser poll and webhook cannot surface a transient internal error. The FDC
  client treats only the observed structured DA response
  `400 {"error":"attestation request not found"}` as proof propagation pending;
  arbitrary DA 400 responses remain terminal. New executor jobs have a
  60-attempt default (ten minutes at the current ten-second FDC cadence), and
  local PostgreSQL migration `20260801000000_executor_job_retry_window` is
  applied. The full workspace test suite passed (129 web, 35 executor, 32
  shared, 4 database, and 29 contract tests), as did format checking and full
  workspace typechecking; focused executor/web lint passed. The aggregate
  `pnpm verify`, full lint, and isolated web production-build commands each
  exceeded this shell's two-minute limit without reporting a source failure, so
  they are not recorded as passes. The watched executor restarted from source
  changes and local web health returned HTTP 200.
- Live checkout caution (2026-08-01): the newest signed FXRP attempt
  `1cdbed5b-9c02-4c76-b43a-4187378223c5` validated on XRPL Testnet but reached
  `RECOVERY_REQUIRED` under the pre-fix classification of the DA propagation
  response. It has no Coston2 transaction or `PaymentSettled` evidence and
  must not be manually rewound or reported as settled. The correction applies
  to future attempts; use only the existing evidence-guarded recovery path for
  this historical attempt.
- Browser-extension overlay containment (2026-08-01): the root's
  before-interactive guard now suppresses only the exact Chrome extension
  transport message `Could not establish connection. Receiving end does not
exist.` before Next development tooling can promote it to a runtime overlay.
  It does not suppress any other browser or PayMorph error. Web typecheck,
  targeted lint, formatting, and a local HTTP page check passed.
- Live FXRP end-to-end acceptance (2026-08-01): a new `demo 6` invoice reached
  `SETTLED` after Xaman SignIn/payment, exact XRPL Testnet validation, FDC
  round `1412776`, Coston2 direct-mint/router execution, and event indexing.
  The attempt has the XRPL and Coston2 hashes recorded above, a decoded
  `RecipientPaid` event (log 12), and the authoritative decoded
  `PaymentSettled` event (log 14) at Coston2 block `33504164`. The independent
  read-only verifier passed and wrote ignored local artifact
  `live-smoke/1fcb716b-ae6d-4b24-96f6-e074eb6fab84.json`. Its first call was
  blocked by an expired temporary Cloudflare `APP_URL`; rerunning against the
  active local app did not create or modify any chain transaction and passed.
- USDT0 route revalidation (2026-08-01): at Coston2 block `33507562`, the
  configured testnet USDT0 token and FXRP token had bytecode, but the documented
  SparkDEX V3 SwapRouter `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781` and V3
  factory `0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652` had no Coston2 bytecode.
  The official Flare USDT0/FXRP swap guide explicitly labels those addresses as
  Flare Mainnet addresses; it is not evidence for a Coston2 route. USDT0 stays
  fail-closed as `SWAP_ROUTER_NO_CODE`. Do not deploy a mock or silently switch
  DEXs. A real custom testnet route would be a blueprint/ADR change that needs
  explicit authorization, deployment authority, and real Coston2 test liquidity.
- USDT0 quote-path hardening (2026-08-01): the immutable quote service now
  supports the real exact-output flow behind ADR 0006's gate. It fresh-resolves
  the configured route, confirms the PayMorph router and adapter identities,
  simulates SparkDEX-compatible QuoterV2 for the invoice plus service fee,
  applies only bigint ceil slippage, creates `settleUsdt0ExactOut` bytes, and
  persists the quoted FXRP input plus router/quoter/pool snapshot. Local
  migration `20260801010000_usdt0_quote_audit` is applied. This does not enable
  USDT0: Coston2 remains `SWAP_ROUTER_NO_CODE`, no mock or fallback route was
  introduced, and no XRPL/FDC/Coston2 transaction was sent. Shared tests (34),
  shared/web lint and typechecks, and web tests (129) pass. Exact quote/adaptor
  logic remains unit-tested until a real Coston2 deployment satisfies the live
  gate.
- Coston2 USDT0 route deployment (2026-08-01): the official SparkDEX router
  and factory remain absent, so ADR 0006 remains in force for official route
  claims. Under the product owner's explicit request, ADR 0007 records a
  separately labelled `PAYMORPH_TESTNET` real-token exact-output route. Its
  factory `0xD8019c06Bf594d646c0a35F8F63a4E8Ceb872422`, swap router
  `0x6115F90F2B8E9FaDd87Ac5B02F89FeEec92930f8`, pool
  `0x75374f89b3277C8dadDA193f3B9dc83D5b52dA10`, quoter
  `0x036B2D2BCB8A477f772D32f076640C3E26bC56ee`, and adapter
  `0x70dCd03Cf5b79f7C4b0352842B54F87A2C890a36` were deployed and verified
  at block 33,510,005. The deployed route holds 5,000,000 USDT0 base units of
  actual Coston2 test-token liquidity, its exact-output quote for 1,005,000
  USDT0 returns 1,005,000 FXRP base units, and the existing PayMorph router is
  wired to the matching adapter. `/api/ready` now reports USDT0 ready with
  `PAYMORPH_TESTNET`; no mocked price, liquidity, or settlement evidence was
  introduced. A payer-controlled USDT0 checkout was independently live-verified
  on 2026-08-01: attempt `6f7320bc-eb35-4842-855d-6e8a1039b0a7`, XRPL
  transaction `C0523EFE1DCDD7B66288FAA4FE30C2AB20AC3D7F7550E634A534CAF450E8AAC0`
  at ledger 19,547,722, and Coston2 transaction
  `0xeab167c4ac8f04fcaf19306de9a61f1a9ae0aa5d7cca1dcdf402cff546451224`
  at block 33,511,358. The strengthened `pnpm test:live` gate matched the USDT0
  `PaymentSettled` event and exact merchant `RecipientPaid` event.

## Decisions

### 2026-07-27 — Monorepo layout

Use pnpm workspaces with `apps/web`, `apps/executor`, `packages/contracts`,
`packages/db`, `packages/shared`, and `packages/ui`. Use plain recursive pnpm
scripts rather than introducing Turborepo until build graph caching is needed.

### 2026-07-27 — Runtime boundaries

The Next.js app owns browser/server HTTP behavior. A separate always-on Node
executor owns XRPL validation, FDC proof lifecycle, signed Coston2 submission,
event indexing, recovery diagnostics, and reconciliation. Shared domain code is
provider-neutral.

### 2026-07-27 — External truth

Database rows are projections and durable workflow state, not proof that a
payment settled. Chain events remain authoritative.

### 2026-07-27 — Payer identity boundary

The browser receives a 256-bit opaque HttpOnly cookie; only its SHA-256 hash is
stored. The server binds that session to one invoice and `XRPL_TESTNET`.
PayMorph persists the provider UUID before responding, treats Xaman webhooks as
deduplicated notifications, and binds `xrplAccount` only after an authoritative
payload GET confirms the application UUID, custom identifier, forced network,
and resolved signature. Issued Xaman user tokens are stored only as
AES-256-GCM envelopes with payer-session-specific AAD.

### 2026-07-27 — Blueprint corrections

- ADR 0001 removes the circular `paymentId`/`userOpHash` dependency.
- ADR 0002 makes the FXRP invoice amount explicit so the contract can enforce
  exact fee and payout semantics.
- ADR 0003 pins current Xaman/XRPL network, expiry, webhook, API-v2, memo, and
  delivered-amount validation behavior.
- ADR 0004 requires runtime Flare registry discovery and bytecode validation.
- ADR 0005 replaces desired-net fee estimation with a bigint minimal-gross
  direct-mint solver.
- ADR 0006 disables the currently unavailable SparkDEX Coston2 route without
  disabling FXRP settlement.
- ADR 0007 makes FDC and Flare finalization restartable typed evidence
  boundaries with strict proof-owner, call-value, and event checks.

### 2026-07-27 — HTTP mutation idempotency

Use the existing `IdempotencyRecord` unique scope/key constraint as a short
claim before mutation work, never as a transaction around provider calls.
Merchant and payer-session resources define separate scopes. Successful JSON
responses are replayable for 24 hours; incomplete claims expire after one hour.
Retain uncertain Xaman Payment claims so a lost provider response cannot cause
a second payload creation.

### 2026-07-27 — Minimal operator boundary

Use a separate 256-bit environment token in the `paymorph_operator` cookie;
merchant sessions never authorize admin routes. Compare token hashes in
constant time and store only a derived operator identifier in audit records.
Manual retries are restricted to the next state-compatible implemented worker
job and cannot retry deterministic terminal or recovery states.

### 2026-07-27 — Durable executor orchestration

- XRPL validation is built from immutable quote fields and waits for three
  validated-ledger confirmations before `XRPL_VALIDATED`.
- FDC prepared bytes, on-chain request hash/block/voting round, and the
  bigint-safe proof are persisted as separate checkpoints.
- A confirmed Flare checkpoint is replayed after process restart without
  resubmitting. Delayed direct minting retains `executionAllowedAt` and retries
  the same proof, never the XRP payment.
- Executor EOA nonces are reserved under a serializable PostgreSQL transaction
  with unique `(chainId, executorAddress, nonce)` and
  `(attemptId, generation)` keys. The Coston2 pending nonce is read before
  entering the transaction; ordinary retries and replacements reuse their
  generation after restart.
- `FlareSubmission.nonce` records the executor EOA nonce. Broadcast hashes are
  checkpointed before receipt polling, replacement history retains the same
  nonce, and a restart resumes a known hash rather than broadcasting blindly.
- A confirmed `DirectMintingDelayed` checkpoint is not resumed forever. After
  `executionAllowedAt`, the handler advances the reservation generation and
  submits the same FDC proof in a new Coston2 transaction with a new executor
  nonce. It never requests another XRP payment.
- The read-only operator recovery diagnosis endpoint is implemented behind a
  separate `paymorph_operator` cookie. Its reusable service requires persisted
  exact XRPL evidence, rejects inconsistent bindings, checks local
  settlement/finalization evidence, resolves the current Coston2 MAC, and makes
  a fresh official transaction-used read. Provider failures never produce an
  eligibility result.

### 2026-07-29 — Coston2 FXRP-only deployment

- Deployed `PayMorphRouter` at
  `0x9C7d670BE201be8a527cCDf349FE45B037eC6008` on Coston2 (chain 114), with
  FXRP `0x0b6A3645c240605887a5532109323A3E12273dc7`, a 50-bps service fee,
  and the USDT0 adapter disabled.
- `pnpm verify:deployment` independently confirmed bytecode, live registry
  resolution, FXRP, service fee, and fee recipient at block 33,393,431.
- At the user's explicit testnet-only request, deployer, admin, fee recipient,
  and executor use one funded test account. This exception must not be copied
  to any hosted or production configuration.

## Verified provider facts

- Use official unified Xaman package `xumm`; `xumm-sdk` is legacy.
- Xaman Testnet selection uses `force_network: "TESTNET"` and the XRPL
  transaction must omit `NetworkID`.
- Xaman payload expiry is not a hard post-open signing deadline; absolute
  `LastLedgerSequence` is required.
- Xaman webhooks use the documented timestamp/signature HMAC and remain
  notifications; authoritative payload GET and XRPL lookup are separate trust
  layers.
- XRPL API v2 may expose Payment `Amount` as `tx_json.DeliverMax`; exact
  `meta.delivered_amount` must also be verified.
- Coston2 uses chain ID 114. The canonical Contract Registry is
  `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`.
- Resolve `AssetManagerFXRP`, `MasterAccountController`, and `FtsoV2` by registry
  name. Resolve FXRP with `AssetManager.fAsset()` and the Core Vault XRPL
  address with `AssetManager.directMintingPaymentAddress()`.
- Use official `@flarenetwork/flare-wagmi-periphery-package` ABIs. The current
  Smart Accounts API derives the payer account with
  `MasterAccountController.getPersonalAccount(xrplRAddress)` and reads its nonce
  with `MasterAccountController.getNonce(personalAccount)`.
- Direct-mint protocol fees are computed from gross:
  `min(max(floor(gross * feeBIPS / 10_000), minimumFee), gross)`. Smart Account
  net mint subtracts both this protocol fee and the memo executor fee.
- XRP/USD FTSO feed ID is
  `0x015852502f55534400000000000000000000000000`; retain integer value, decimals,
  and timestamp and enforce configured freshness. Decimals is a signed `int8`;
  the exact value is `value * 10^(-decimals)`, so negative exponents are valid
  and must not be rejected.
- A read-only resolution at Coston2 block 33,279,537 returned FXRP
  `0x0b6A3645c240605887a5532109323A3E12273dc7`, six decimals, direct-mint fee 25
  BIPS, minimum fee 100,000 UBA, and executor fee 100,000 UBA. These are dated
  observations, not source constants.
- A later read-only resolution at Coston2 block 33,296,723 reconfirmed registry,
  AssetManager, MasterAccountController, FTSO, FXRP, Core Vault, fee, minimum,
  and executor-fee discovery. The XRP/USD feed returned `1112454`, six decimals,
  with a three-second age at resolution time.
- At the same block, USDT0 had bytecode but the documented SparkDEX router
  `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781` did not. USDT0 capability must
  return `SWAP_ROUTER_NO_CODE`; FXRP remains available.
- FDC direct minting uses attestation type `XRPPayment`, source `testXRP`, and
  three validated XRPL ledger confirmations. Bind `proofOwner` to the executor
  EOA that calls `executeDirectMintingWithData`.
- Derive the FDC voting round from the request receipt block timestamp and
  registry-resolved `FlareSystemsManager`; poll Relay finality before requesting
  the DA v1 raw proof.
- `DirectMintingDelayed` and `LargeDirectMintingDelayed` are pending states.
  Retry the same proof after `executionAllowedAt`; never send another XRP
  payment.
- Smart Account direct mint receipts use AssetManager
  `DirectMintingExecutedToSmartAccount`, MAC `DirectMintingExecuted` and
  `UserOperationExecuted`. PayMorph settlement still requires the matching
  router `PaymentSettled`; `RecipientPaid` logs are retained as payout evidence.
- `0xE0` recovery eligibility is
  `MasterAccountController.isTransactionIdUsed(originalTxId) == false`. The
  recovery payment must have a positive net FXRP mint after fees.
- The Coston2 deployment transaction
  `0x25613fe12d1d980cfc2fc532850cbab3b817dc590374284c7d68094509bc4c82`
  is successful. Its machine-readable manifest is committed at
  `packages/contracts/deployments/coston2.json`.
- Native PostgreSQL, the local web application, executor, and a temporary
  Cloudflare HTTPS tunnel are live for the testnet smoke. Both local and public
  `/api/health` returned HTTP 200 on 2026-07-29. The active test invoice is
  `hL2su5znW1mtkQSP`; it remains unpaid.
- The Xaman SDK gateway now waits for its proxied payload API without returning
  that thenable proxy from an `async` function, and requests detailed provider
  errors. Xaman rejected the initial live request because its
  `custom_meta.identifier` limit is 40 characters; production UUIDs with
  descriptive prefixes exceeded it. All identifiers now use a deterministic
  domain-separated SHA-256 compact form when needed and are checked against
  the same value when authoritative payloads are fetched.
- A real Testnet SignIn payload was created successfully for the active invoice
  on 2026-07-29, demonstrating that the live provider boundary accepts the
  corrected request. No XRP or Coston2 transaction has yet been submitted.
- The payer subsequently completed a real Xaman Testnet SignIn for the active
  invoice and created one immutable FXRP direct-settlement quote: attempt
  `84343db3-9d83-4e2e-a059-9a112cbae65f`, quote
  `3dd104bb-2c69-4d35-b17d-b9598c3eea5c`, and exact XRP amount 1,205,000 drops.
  It is still `QUOTED`: no Xaman Payment payload, XRP transaction, FDC request,
  or Coston2 transaction exists. An unexpired, same-payer resumable attempt is
  now returned by quote creation so a client-side state loss cannot create a
  conflicting second attempt. A signed payer session also remains reusable
  after its short-lived SignIn payload expires, and the checkout resolves it
  authoritatively after a refresh.
- Xaman's authoritative response may provide `environment_networkid` as a
  canonical decimal string rather than a JSON number; the adapter now accepts
  either representation and normalizes it to a number. The payment return page
  now performs one payer-cookie-bound authoritative reconciliation rather than
  relying on a webhook arrival or browser redirect as settlement evidence.
- Local testing may use an explicit `MUTATION_ALLOWED_ORIGINS` allowlist while
  retaining the public HTTPS `APP_URL` required for Xaman callbacks. Origins
  remain exact-match only; this is not a wildcard or CSRF bypass.
- Root document hydration warnings are suppressed only at the `html` and
  `body` boundary to tolerate attributes injected by browser security
  extensions before React hydrates. The application itself does not render
  variable server/client markup at that boundary.
- A `beforeInteractive` root guard removes only known pre-hydration extension
  marker attributes (`bis_skin_checked` and `__processed_ddc*`) for the first
  1.5 seconds. This avoids extension-caused nested hydration mismatches while
  leaving application markup and all payment data untouched.
- The payer checkout retains the Xaman payment QR after scanning and advances
  to the status timeline only after the payer-bound server route fetches and
  verifies a signed authoritative Xaman payload. Socket notifications now
  trigger that verification rather than causing an unverified redirect.
- The live payment timeline now presents the actual verified state machine as
  a guided Xaman → XRPL → FDC → Coston2 journey. Temporary polling failures
  are a neutral reconnecting notice, not a false red transaction failure;
  terminal states explain the next safe action and settlement completion still
  requires decoded `PaymentSettled` evidence.
- The root README is now the detailed product and submission guide: it covers
  the payer and merchant journeys, exact evidence boundaries, deployed FXRP
  router, native WSL PostgreSQL workflow, Xaman callback setup, commands, and
  the remaining live-testnet gates without claiming unverified settlement.
- The full-product DOCX has been imported into `docs/reference/` and expanded
  into `docs/full-product-roadmap.md`. Immediate delivery scope is the
  hackathon P0 merchant shell, collection surfaces, and developer platform;
  refunds, subscriptions, escrow, mainnet, and unverified USDT0 remain
  explicitly deferred.
- Increment 1 has started with merchant-scoped, read-only dashboard summary,
  funnel, and UTC timeseries APIs plus a redesigned overview, payment history,
  and payment evidence-detail surface. These are projections over canonical
  attempts; the UI/API never infer final settlement from the projections.
- Merchant-scoped invoice templates are now persisted with a dedicated Prisma
  migration and idempotent API. Template defaults validate against the same
  payment-critical split/address/amount constraints as invoices, and the
  dashboard lets a merchant save a template or prefill a fresh immutable
  invoice from it. A template itself can never create a payment attempt or
  settlement.
- Payment links are now a distinct, merchant-owned collection surface. A
  reusable link materializes one new ACTIVE canonical invoice per idempotent
  checkout; a single-use link atomically reuses its one materialized invoice.
  Link archiving blocks new checkouts but never deletes invoices, attempts, or
  receipts. The new local migration is applied; link checkout is not yet a
  retained live-settlement artifact.
- Merchant `payment.settled` webhook delivery now uses a leased outbox with
  durable deterministic exponential backoff, stale-lease recovery, and a
  terminal 12-attempt failure boundary. The delivery schedule is operational
  metadata only; it never establishes payment finality, which remains bound to
  decoded `PaymentSettled` evidence.
- A testnet-only WooCommerce gateway lives in `apps/woocommerce-gateway`. It
  creates and publishes a merchant-scoped canonical invoice through the
  server-side `/api/v1` API, persists the external-order mapping before
  publication retries, and marks an order paid only after the WordPress REST
  endpoint verifies the exact-body PayMorph webhook HMAC. WordPress/WooCommerce
  acceptance is still required; this is not a claim of an installed live store.
- The root README now aligns the current merchant, collection, developer,
  webhook, explorer, projection, and WooCommerce surfaces with their verified
  status. It explicitly records the retained live-settlement, browser, and
  WordPress acceptance gates rather than presenting implementation as proof.
- Payment requests now create exactly one ACTIVE canonical invoice within the
  same database transaction and expose that invoice's existing public checkout
  URL. Request cancellation atomically cancels the underlying invoice. Email
  and delivery/open tracking are deliberately not claimed: this testnet build
  stores optional recipient context for merchant reference only.
- The merchant POS screen creates and publishes a fresh 30-minute canonical
  FXRP invoice per sale, then displays that existing hosted checkout URL as a
  QR/link. It explicitly says checkout readiness is not settlement and requires
  acknowledgement before the next sale. QR rendering currently uses a public
  URL encoder because a local QR package is unavailable in this environment;
  the checkout URL is intentionally public, but this provider dependency must
  be replaced with a bundled encoder before production.
- Developer-platform foundation: merchants can issue hashed scoped `pm_test_`
  keys (secret revealed once), `/api/v1/invoices` uses bearer scopes and the
  same idempotent invoice service, and `@paymorph/node` exposes invoice calls
  plus exact webhook verification. A durable outbound delivery ledger is
  transactionally enqueued only with a `SETTLED` transition backed by decoded
  `PaymentSettled` evidence; the retry runner signs `timestamp.rawBody`.

## Open verification items

- The credentialed live gate must still exercise a process kill immediately
  after Coston2 broadcast. The durable nonce makes this replacement-safe and
  the submission callback persists the returned hash before receipt polling,
  but this crash point was not exercised during the verified live settlement.
- Recovery code and its durable evidence checkpoints are locally covered; a
  real official `0xE0` recovery remains a credentialed live acceptance gate.
- Recheck official SparkDEX deployment, factory, quoter, fee-500 pool,
  liquidity, and exact-output simulation before enabling USDT0.
- Exact Xaman real-webhook HMAC fixture before hosted launch.
- The most recent real XRPL payment
  (`813BF07EA6B0C402907207B9FA49AA6CC45876B1E8B164C2BEABE9B4EB8F973C`)
  validates exactly but remains `RECOVERY_REQUIRED`: its FDC request was
  rejected with HTTP 401 before the verifier key was configured. It must not be
  manually rewound. The corrected key now produces a valid prepared FDC request
  for that hash; a fresh tiny checkout is still required for the canonical live
  settlement smoke.
- A later signed attempt is also `RECOVERY_REQUIRED`, but for the now-corrected
  DA propagation classification recorded above. It remains historical evidence
  only: do not reset state or infer an FDC proof/Coston2 settlement.
- A concurrent queue-lease acceptance run against a quiescent PostgreSQL worker
  environment remains useful. Seed/cleanup and the receipt-projection database
  acceptance fixture now pass against native WSL PostgreSQL.
- Extend browser coverage from the current public-shell smoke to the
  credentialed checkout and merchant collection flows once deterministic
  browser fixtures are available. The current local Chrome fallback passed;
  Playwright's managed Chromium download exceeded the local shell limit.
- The local database now contains the independently verified `SETTLED` FXRP
  attempt recorded above. Historical `RECOVERY_REQUIRED` rows remain immutable
  audit evidence and must not be manually rewound.
- PHP/WordPress is not installed on this machine, so the WooCommerce plugin has
  been type-reviewed and documented but has not received a local `php -l` or
  WordPress/WooCommerce acceptance run.

## Next action

Keep the official SparkDEX route disabled under ADR 0006. ADR 0007's
`PAYMORPH_TESTNET` route is now independently live-verified. The highest-value
remaining acceptance checks are a real Xaman webhook-HMAC fixture, a deliberate
executor-process interruption immediately after Coston2 broadcast, and a real
WordPress/WooCommerce testnet checkout; none may alter the verified FXRP or
USDT0 settlement evidence.

## Latest completed work

- The checkout now preserves Xaman's authoritative `pushed` response after a
  signed SignIn. A successfully delivered exact Payment request is presented
  as an in-app Xaman approval, eliminating the second QR scan. The original
  provider QR and deeplink are retained only behind an explicit "Didn't receive
  the Xaman prompt?" fallback. SignIn remains a distinct signature because the
  payer XRPL account must be bound before constructing the immutable quote and
  payment request.
- `XamanPayload.pushedToXaman` is durable, default-false audit metadata added
  by migration `20260801030000_xaman_push_delivery`; it records delivery state
  but never serves as evidence of payment or settlement.
- The first live USDT0 checkout settled invoice amount `1,064,525` base units
  to merchant `0x060613A360fFe3213818c022b404E5AA9D755611`, paid `5,323`
  base units as service fee, used `1,069,848` FXRP base units, and refunded
  `16,048` FXRP base units to the payer personal account. The retained local
  smoke artifact is `live-smoke/6f7320bc-eb35-4842-855d-6e8a1039b0a7.json`.
- The web product now uses one shared light coral/blush visual system with
  paper-white cards and violet-to-magenta actions across the marketing site,
  authentication, checkout/status, public receipts, explorer, network, and
  merchant dashboard. This is a presentation-only change: payment state,
  provider adapters, evidence rules, and settlement behavior were not changed.
- Responsive browser QA passed at 390 px and 1440 px for `/`, `/login`,
  `/explorer`, `/network`, and the independently settled USDT0 receipt. Every
  route returned HTTP 200 with no horizontal overflow or browser page errors.
- The pre-hydration browser-extension guard now remains active until five
  seconds after the complete page-load event instead of disconnecting after a
  fixed 1.5 seconds. It removes only the observed `bis_skin_checked`,
  `bis_register`, and `__processed_ddc*` attributes, covering cold development
  hydration without hiding application-owned mismatches.
