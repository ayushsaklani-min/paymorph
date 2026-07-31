# PayMorph implementation plan

This plan maps directly to Section 28 of the blueprint. A phase is complete only
when its exit gate passes. Provider-bound acceptance tests use fixtures locally
and a separately invoked real-testnet smoke; production code never falls back
to fixture behavior.

## Phase ledger

| Phase | Scope                                                                     | Exit gate                              | Status                             |
| ----- | ------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| 0     | Workspace, strict TS, lint/format, Postgres, Prisma, shared envelopes, CI | `pnpm verify`, health route, migration | Local complete; native DB migrated |
| 1     | Router, SparkDEX adapter, deployment scripts, Foundry tests               | unit/fuzz/invariant tests              | Complete; FXRP router deployed     |
| 2     | Registry, FAssets/FTSO helpers, amounts, capability checks                | verified network report + fixtures     | Complete                           |
| 3     | Merchant signed auth, sessions, invoices, dashboard                       | ownership and lifecycle tests          | Complete                           |
| 4     | Public checkout, payer session, Xaman SignIn, webhook                     | payload/dedupe/mobile tests            | Code complete; live gate           |
| 5     | Pricing, personal account/nonce, userOp, `0xFE` memo                      | golden vectors, expiry/nonce tests     | Complete                           |
| 6     | Xaman Payment, timeline, XRPL validator                                   | exact-field validation tests           | Code complete; live gate           |
| 7     | FDC executor, Coston2 submission, event decoding                          | real tiny FXRP smoke                   | Code complete; live gate           |
| 8     | USDT0 route, exact-output settlement/refund                               | real smoke or explicit disabled reason | Complete; route disabled           |
| 9     | Receipts, event reconstruction, reconciliation, export                    | projection rebuild test                | Code complete; DB gate             |
| 10    | `0xE0` recovery diagnostics and payer flow                                | reproducible official recovery test    | Partial; official gate             |
| 11    | Abuse controls, admin, logs/metrics, accessibility, UX                    | security checklist + all suites        | Partial                            |
| 12    | Containers, hosted config, smoke artifact, submission docs                | README-driven judge flow               | Local complete; host gate          |

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
- A testnet-only WooCommerce gateway MVP creates and publishes a canonical
  invoice server-side, persists its external order mapping before retry, and
  changes a WooCommerce order to paid only after exact-body HMAC verification
  of that evidence-backed webhook. It still needs a WordPress/WooCommerce
  acceptance environment.
- Local migration `20260731140000_webhook_delivery_schedule` is applied to the
  native PostgreSQL database, bringing the local schema to 15 migrations.
- Latest focused verification passed: `pnpm test` (191 total automated tests,
  including 29 Foundry unit/fuzz/invariant tests), web lint/typecheck and
  production build, SDK build/typecheck, Prisma generation/deploy, and format
  check. A single `pnpm verify` wrapper invocation exceeded the shell's
  124-second timeout during its repeated production-build stage; no test or
  build failure was reported by the focused checks. PHP/WordPress is not
  installed locally, so plugin syntax and external-order acceptance remain
  unexecuted.

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
