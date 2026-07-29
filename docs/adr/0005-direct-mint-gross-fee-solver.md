# ADR 0005: Solve direct-mint fees from the gross payment

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 12 and 16

## Evidence

- [FAssets minting guide](https://dev.flare.network/fassets/minting)
- [Official `IDirectMinting` interface](https://github.com/flare-foundation/fassets/blob/main/contracts/userInterfaces/IDirectMinting.sol)
- [Official `DirectMintingFacet` implementation](https://github.com/flare-foundation/fassets/blob/main/contracts/assetManager/facets/DirectMintingFacet.sol)

## Context

FAssets calculates the direct-mint protocol fee from the gross underlying XRP
payment:

```text
protocolFee(gross) =
  min(max(floor(gross * feeBIPS / 10_000), minimumFee), gross)
```

For Smart Account minting, the resulting FXRP balance is:

```text
net = gross - protocolFee(gross) - executorFee
```

Adding a percentage of the desired net to the payment is not generally correct
because the percentage's base is gross. JavaScript `number` conversion would
also lose precision for sufficiently large UBA amounts.

## Decision

Use a bigint-only binary search for the smallest unsigned 64-bit `gross` such
that:

```text
gross - protocolFee(gross) - executorFee >= desiredNet
```

The helper returns gross, protocol fee, executor fee, and resulting net. It
rejects negative/out-of-range settings, impossible positive minting with a
10,000 BIPS fee, and results outside the protocol's uint64 underlying-amount
range.

## Consequences

The XRP Payment amount is minimally sufficient under the exact runtime
AssetManager settings. Unit tests assert both sufficiency and minimality. No
quote or minting path may reimplement this calculation with floating point.
