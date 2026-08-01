# Executor runbook

## Status and scope

This runbook defines the required executor behavior for PayMorph on XRPL
Testnet and Flare Coston2. It is an implementation and operations contract, not
evidence that the credentialed Phase 7 live gate has passed.

The executor owns authoritative XRPL validation, FDC proof lifecycle, signed
Coston2 finalization, event indexing, recovery diagnosis, and reconciliation.
The web process may enqueue durable work, but it cannot establish settlement.

## Non-negotiable authority

| Stage               | Required evidence                                                             | May advance to            |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| Xaman notification  | Authoritative Xaman payload GET                                               | XRPL validation job       |
| XRP payment         | Validated Testnet `tesSUCCESS` transaction with every committed field matched | FDC request               |
| FDC                 | Official `XRPPayment` proof                                                   | Coston2 simulation        |
| Flare finalization  | Confirmed AssetManager and Smart Account evidence                             | Settlement reconciliation |
| Merchant settlement | Decoded `PayMorphRouter.PaymentSettled` plus reconciled recipient events      | `SETTLED`                 |

Database state, webhook delivery, a successful RPC submission, or a successful
Flare transaction without `PaymentSettled` is not payment completion.

## Required process configuration

- PostgreSQL connection with migrations current.
- XRPL Testnet primary WebSocket and optional independent fallback.
- Coston2 RPC with chain ID exactly `114`.
- Flare Contract Registry discovery root and official periphery ABI package.
- FDC verifier and data-availability endpoints from the pinned official flow.
- Dedicated Coston2 executor signer, separate from deployer and contract admin.
- Minimum C2FLR balance threshold and EIP-1559 replacement policy.
- Encryption key access for committed user-operation bytes.
- Structured logging and error reporting with secret redaction.

The executor logger redacts credential/opaque-evidence field names and replaces
arbitrary thrown errors with only a safe `Error` type and an allowlisted error
code when present. Do not bypass this logger or add a raw error/message field
to a log record.

Never load the executor private key into the web process or browser build. Never
log the key, Xaman secrets, signed blobs, decrypted user-operation bytes, or
provider tokens.

## Startup and readiness

Before claiming jobs:

1. Confirm database connectivity and migration version.
2. Confirm Coston2 chain ID `114`.
3. Resolve `AssetManagerFXRP`, `MasterAccountController`, and `FtsoV2` through
   the registry and require bytecode at every resolved address.
4. Resolve FXRP with `AssetManager.fAsset()` and require six decimals.
5. Read current direct-mint settings and Core Vault XRPL address.
6. Confirm the PayMorph router and configured adapter deployment manifest
   matches bytecode on the expected chain.
7. Connect to XRPL Testnet and record the validated ledger.
8. Confirm the executor signer address and sufficient C2FLR.
9. Determine USDT0 capability. A degraded USDT0 route must not block FXRP jobs.

Fail closed on a chain mismatch, missing dynamic contract bytecode, invalid
direct-mint settings, an FXRP decimals mismatch, or unavailable decryption key.

## Durable job claim

- Only one active job exists per `(attemptId, jobType, generation)`.
- Claim due work in a database transaction with
  `SELECT ... FOR UPDATE SKIP LOCKED` or an equivalent atomic Prisma operation.
- Set `RUNNING`, `lockedBy`, `lockedUntil`, and heartbeat before provider work.
- Persist the attempt count and the provider request identifier before waiting.
- A worker that loses its lease must stop signing or submitting.
- A restarted worker re-reads durable state and chain evidence; it never relies
  on in-memory progress.

## Step 1: authoritative Xaman resolution

Treat the webhook as a notification only:

1. Deduplicate the provider delivery identifier.
2. Verify the documented timestamp/signature HMAC.
3. Fetch the payload with server credentials.
4. Match application ID, payload UUID, payload kind, and internal identifier.
5. Require the signed Payment account to equal the prior SignIn account.
6. Capture the provider transaction ID and enqueue `VALIDATE_XRPL`.

Do not mark the attempt paid or XRPL-validated in this step.

## Step 2: XRPL validation

Fetch from the configured XRPL Testnet endpoint and normalize API v1/v2 shapes
as required by ADR 0003. Require all of the following:

- `validated == true`;
- `TransactionType == Payment`;
- metadata result exactly `tesSUCCESS`;
- `Account` equals the Xaman SignIn-bound r-address;
- `Destination` equals the quote's immutable direct-mint address;
- native XRP amount equals `quote.xrplPaymentDrops` exactly. API v2
  `DeliverMax` is accepted only as the Payment amount alias;
