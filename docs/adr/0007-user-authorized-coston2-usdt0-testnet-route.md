# ADR 0007: User-authorized Coston2 USDT0 testnet liquidity route

- Status: Accepted
- Date: 2026-08-01
- Blueprint impact: Sections 13, 19, and 20; Full Product Blueprint Appendix B

## Context

ADR 0006 correctly keeps the official SparkDEX route disabled: read-only
Coston2 RPC checks continue to return no bytecode for the documented
SparkDEX SwapRouter and V3 factory. The Full Product Blueprint defers USDT0
claims until an official route is verified and live-simulated.

On 2026-08-01 the product owner explicitly requested that USDT0 be completed
on chain. That request changes the testnet delivery scope, but it does not make
the absent SparkDEX deployment official or safe to claim as such.

## Decision

PayMorph may deploy a **separately labelled, testnet-only exact-output
liquidity route** on Coston2. It is not SparkDEX and must never be displayed or
documented as SparkDEX. It is valid only when all of the following are true:

1. the route's factory, router, quoter, and pool have Coston2 bytecode;
2. the route supports the exact `exactOutputSingle` ABI used by the immutable
   adapter, and QuoterV2-compatible `quoteExactOutputSingle` simulation;
3. its pool reports nonzero liquidity backed by actual Coston2 test USDT0 held
   by the swap router, not a synthetic balance or mint-on-swap behavior;
4. the deployed PayMorph adapter matches the configured router, tokens, and
   fee tier, and is set by the existing router's adapter manager;
5. every live USDT0 quote performs the existing fresh health check and a
   current exact-output `eth_call`; and
6. UI, API, and documentation identify the route as `PAYMORPH_TESTNET`, state
   that all assets are valueless test tokens, and make no liquidity, audit, or
   mainnet suitability claim.

The route uses a fixed, transparent testnet FXRP/USDT0 exchange ratio chosen
only for repeatable test settlement. It transfers the real ERC-20 test tokens
held as liquidity, pulls only the actual FXRP input, and returns unused FXRP
through the existing adapter. It does not substitute a price fallback, mint
USDT0, or fabricate settlement evidence.

## Deployment evidence

The route was deployed and independently read back on Coston2 at block
`33510005` on 2026-08-01:

- factory `0xD8019c06Bf594d646c0a35F8F63a4E8Ceb872422`;
- exact-output router `0x6115F90F2B8E9FaDd87Ac5B02F89FeEec92930f8`;
- liquidity projection pool `0x75374f89b3277C8dadDA193f3B9dc83D5b52dA10`;
- QuoterV2-compatible quoter `0x036B2D2BCB8A477f772D32f076640C3E26bC56ee`; and
- PayMorph adapter `0x70dCd03Cf5b79f7C4b0352842B54F87A2C890a36`.

The existing PayMorph router reports that adapter, its component identities
match the route, all eight deployment/funding/wiring receipts succeeded, and
the pool's reported liquidity exactly matches the 5,000,000 USDT0 base units
held by the swap router. The deployment manifest is
`packages/contracts/deployments/coston2-usdt0-testnet-route.json`.

## Consequences

- ADR 0006 remains in force for **official SparkDEX**: the absent route stays
  disabled and is never silently replaced.
- A new runtime route kind and deployment manifest will make the distinction
  visible and auditable.
- A tiny end-to-end USDT0 checkout was independently verified on 2026-08-01:
  attempt `6f7320bc-eb35-4842-855d-6e8a1039b0a7`, XRPL transaction
  `C0523EFE1DCDD7B66288FAA4FE30C2AB20AC3D7F7550E634A534CAF450E8AAC0`
  at ledger 19,547,722, and Coston2 transaction
  `0xeab167c4ac8f04fcaf19306de9a61f1a9ae0aa5d7cca1dcdf402cff546451224`
  at block 33,511,358. The independent smoke verifier matched the USDT0
  `PaymentSettled` event and exact `RecipientPaid` event to the public receipt.
- This is an exception for Coston2 test tokens only. It neither authorizes a
  mainnet deployment nor changes the production invariant against mocked or
  unverified settlement routes.
