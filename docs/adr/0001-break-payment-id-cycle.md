# ADR 0001: Break the payment identifier cycle

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Appendix A `PAYMENT_ID`

## Context

Appendix A defines:

```text
paymentId = keccak256(chainDomain, invoiceId, quoteId, payerXrplAccount, userOpHash)
```

The committed Smart Account user operation calls `PayMorphRouter` with that
`paymentId`; therefore `userOpHash` already depends on `paymentId`. The formula
requires finding a cryptographic fixed point and cannot be constructed.

## Decision

Generate the payment identifier before encoding the user operation:

```text
paymentId = keccak256(
  bytes32(chainDomain),
  invoiceId,
  quoteId,
  payerXrplAccount
)
```

`chainDomain` is a versioned domain such as
`PAYMORPH:XRPL_TESTNET:COSTON2:V1`. `invoiceId` and `quoteId` are unique,
server-generated identifiers. The database stores the identifier once, the
router call commits to it, and `userOpHash` then commits to the complete call.

Published invoice terms and quotes are immutable. A unique database constraint,
immutable memo commitment, and on-chain `settled[paymentId]` provide layered
replay protection.

## Consequences

- Encoding is deterministic and testable with golden vectors.
- The application must create the attempt/payment ID immediately before
  user-operation encoding.
- Any future desire to bind an invoice-version hash belongs directly in the
  preimage, not indirectly through `userOpHash`.
