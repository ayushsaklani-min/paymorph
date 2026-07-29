# ADR 0007: Make FDC and Flare finalization restartable evidence boundaries

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 17, 18, 21, and 25

## Evidence

- [FDC getting started](https://dev.flare.network/fdc/getting-started)
- [IXRPPayment reference](https://dev.flare.network/fdc/reference/IXRPPayment)
- [Flare Smart Accounts custom instruction](https://dev.flare.network/smart-accounts/custom-instruction)
- [Flare direct minting](https://dev.flare.network/fassets/minting)
- [Flare direct-mint recovery guide](https://dev.flare.network/smart-accounts/guides/typescript-viem/recover-stuck-mint-transaction-ts)
- [Official Flare viem starter](https://github.com/flare-foundation/flare-viem-starter)

## Context

FDC preparation, request finalization, DA proof availability, and delayed FAssets
minting are separate asynchronous stages. A process can restart between any two
stages. Treating a not-yet-finalized round or unavailable DA proof as an
exception encourages duplicate XRPL payments or duplicate on-chain requests.

An FDC proof also carries a `proofOwner`. AssetManager accepts a bound proof only
from that executor. The Coston2 transaction receipt can contain minting,
Smart Account, and application events, but only
`PayMorphRouter.PaymentSettled` proves PayMorph settlement.

## Decision

- Require three validated XRPL ledger confirmations before preparing an
  `XRPPayment` request.
- Prepare attestation type `XRPPayment`, source `testXRP`, and bind
  `proofOwner` to the executor EOA.
- Submit the verifier's exact `abiEncodedRequest` to registry-resolved `FdcHub`
  with the runtime request fee.
- Derive the voting round from the request receipt block and registry-resolved
  `FlareSystemsManager` timing.
- Poll registry-resolved Relay finality once per worker attempt. After
  finalization, fetch the raw proof from DA API v1 and decode it with the
  official `IXRPPayment.Response` ABI.
- Model normal wait states as typed `PENDING`; valid results as `READY`; and
  deterministic invalid responses or mismatches as `FAILED`.
- Before finalization, verify proof owner, XRPL transaction ID, the `0xFE` memo
  commitment, PackedUserOperation sender/nonce, and the exact sum of committed
  native call values. Simulate before submitting
  `executeDirectMintingWithData`.
- A delayed-mint receipt remains `PENDING` and records `executionAllowedAt`.
  Retry the same proof; never create another XRP payment.
- Decode `DirectMintingExecutedToSmartAccount`, MAC
  `DirectMintingExecuted`/`UserOperationExecuted`, router `RecipientPaid`, and
  router `PaymentSettled` from the same receipt. Missing or mismatched evidence
  is a failure; no database status substitutes for the router event.
- Determine `0xE0` eligibility with
  `MasterAccountController.isTransactionIdUsed`. A recovery payment must mint a
  positive net FXRP amount.

## Consequences

The future durable job runner can persist the prepared request, request
transaction/round, and proof independently and safely retry each pending stage.
The boundary does not fabricate proof or settlement success and contains no
in-memory polling loop. Real network acceptance still requires an opt-in
testnet smoke with an executor key and funded accounts.
