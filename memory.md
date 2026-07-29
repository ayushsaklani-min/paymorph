# PayMorph project memory

Last updated: 2026-07-29

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
- The local verification gate passes: format, lint, typecheck, 174 automated
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
- Run the real mobile Xaman SignIn acceptance gate with hosted testnet
  credentials; local tests cover payload construction, unresolved/signed
  normalization, HMAC rejection, token handling, and status derivation.
- Run database seed, queue lease tests, and projection rebuild against the
  configured native or hosted database.
- Install Playwright Chromium and run the browser journeys. The source and
  production Next.js build pass; the browser binary could not be downloaded on
  this machine.

## Next action

Configure the public HTTPS Xaman webhook, then run the credentialed tiny-value
XRPL/FDC/Coston2 smoke, including a restart after broadcast, and retain
transaction hashes and receipts. Keep USDT0 disabled until ADR 0006's full
route gate passes.
