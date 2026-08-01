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
- The local verification gate passes: format, lint, typecheck, 224 automated
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
- Credentialed Xaman/FDC/Coston2 submission remains a live acceptance gate, not
  an implementation fallback. No real XRPL payment, FDC proof, or settlement
  is claimed without its hashes and receipts.
- Visual-system refinement (2026-08-01): PayMorph now uses its own warm
  ember/orange editorial system with layered glass surfaces, display/data
  typography, a native CSS earth motif, moving illustrative public-chain
  concern cards, scroll motion, and reduced-motion support. The landing,
  login, dashboard, checkout/status, explorer, network, and receipt surfaces
  share this system. NullPay was used only as a local visual reference; no
  code, raster asset, wording, or settlement behavior was copied or changed.
  The concern cards are explicitly illustrative and PayMorph makes no privacy
  claim. Web typecheck, lint, 119 web tests, both local Chrome landing journeys,
  and direct HTTP shell checks passed. The isolated production build exceeded
  the shell's 94-second command limit without reporting a source failure and
  was stopped; do not treat that as a production-build pass.
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
  followed by the full `pnpm verify` gate (224 automated tests/all production
  builds) and `pnpm test:contracts` (29 Foundry tests). A direct local
  `/api/health` request confirmed the headers and canonical request-ID echo.
- Executor logging hardening (2026-08-01): the application now creates its
  Pino logger through a tested redaction boundary. Credential/opaque-evidence
  field names are censored, while arbitrary provider error messages and stacks
  are replaced by a safe error type and optional allowlisted code. Focused
  logger testing plus the full `pnpm verify` gate (224 automated tests/all
  production builds) and `pnpm test:contracts` (29 Foundry tests) passed. This
  is local logging protection, not a live payment or settlement artifact.
- Accessibility navigation update (2026-08-01): each of the 24 route-owned
  semantic main landmarks now has the same focusable `#main-content` ID. The
  root shell's first-tab skip link works before hydration, and the local Chrome
  browser smoke passed all three journeys including that keyboard path. The
  full `pnpm verify` and `pnpm test:contracts` gates passed afterward. This
  changes only semantic navigation, not payment behavior.

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

- Real FDC `XRPPayment` proof acquisition and Coston2 finalization remain a
  credentialed Phase 7 live gate; the production adapter boundary and fixtures
  are implemented.
- The credentialed live gate must still exercise a process kill immediately
  after Coston2 broadcast. The durable nonce makes this replacement-safe and
  the submission callback persists the returned hash before receipt polling,
  but no real transaction was sent during local verification.
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
- A concurrent queue-lease acceptance run against a quiescent PostgreSQL worker
  environment remains useful. Seed/cleanup and the receipt-projection database
  acceptance fixture now pass against native WSL PostgreSQL.
- Extend browser coverage from the current public-shell smoke to the
  credentialed checkout and merchant collection flows once deterministic
  browser fixtures are available. The current local Chrome fallback passed;
  Playwright's managed Chromium download exceeded the local shell limit.
- On 2026-07-31, the local database contains no `SETTLED` payment attempt
  (two `QUOTE_EXPIRED`, one `RECOVERY_REQUIRED`, and one
  `AWAITING_SIGNATURE`). There is therefore no eligible attempt for
  `pnpm test:live`; a fresh tiny FXRP Xaman checkout is required before the
  retained live-smoke artifact can be generated.
- PHP/WordPress is not installed on this machine, so the WooCommerce plugin has
  been type-reviewed and documented but has not received a local `php -l` or
  WordPress/WooCommerce acceptance run.

## Next action

With `/api/ready` returning FDC readiness, create a fresh tiny FXRP Testnet
checkout, complete Xaman SignIn and the exact XRP payment, then run
`RUN_LIVE_TESTNET=1 LIVE_ATTEMPT_ID=<attempt-id> pnpm test:live` to retain the
authoritative XRPL/FDC/Coston2 receipt artifact. Keep USDT0 disabled until ADR
0006's full route gate passes.
