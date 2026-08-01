# PayMorph architecture

## System overview

```text
Browser
  ├─ Merchant EVM wallet ── signed challenge ──┐
  └─ Xaman ── SignIn + XRP Payment ────────────┤
                                               v
                                      Next.js web/API
                                        │       │
                                        │       ├─ Xaman API
                                        │       ├─ XRPL/Coston2 reads
                                        │       └─ PostgreSQL
                                        │
                                        v durable jobs
                                   Executor worker
                                    ├─ XRPL validation
                                    ├─ FDC proof lifecycle
                                    ├─ Coston2 finalization
                                    └─ event reconciliation

XRPL Testnet ── FDC XRPPayment proof ──> AssetManagerFXRP
                                             │
                                             v
                                  Smart Account personal account
                                             │
                              approve FXRP + atomic settlement
                                             v
                                      PayMorphRouter
                                        ├─ FXRP recipients
                                        └─ Exact-output adapter
                                               └─ USDT0 recipients
```

## Module boundaries

- `apps/web`: presentation, authenticated merchant and payer HTTP routes,
  provider payload creation, read-only network diagnostics, and receipt views.
- `apps/executor`: durable job claims, authoritative XRPL validation, FDC proof
  lifecycle, signed Coston2 transactions, event indexing, reconciliation, and
  recovery diagnosis.
- `packages/shared`: pure amount arithmetic, identifiers, validation, state
  machine, API schemas, provider interfaces, and protocol encoding.
- `packages/db`: Prisma schema/client and transactional queue operations. It may
  import shared domain types; shared never imports the database.
- `packages/contracts`: immutable Solidity settlement router and allowlisted
  exact-output adapter.
- `packages/ui`: accessible presentational components with no server secrets or
  protocol authority.

## End-to-end authority

| Stage                   | Durable evidence                                     | Authority            |
| ----------------------- | ---------------------------------------------------- | -------------------- |
| Payer identity          | Authoritative signed Xaman payload                   | Xaman/XRPL signature |
| XRP payment             | Validated `tesSUCCESS` transaction with exact fields | XRPL                 |
| Mint eligibility        | `XRPPayment` attestation proof                       | Flare FDC            |
| Smart Account execution | AssetManager/Smart Account events                    | Coston2              |
| Invoice settlement      | `PaymentSettled` and `RecipientPaid`                 | PayMorphRouter       |
| Public receipt          | Projection reconstructed from the above              | Chain events         |

Webhooks and database statuses trigger work but never prove settlement.

## Monetary representation

All persisted monetary values are decimal base-unit strings or
`DECIMAL(78,0)`. Domain functions accept and return `bigint`; serialization
adapters convert at system boundaries. Display formatting is explicit and
locale-aware. Floating point is prohibited for quotes, fees, percentages,
slippage, balances, and payouts.

## Payment state machine

The attempt state graph is implemented in `packages/shared` and is the only
allowed transition authority. Terminal mismatch states are not retried.
Provider calls are recorded before/after with stable idempotency keys. The
executor owns chain-processing transitions; the web app owns identity, quote,
and payload-creation transitions.

## Security model

- HttpOnly, Secure, SameSite=Lax sessions; signed challenge expiry and one-time
  use; CSRF/origin checks on cookie-authenticated mutations.
- Encrypted Xaman tokens, webhook secrets, and committed user-operation bytes.
- Executor signing key never enters browser or web build output.
- Registry discovery, bytecode checks, chain ID checks, feed freshness, route
  allowlisting, authenticated FDC verifier preflight, quote expiry, nonce
  binding, and exact transaction verification.
- Contract `nonReentrant`, pause, roles, replay protection, bounded recipients,
  exact bps, fee cap, deadline, and zero residual balance invariants.

## Degraded operation

If USDT0 token/router/factory/quoter/pool/liquidity checks fail, the capability
endpoint returns a typed reason and checkout offers FXRP only. A USDT0 quote
also requires a matching, bytecode-backed PayMorph settlement adapter and a
fresh QuoterV2 `eth_call` for the exact USDT0 output (including the committed
service fee); its ceil-bounded FXRP input and route snapshot are persisted with
the immutable quote. Capability metadata includes an explicit route kind:
`SPARKDEX_V3` for an official route or `PAYMORPH_TESTNET` for ADR 0007's
separately labelled, real-token Coston2 testnet route. Before a quote can ask
a payer to sign XRP, PayMorph must receive an authenticated response from the
FDC XRP indexer; an unavailable or unauthorized verifier blocks quote creation.
If FDC or executor is delayed after a valid payment, the attempt stays pending
and reconciliation continues. Deterministic mismatches stop automatically and
surface operator diagnostics. Recovery follows the official `0xE0` flow only
when eligibility is proven.

After the FDC voting round is finalized, the DA layer may briefly return the
observed structured `400 {"error":"attestation request not found"}` propagation response.
PayMorph treats only that exact structured response as pending proof publication;
other DA 4xx responses remain fail-closed. A transient retry or an exhausted
executor job never by itself transitions an attempt to recovery.
