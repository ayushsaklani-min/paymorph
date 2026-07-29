# ADR 0002: Pass the FXRP invoice amount explicitly

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Section 7.4 `settleFxrp`

## Context

The blueprint's FXRP function receives only `grossFxrpAmount`, while its fee
semantics require:

```text
serviceFee = ceil(invoiceAmount * feeBps / 10_000)
gross = invoiceAmount + serviceFee
```

There is no specified, generally exact inverse that recovers `invoiceAmount`
from `gross` under ceiling division. Calculating the fee on gross would
underpay recipients relative to the displayed invoice.

## Decision

The router accepts `invoiceFxrpAmount`, computes the service fee itself, and
pulls the resulting exact gross amount:

```solidity
settleFxrp(
  bytes32 paymentId,
  uint256 invoiceFxrpAmount,
  Recipient[] recipients,
  uint16 feeBpsSnapshot,
  uint256 deadline,
  address refundTo
)
```

The quote continues to show and fund `gross = invoice + fee`. The committed
user operation carries the invoice amount, so the contract independently
enforces the same fee formula.

## Consequences

- Recipient payouts exactly equal the displayed invoice amount.
- Frontend, encoder, ABI, tests, and OpenAPI use the corrected signature.
- `refundTo` must equal the calling payer personal account in v1; it is present
  for event/API consistency but cannot redirect payer funds.
