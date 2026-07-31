# Stuck direct-mint recovery runbook

## Status and user promise

This runbook defines the official PayMorph `0xE0` recovery path for a failed
Smart Account direct mint. The durable implementation is present, including
recovery-FDC and distinct marker/original Coston2 checkpoints. An official
credentialed Coston2 recovery scenario has not yet produced a retained live
acceptance artifact.

A validated XRP payment failure must never be hidden. Recovery does not return
native XRP and does not complete the merchant invoice. When eligible, a second
XRPL Testnet transaction with the official skip memo allows FXRP to be minted to
the payer's Flare personal account while skipping the original custom
instruction.

## When diagnosis is required

Start diagnosis when an attempt has a validated exact XRP payment but cannot
produce a successful PayMorph settlement, including:

- deterministic Coston2 simulation or execution revert;
- personal-account nonce/state change after payment;
- executor interruption beyond the operational threshold;
- committed USDT0 route failure;
- an unresolved direct mint for which no finalization event can be found.

Do not offer recovery for a rejected Xaman payload, an unvalidated XRPL
transaction, or an XRPL transaction that failed exact-field validation.

## Eligibility authority

Eligibility requires fresh on-chain and XRPL evidence:

1. The original XRPL Payment is validated `tesSUCCESS` on the configured
   Testnet and passed every ADR 0003 field check.
2. The original transaction is a Smart Account direct-mint payment to the
   stored Core Vault address.
3. No `PayMorphRouter.PaymentSettled` exists for the payment ID.
4. No successful direct-mint finalization evidence exists for the original
   transaction.
5. The current registry-resolved AssetManager reports that the original XRPL
   transaction ID has not been used.
6. The payer session/account still matches the original XRPL source and derived
   personal account.

The AssetManager used-state accessor, `0xE0` memo encoding, and recovery
transaction template must come from the pinned official Flare recovery helper.
Do not implement them from memory or from a copied historical address.

If any authoritative read is unavailable or inconsistent, the result is
`not yet diagnosable`, not eligible.

## Ineligible conditions

Recovery must be rejected when:

- the original transaction ID is already used;
- `PaymentSettled` or successful finalization evidence exists;
- the XRPL transaction was not validated or did not return `tesSUCCESS`;
- source account, destination, amount, delivered amount, memo, or network
  mismatched the attempt;
- the attempt belongs to another payer session;
- the recovery payload would reference a different original transaction;
- current official protocol helpers cannot reproduce a valid recovery request.

Return `RECOVERY_NOT_ELIGIBLE` with a safe reason and evidence timestamp. Never
expose decrypted user-operation bytes or provider secrets.

## Diagnosis procedure

1. Lock the attempt and read the immutable invoice, quote, payer account,
   personal account, original XRPL hash, memo hash, and known Flare hashes.
2. Re-fetch the original XRPL transaction from Testnet and rerun the full
   validator.
3. Search all known and replacement Flare hashes for receipts.
4. Search AssetManager, Smart Account, PayMorph router, and recipient events.
5. Resolve the current AssetManager through the Contract Registry and verify
   bytecode and chain ID.
6. Read the official transaction-used state for the original XRPL hash.
7. Store a diagnosis record containing the exact block/ledger observations,
   result, reason, and timestamp.
8. Advance to `RECOVERY_REQUIRED` only through the domain transition guard and
   only when all eligibility checks pass.

A retryable provider outage keeps the attempt pending and schedules another
diagnosis. It must not become recovery-eligible due to elapsed time alone.

## Payer-facing disclosure

Before creating a recovery payload, show all of the following in plain language:

- The original XRP payment was confirmed, but merchant settlement did not
  finish.
- Recovery requires signing another XRP Ledger Testnet transaction.
- Recovery produces test FXRP in the payer's Coston2 personal account.
- Recovery does not return native XRP.
- Recovery skips the original merchant settlement instruction.
- All assets are testnet tokens with no real value.
- The payer may need a new PayMorph quote/payment to complete the invoice.

The payer must explicitly continue from the attempt-bound recovery page.

## Read-only operator diagnosis

`POST /api/admin/attempts/{id}/diagnose-recovery` implements the evidence check
without mutating the attempt or creating a recovery transaction. It requires
the separate `paymorph_operator` cookie, whose value is provisioned through
`OPERATOR_SESSION_TOKEN`; merchant sessions never authorize this route.

The service requires persisted exact XRPL validation and consistent quote,
payer, and personal-account bindings. It checks persisted settlement and
successful-finalization evidence, resolves the current Master Account
Controller through the Coston2 registry, and performs a fresh official
transaction-used read. A zero pinned executor means unpinned and is valid;
proof-owner comparison applies only to a nonzero pinned executor.

Provider failure or incomplete evidence returns no eligibility claim. The same
service is reusable immediately before payer recovery-payload creation so a
stale admin response cannot authorize a later mutation.

