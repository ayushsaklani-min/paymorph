# Live testnet smoke runbook

This run submits real XRPL Testnet and Coston2 transactions. All assets are
valueless test tokens.

## Preconditions

- Readiness endpoint passes for database, XRPL, Coston2 registry, FAssets,
  FTSO, deployed PayMorph contracts, Xaman credentials, and executor gas.
- Executor EOA has C2FLR and is not the deployer/admin/fee recipient.
- Merchant and recipient Coston2 addresses are controlled test wallets.
- USDT0 smoke runs only when runtime route health is `READY`, the configured
  PayMorph adapter matches that route, and a fresh exact-output QuoterV2
  simulation succeeds. Record the returned route kind in the smoke artifact:
  `SPARKDEX_V3` for a verified official route or `PAYMORPH_TESTNET` for ADR
  0007's separately labelled Coston2 testnet route. Otherwise record the exact
  disabled reason and run FXRP only.

## Execute

Complete one tiny FXRP or USDT0 checkout through the hosted `/pay/{slug}` page
with Xaman on XRPL Testnet. The first Xaman QR binds the payer account. When
Xaman accepts the resulting payment request as a push delivery, approve the
second request from the same Xaman app without scanning another QR. If the
notification is unavailable, select the payer-controlled QR fallback. Copy the
attempt UUID from the status URL, then run:

```bash
RUN_LIVE_TESTNET=1 LIVE_ATTEMPT_ID=<uuid> pnpm test:live
```

The script independently re-reads the public receipt, requires the XRPL
transaction to be validated `tesSUCCESS`, requires the Coston2 transaction to
be successful, and locates the matching router `PaymentSettled` log. It writes
`live-smoke/<attempt-id>.json` with both transaction hashes, ledger/block,
payment ID, and router. The database retains quote, payload, FDC request/round,
proof, submission, and decoded recipient evidence for operator review.

Never change a failed live result into success manually.

## Executor crash/restart smoke

This acceptance deliberately terminates an executor immediately after its
durable Coston2 broadcast checkpoint and before receipt processing. It must use
a fresh attempt and be the only executor operating on the database.

1. Stop every normally running PayMorph executor. Keep the web process and
   PostgreSQL running.
2. Begin a fresh checkout and stop before approving the exact Xaman Payment.
   Copy the attempt UUID from the status URL.
3. Start the guarded supervisor below, then approve the Payment in Xaman:

```bash
RUN_LIVE_CRASH_RESTART=1 \
LIVE_CRASH_EXECUTOR_EXCLUSIVE=1 \
LIVE_ATTEMPT_ID=<fresh-attempt-uuid> \
pnpm test:live:crash-restart
```

The supervisor starts a single executor, observes the persisted broadcast hash,
force-stops that process, requires the attempt and submission to remain at the
pre-receipt checkpoint, and starts a new executor. The second process must
settle through exactly the original reserved nonce and transaction hash. The
command then runs `pnpm test:live` against the local receipt endpoint and writes
`live-smoke/<attempt-id>-crash-restart.json`. A run that observed the submission
only after finalization fails rather than claiming the crash point was covered.

Do not set the exclusivity flag while another executor is running. After the
command exits, restart the normal executor process.

## Recovery smoke

After completing an official tiny `0xE0` recovery and reaching `RECOVERED`, run:

```bash
RUN_LIVE_RECOVERY=1 LIVE_ATTEMPT_ID=<uuid> pnpm test:live:recovery
```

The recovery verifier independently re-validates the exact recovery XRP
Payment, resolves the current Coston2 Master Account Controller, checks both
Coston2 receipts, requires matching `IgnoreMemoSet` and positive original
`DirectMintingExecuted` evidence, and rejects any `UserOperationExecuted` or
PayMorph `PaymentSettled` event in either recovery transaction. It writes
`live-smoke/<attempt-id>-recovery.json`.
