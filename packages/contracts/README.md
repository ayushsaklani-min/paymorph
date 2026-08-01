# PayMorph contracts

Immutable Solidity v1 settlement contracts for Coston2.

## Design invariants

- `settled[paymentId]` prevents replay.
- Every recipient set contains 1-10 unique, nonzero accounts totaling exactly
  10,000 basis points.
- The payer funds the invoice amount plus the ceil-rounded service fee.
- `settleFxrp` accepts the explicit pre-fee `invoiceFxrpAmount` and derives the
  gross pull. The blueprint's original gross-only parameter could not recover
  the fee base unambiguously under ceil rounding.
- `refundTo` must equal `msg.sender` in v1, so unused FXRP cannot be redirected
  away from the payer personal account.
- FXRP and USDT0 transfers must be exact; fee-on-transfer behavior is rejected.
- USDT0 swaps are exact-output, bounded by `maxFxrpInput`, and restricted to the
  adapter's immutable token pair and pool fee.
- A successful settlement preserves the router's pre-call core-token balances.

## Commands

```bash
forge fmt --check
forge build
forge test -vvv
forge coverage --report summary
```

OpenZeppelin Contracts 5.4.0 and forge-std 1.12.0 are vendored under `lib/`.

## Coston2 deployment

The deployment script resolves `AssetManagerFXRP` through the configured Flare
Contract Registry and reads FXRP from `fAsset()`. It validates bytecode before
broadcasting, wires the router and adapter, and transfers roles from the
temporary deployer to `CONTRACT_ADMIN`.

Required environment:

- `COSTON2_RPC_URL`
- `FLARE_CONTRACT_REGISTRY`
- `USDT0_ADDRESS`
- `SPARKDEX_ROUTER_ADDRESS`
- `CONTRACT_ADMIN`
- `FEE_RECIPIENT`
- `DEPLOYER_PRIVATE_KEY`

Optional environment:

- `ENABLE_USDT0` (default `false`; FXRP-only deployment leaves the adapter at
  the zero address)
- `SERVICE_FEE_BPS` (default `50`, contract maximum `300`)
- `SPARKDEX_POOL_FEE` (default `500`)

Run:

```bash
pnpm --dir packages/contracts deploy:coston2
```

The generic `exactOutputSingle` ABI must be verified against the configured
Coston2 route before setting `ENABLE_USDT0=true`. The default FXRP-only
deployment remains intentional while ADR 0006's official SparkDEX gate is
closed. Deployment output must be recorded against
`deployments/manifest.schema.json`; use the zero address for the disabled
adapter and swap router.

## ADR 0007 testnet USDT0 route

`DeployPayMorphTestnetUsdt0Route` deploys a separately labelled, real-token
fixed-ratio exact-output route, funds the router with Coston2 test USDT0, and
only then wires the existing PayMorph router's adapter. It is not SparkDEX and
must never be used for mainnet or represented as an official DEX route.

Required environment is the existing `PAYMORPH_ROUTER_ADDRESS` and
`DEPLOYER_PRIVATE_KEY`; the deployer must be an adapter manager and must hold
the configured `USDT0_ROUTE_INITIAL_LIQUIDITY_BASE_UNITS` (default 5,000,000).

```bash
pnpm --dir packages/contracts deploy:testnet-usdt0-route
```

The generated route addresses belong in the uncommitted `USDT0_ROUTE_*`
environment values. Record the resulting receipts and read-back evidence in a
separate deployment manifest before enabling checkout.