## Recovery payload creation

Under the payer cookie and an `Idempotency-Key`:

1. Re-run or require a fresh eligibility diagnosis.
2. Use the official Flare helper to encode the exact `0xE0` skip memo that
   references the original XRPL transaction.
3. Build the official XRPL Testnet recovery Payment template. Do not add
   `NetworkID`; force Xaman with `force_network: "TESTNET"`.
4. Use an absolute `LastLedgerSequence`; Xaman's open/scan expiry is not a hard
   post-open signing deadline.
5. Bind custom metadata only to attempt/recovery identifiers, never secrets.
6. Store a separate `RECOVERY` Xaman payload linked to the original attempt.
7. Return QR, deeplink, WebSocket URL, expiry, `recoveryAsset: FXRP`, and the
   disclosure warning.

An identical idempotent retry returns the stored payload. Reusing the key for a
different request returns `IDEMPOTENCY_CONFLICT`.

## Recovery execution and evidence

Treat the recovery webhook as a notification and fetch the authoritative Xaman
payload. Then:

1. Require the signing account to equal the original payer.
2. Validate the new XRPL transaction and exact official recovery memo.
3. Track the recovery transaction independently from the original payment.
4. Use the official FDC/direct-mint finalization process for recovery.
5. Decode and persist AssetManager evidence that FXRP was minted to the payer
   personal account with the original custom instruction skipped.
6. Mark the attempt `RECOVERED` only after this on-chain mint evidence.

`RECOVERED` is terminal for the original settlement attempt. It is not
`SETTLED`, and no PayMorph merchant receipt is created.

## Idempotency and replay safety

- One active recovery generation is allowed per original attempt.
- Provider deliveries deduplicate by delivery ID and payload UUID.
- Original and recovery XRPL hashes are unique.
- Chain events deduplicate by `(chainId, txHash, logIndex)`.
- Before every retry, re-check transaction-used state and existing mint
  evidence.
- Never create a new arbitrary `0xFE` user operation for the already-signed
  payment. The original memo commitment cannot be changed.

## Failure handling

| Failure                                            | State/action                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Payer rejects or recovery payload expires          | Keep original `RECOVERY_REQUIRED`; allow a new eligible generation |
| Recovery XRPL transaction unvalidated              | Retry bounded validation                                           |
| Recovery transaction field mismatch                | Terminal recovery-generation failure; operator review              |
| FDC pending                                        | Retry with exponential backoff and jitter                          |
| Original transaction becomes used during diagnosis | Stop recovery and reconcile the discovered finalization            |
| Recovery mint succeeds but DB update fails         | Reconstruct from chain evidence and mark `RECOVERED`               |
| Protocol helper or used-state read unavailable     | Do not create payload; retry diagnosis                             |

## Operator checklist

- [ ] Original XRPL hash and validated ledger recorded.
- [ ] Exact-field validator passed.
- [ ] All known Flare and replacement hashes checked.
- [ ] No `PaymentSettled` found.
- [ ] Current registry and AssetManager verified on chain 114.
- [ ] Original transaction ID is unused at the recorded Coston2 block.
- [ ] Diagnosis reason and evidence timestamp stored.
- [ ] Payer disclosure shown before Xaman payload creation.
- [ ] Recovery XRPL hash stored separately.
- [ ] FXRP mint recipient equals the payer personal account.
- [ ] `RECOVERED` set only from decoded mint evidence.
- [ ] No merchant receipt or paid status emitted.

## Observability and audit

Correlate `attemptId`, `paymentId`, original/recovery Xaman payload UUIDs,
original/recovery XRPL hashes, FDC request/round IDs, Flare transaction hashes,
personal account, job IDs, and diagnosis block. Redact secrets and full
user-operation plaintext.

Alert immediately when an attempt becomes `RECOVERY_REQUIRED`, when a recovery
transaction validates, and when diagnosis remains unavailable beyond the
provider threshold.

## Verification gate

Phase 10 is complete only when either:

1. an official tiny recovery scenario is executed on Coston2 and the XRPL,
   FDC, Flare, and recipient evidence is archived; or
2. a reproducible script is documented because the external testnet cannot
   currently create the required scenario, with the live gate explicitly
   marked blocked.

Local mocks may test state guards, idempotency, payload parsing, and event
reconstruction, but they are not proof that official `0xE0` recovery works.

The executor persists the recovery FDC request/proof and two distinct Coston2
execution checkpoints. It only marks the original attempt `RECOVERED` after
both confirmed receipts prove the recovery marker, a positive original mint,
the absent user operation, and the absent merchant settlement. The opt-in
`pnpm test:live:recovery` verifier independently repeats those checks and
archives the transaction identifiers. This is code-complete, but remains a
live acceptance gate until an official testnet artifact is retained.
