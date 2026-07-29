# ADR 0004: Resolve Flare protocol contracts at runtime

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 8, 11, 13, and 19

## Evidence

- [Flare network overview](https://dev.flare.network/network/overview)
- [Flare Contract Registry guide](https://dev.flare.network/fassets/developer-guides/fassets-asset-manager-address-contracts-registry)
- [FAssets settings guide](https://dev.flare.network/fassets/developer-guides/fassets-settings-node)
- [Flare Smart Accounts custom instruction](https://dev.flare.network/smart-accounts/custom-instruction)
- [Official Flare viem starter](https://github.com/flare-foundation/flare-viem-starter)
- [Official Flare periphery package](https://www.npmjs.com/package/@flarenetwork/flare-wagmi-periphery-package)

## Context

Flare upgrades protocol implementations while the canonical Contract Registry
address remains the discovery root. Copying the current AssetManagerFXRP, FXRP,
MasterAccountController, or FtsoV2 addresses into application code would turn a
temporary testnet observation into a protocol invariant.

The current Smart Accounts interface derives the deterministic payer account
with `MasterAccountController.getPersonalAccount(xrplRAddress)` and reads its
nonce with `MasterAccountController.getNonce(personalAccount)`.

## Decision

- Pin Coston2 chain ID 114 and verify it before reading protocol state.
- Use registry `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
  as the discovery root, configurable for diagnostics.
- Resolve registry keys `AssetManagerFXRP`, `MasterAccountController`, and
  `FtsoV2` on every fresh process/network resolution.
- Resolve FXRP with `AssetManager.fAsset()` and the XRPL Core Vault with
  `AssetManager.directMintingPaymentAddress()`.
- Read direct-mint fee BIPS, minimum fee, and executor fee from the
  AssetManager's direct-mint settings facet.
- Require deployed bytecode at the registry and every resolved EVM contract,
  and require FXRP to expose six decimals.
- Read XRP/USD through `FtsoV2.getFeedById` using feed ID
  `0x015852502f55534400000000000000000000000000`; preserve its integer value,
  signed `int8` decimals, and timestamp and calculate freshness against the
  latest block. The exact feed value is represented as the rational
  `value * 10^(-decimals)`, including when the decimal exponent is negative.
- Use the official
  `@flarenetwork/flare-wagmi-periphery-package` ABIs. This package is the ABI
  authority; PayMorph does not maintain copied Flare protocol ABIs.

## Consequences

Network startup fails closed on a chain mismatch, zero registry result, missing
bytecode, invalid direct-mint settings, or an FXRP decimals mismatch. Dynamic
addresses can change without a release, while network reports retain the exact
block and resolved values used for diagnostics.