- metadata `delivered_amount` equals the same exact native drops;
- no `DestinationTag`;
- no partial-payment flag or path fields;
- `Memos` is exactly one entry containing the expected 42-byte `0xFE` memo;
- hash equals the authoritative Xaman transaction ID;
- ledger close time and `LastLedgerSequence` satisfy stored policy;
- the XRPL transaction hash is not associated with another attempt.

Any field mismatch is deterministic. Record a redacted mismatch code, move to
`XRPL_FAILED`, and do not request an FDC proof. A provider timeout or an
unvalidated transaction remains retryable.

## Step 3: FDC proof lifecycle

The FDC boundary must port the pinned official Flare starter utilities; do not
recreate proof encoding from memory.

```ts
interface FdcClient {
  requestXrpPaymentProof(input: {
    xrplTxHash: string;
    expectedSourceAddress: string;
    expectedReceivingAddress: string;
    expectedAmountDrops: bigint;
  }): Promise<{ requestId: string; roundId?: bigint }>;

  getXrpPaymentProof(
    requestId: string,
  ): Promise<
    | { status: 'PENDING' }
    | { status: 'READY'; proof: XrpPaymentProof }
    | { status: 'FAILED'; reason: string }
  >;
}
```

Persist `requestId` and `roundId` before polling. `PENDING`, rate limits, and
temporary verifier/DA failures retry with bounded exponential backoff and
jitter. A proof must be checked against the immutable source, receiving address,
amount, and XRPL transaction hash before the attempt becomes `FDC_READY`.

After a round is finalized, the exact structured DA response
`400 {"error":"attestation request not found"}` is a pending propagation state,
not a rejected proof. Do not widen this exception to arbitrary HTTP 400
responses: malformed or otherwise invalid DA responses remain fail-closed.

No real FDC request/proof has been archived in this repository yet; that remains
the Phase 7 live gate.

## Step 4: Coston2 simulation and submission

Under an attempt lock:

1. Require current state `FDC_READY`.
2. Load the immutable quote and decrypt the exact stored user-operation bytes.
3. Recompute their hash and compare it to both quote and `0xFE` memo commitment.
4. Decode the operation and require all `Call.value` fields to sum to zero.
5. Re-resolve `AssetManagerFXRP` and compare current protocol state against the
   quote's documented snapshot policy.
6. Require `refundTo == personalAccount == committed sender` under ADR 0002.
7. Read the executor EOA pending nonce outside a database transaction.
8. Under a serializable database transaction, reuse the attempt's existing
   reservation or reserve the greater of the pending nonce and the next locally
   unreserved nonce. The unique `(chainId, executorAddress, nonce)` key
   arbitrates concurrent workers.
9. Simulate
   `AssetManagerFXRP.executeDirectMintingWithData(proof, userOpData)` from the
   executor address with `msg.value = 0` and the explicit reserved nonce.
10. Broadcast the EIP-1559 transaction and checkpoint its hash against the
    reservation before receipt polling.
11. On restart, resume the known hash. Any replacement must use the same
    reservation and committed user-operation bytes.
12. Wait the configured Coston2 confirmation count.
13. `DirectMintingDelayed` is a confirmed transaction. After
    `executionAllowedAt`, allocate the next attempt reservation generation and
    submit the same FDC proof in a new Coston2 transaction; do not resume the
    old delayed receipt and never create another XRP payment.

A deterministic simulation revert, consumed personal-account nonce, expired
deadline, or failed route enters diagnosis; it is not blindly retried.

## Executor nonce and replacement

PostgreSQL serializable reservation plus unique keys arbitrate workers sharing
an executor EOA. Provider reads and submissions stay outside database
transactions. The durable submission record must retain:

- executor address and nonce;
- original transaction hash;
- replacement hashes in order;
- max fee and priority fee for each version;
- broadcast and observation timestamps;
- terminal receipt hash.

A dropped or underpriced transaction may be replaced with the same nonce and a
bounded fee increase. Never submit a different user operation as a replacement.
Before replacement, search all known hashes and chain events to avoid duplicate
work.

## Step 5: event reconciliation

Decode and persist normalized events with uniqueness
`(chainId, txHash, logIndex)`. Expected evidence includes:

