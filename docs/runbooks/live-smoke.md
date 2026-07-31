# Live testnet smoke runbook

This run submits real XRPL Testnet and Coston2 transactions. All assets are
valueless test tokens.

## Preconditions

- Readiness endpoint passes for database, XRPL, Coston2 registry, FAssets,
  FTSO, deployed PayMorph contracts, Xaman credentials, and executor gas.
- Executor EOA has C2FLR and is not the deployer/admin/fee recipient.
- Merchant and recipient Coston2 addresses are controlled test wallets.
- USDT0 smoke runs only when runtime route health is `READY`; otherwise record
  the exact disabled reason and run FXRP only.

## Execute

Complete one tiny FXRP checkout through the hosted `/pay/{slug}` page with
Xaman on XRPL Testnet. Copy the attempt UUID from the status URL, then run:

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
