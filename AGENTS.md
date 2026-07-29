# PayMorph engineering instructions

## Read first

Before changing code, read:

1. `memory.md`
2. `docs/architecture.md`
3. `docs/implementation-plan.md`
4. `docs/api/openapi.yaml` when it exists
5. The relevant runbook under `docs/runbooks/`

The authoritative product specification is
`docs/reference/PayMorph_Complete_Blueprint.pdf`. If code, memory, and the
blueprint disagree, stop and document the discrepancy in an ADR before changing
a protocol invariant.

## Architecture invariants

- Production code must never fake XRPL, FDC, FXRP minting, Flare execution,
  swaps, or settlement success.
- All monetary values cross JavaScript boundaries as `bigint` or canonical
  base-unit decimal strings. Never use floating-point arithmetic for money.
- Resolve FXRP and AssetManagerFXRP at runtime through the Flare registry or
  official protocol package. Never copy a dynamic address into source code.
- Xaman SignIn must bind the XRPL account before a payer-specific Smart Account
  and nonce are used to construct the payment.
- Preserve the exact committed user-operation bytes. Do not reconstruct them
  after the XRPL payment is signed.
- Treat Xaman webhooks as notifications only; fetch authoritative payload data.
- Validate every critical field of the validated XRPL transaction.
- Only a decoded `PayMorphRouter.PaymentSettled` event may transition an attempt
  to `SETTLED`.
- Every mutation, webhook, worker job, and chain projection must be idempotent.
- On-chain `settled[paymentId]` replay protection is mandatory.
- USDT0 is available only while the configured real route passes runtime health
  and liquidity checks. FXRP remains the fallback.
- Never commit private keys, API secrets, session secrets, user tokens, raw
  payload blobs, generated `.env` files, or decrypted user-operation data.

## Repository hygiene

- Keep deployable processes under `apps/`, reusable code under `packages/`,
  operational scripts under `scripts/`, infrastructure under `infra/`, and
  durable documentation under `docs/`.
- Prefer small, targeted changes. Do not create alternate implementations in
  temporary root folders.
- Generated artifacts belong in ignored `artifacts/`, `coverage/`, `out/`, or
  framework build directories.
- Update `memory.md` after meaningful work with verified decisions, completed
  work, risks, and the exact next step.
- One implementation phase per commit or pull request checkpoint.

## Verification

Run the smallest useful checks while developing. Before declaring a phase done:

```bash
pnpm verify
pnpm test:contracts
```

Use `pnpm test:live` only with explicit testnet credentials. Provider mocks are
allowed in unit/UI tests at adapter boundaries, but never as a production
fallback.