- AssetManager direct-mint execution;
- Smart Account user-operation execution;
- `PayMorphRouter.PaymentSettled`;
- every `RecipientPaid`.

Reconcile the exact invoice amount, ceil-rounded service fee, input FXRP used,
refund, token, ordered recipients, basis points, and final-recipient remainder
against the immutable quote and invoice. The router's `PaymentSettled` event is
the application settlement gate; the AssetManager and Smart Account evidence is
also retained for cross-chain auditability.

If the Flare transaction succeeded but projection failed, reconstruct the
receipt from logs and advance only forward. Never downgrade a terminal status.

## Retry taxonomy

| Class                 | Examples                                                            | Policy                                        |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Transient             | RPC timeout, HTTP 429, provider unavailable, FDC pending            | Exponential backoff with jitter               |
| Replacement-safe      | Dropped or underpriced Flare transaction                            | Same nonce, bounded fee bump, persist history |
| Deterministic invalid | Wrong XRPL account, amount, memo, delivered amount, tag, or network | Terminal `XRPL_FAILED`                        |
| State changed         | Smart Account nonce consumed                                        | Stop submission; diagnose                     |
| Contract revert       | Deadline, route, or committed-call failure                          | Recovery diagnosis; no blind retry            |
| Already completed     | Chain event found during retry                                      | Reconstruct and settle projection             |

After `maxAttempts`, a transient job becomes `DEAD` and pages the operator. This
does not by itself make recovery eligible.

## Reconciliation cadence and thresholds

Run the reconciliation scan at least every 60 seconds for nonterminal attempts:

| Condition                                     | Initial action                       | Alert                     |
| --------------------------------------------- | ------------------------------------ | ------------------------- |
| XRPL signed but unvalidated for 2 minutes     | Continue querying                    | 10 minutes                |
| FDC requested but not ready for 5 minutes     | Continue bounded polling             | 10 minutes                |
| Flare submitted without receipt for 3 minutes | Check mempool and replacement record | Per replacement policy    |
| XRPL validated without Flare submission       | Reclaim/diagnose job                 | 10 minutes, high priority |
| Deterministic recovery eligibility            | Surface recovery state               | Immediately               |

## Observability

Include available correlation fields:

`attemptId`, `paymentId`, `invoiceId`, `quoteId`, `payerSessionId`,
`xamanPayloadUuid`, `xrplTxHash`, `flareTxHash`, `userOpHash`, `jobId`,
`jobType`, and `network`.

Required operational signals include queue depth, retry counts by error,
worker heartbeat, XRPL-to-settlement duration, FDC wait duration, executor
C2FLR balance, FTSO age, route capability, and recovery-required count.

Alert on no heartbeat for two minutes, low C2FLR, stale FTSO, database migration
mismatch, any `RECOVERY_REQUIRED`, or an XRPL-validated attempt without Flare
submission for ten minutes.

### Aggregate metrics scrape

Set `METRICS_TOKEN` to a dedicated, unpadded base64url token of at least 32
random bytes. It is read-only and must be distinct from API keys, wallet keys,
and operator session tokens. The web process then exposes only aggregate
Prometheus metrics at `/api/metrics`:

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer $METRICS_TOKEN" \
  http://localhost:3000/api/metrics
```

The endpoint reports attempt, durable executor-job, and merchant-webhook
delivery status counts plus jobs currently due for execution. It does not prove
settlement, replace the executor heartbeat/chain checks above, or expose
financial amounts, identifiers, provider payloads, proofs, or error bodies.

## Operator actions

Operators may:

- inspect immutable snapshots and external identifiers;
- retry only a retry-safe job;
- run read-only recovery diagnosis;
- disable the application USDT0 capability;
- pause the contract with a separately signed admin wallet transaction.

Operators must not edit committed user-operation bytes, replace recipients,
change `refundTo`, manufacture chain evidence, or mark an attempt `SETTLED`.

## Verification gate

Before declaring the executor live:

1. Unit and integration tests cover claims, lease expiry, retries, replacement,
   reconciliation, and crash points.
2. A tiny real XRPL Testnet Payment is validated with exact fields.
3. A real FDC `XRPPayment` proof is archived with timing.
4. A real Coston2 finalization hash and decoded events are archived.
5. Recipient pre/post balances and a public receipt URL reconcile.
6. The machine-readable smoke artifact reports PASS.

None of items 2-6 should be inferred from local mocks or read-only network
resolution.
