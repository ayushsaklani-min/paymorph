# ADR 0008: Separate signing and settlement deadlines

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 14, 16, and 20

## Context

Xaman's five-minute payload expiry prevents opening an old request, but a
request opened before expiry can still be signed later. XRPL
`LastLedgerSequence` is the hard ledger-level deadline. FDC proof finalization
then occurs after the XRP payment has irreversibly validated and can take longer
than the customer-facing quote window.

Using one timestamp for all three stages can reject a valid payment during FDC
finalization. Removing deadlines would instead allow stale pricing or router
terms.

## Decision

- `Quote.expiresAt` is the latest permitted XRPL close time and is never more
  than 15 minutes after quote creation or later than invoice expiry.
- The Xaman Payment contains an absolute `LastLedgerSequence` calculated from
  the current validated Testnet ledger and bounded by `Quote.expiresAt`.
- The executor rejects a transaction whose validated close time is after
  `Quote.expiresAt`, regardless of Xaman status.
- `Quote.settlementDeadline` is an immutable 15-minute grace after
  `Quote.expiresAt`. The committed router call uses this deadline so an already
  validated XRP payment has bounded time to obtain FDC proof and settle.
- A Smart Account nonce change before Payment payload creation invalidates the
  quote and requires a fresh quote.

## Consequences

The customer cannot pay against stale terms, while ordinary FDC latency does
not strand a timely XRPL payment. After the settlement grace, recovery
diagnostics—not silent requoting—handle an unused direct-mint transaction.
