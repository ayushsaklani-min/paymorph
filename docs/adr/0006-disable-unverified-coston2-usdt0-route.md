# ADR 0006: Disable the unverified Coston2 USDT0 route

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 13, 19, and 20

## Evidence

- [Flare USDT0/FXRP swap guide](https://dev.flare.network/fxrp/token-interactions/usdt0-fxrp-swap)
- [Flare Smart Account USDT0 guide](https://dev.flare.network/smart-accounts/guides/typescript-viem/control-usdt0-ts)
- [SparkDEX contract overview](https://docs.sparkdex.ai/additional-information/smart-contract-overview/v2-v3.1-dex)
- Read-only Coston2 checks against both public RPC endpoints documented in the
  [Flare network overview](https://dev.flare.network/network/overview), observed
  2026-07-27.

## Context

The official Flare guide names Coston2 USDT0
`0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`, SparkDEX router
`0x8a1E35F5c98C4E85B36B7B253222eE17773b2781`, and pool fee 500.
USDT0 currently has bytecode and six decimals. The documented router returned
empty bytecode from both official Coston2 RPC endpoints. The SparkDEX V3 factory
listed in its contract overview also returned empty Coston2 bytecode.

Therefore no usable SparkDEX Coston2 route can be proven from the official
addresses. The exact-output FXRP-to-USDT0 route required by PayMorph is not
currently deployable or testable end to end.

## Decision

FXRP settlement remains available. USDT0 capability is disabled with the exact
reason `SWAP_ROUTER_NO_CODE` while the documented router has no bytecode.

Even after a router appears, capability remains disabled until runtime checks
confirm:

1. USDT0, router, factory, quoter, and pool bytecode;
2. router-to-configured-factory identity;
3. a nonzero FXRP/USDT0 fee-500 pool; and
4. nonzero pool liquidity.

An exact-output quote and bounded-input simulation remain required at quote and
execution time; infrastructure health alone does not authorize a swap. PayMorph
will not silently substitute another DEX or report mock liquidity in production.

## Consequences

The current checkout can offer FXRP but must present USDT0 as unavailable.
Provider and adapter tests may use local mocks, but a live USDT0 phase cannot be
marked complete until official Coston2 deployments pass the runtime gate.
