# ADR 0003: Pin current Xaman and XRPL validation behavior

- Status: Accepted
- Date: 2026-07-27
- Blueprint impact: Sections 15–16

## Evidence

- [Xaman unified SDK](https://docs.xaman.dev/js-ts-sdk/xumm-sdk-intro)
- [Xaman backend SDK](https://docs.xaman.dev/environments/backend-sdk-api)
- [Xaman webhook verification](https://docs.xaman.dev/concepts/payloads-sign-requests/status-updates/webhooks/signature-verification)
- [XRPL common fields](https://xrpl.org/docs/references/protocol/transactions/common-fields)
- [XRPL transaction lookup](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx)
- [XRPL Payment](https://xrpl.org/docs/references/protocol/transactions/types/payment)
- [Flare custom instruction](https://dev.flare.network/smart-accounts/custom-instruction)

## Decision

- Use the official unified `xumm` package, not legacy `xumm-sdk`.
- Force Xaman with `options.force_network: "TESTNET"` but omit XRPL
  `NetworkID`; protocol network IDs at or below 1024 must not be included.
- Treat Xaman expiry as an open/scan deadline, not a hard signing deadline. Use
  a stored absolute `LastLedgerSequence` plus server policy for the real ledger
  lifetime.
- Verify webhook HMAC in deployed environments, then fetch the payload with
  server credentials. Neither webhook nor payload dispatch result proves ledger
  success.
- Normalize XRPL API v1/v2 responses. In API v2, Payment `Amount` is exposed as
  `DeliverMax`; accept that alias only while requiring exact native drops.
- Require exact `meta.delivered_amount`, reject partial-payment and path fields,
  require no destination tag, and require the entire `Memos` array to equal the
  expected singleton 42-byte `0xFE` memo.
- Require validated `tesSUCCESS` from the configured XRPL Testnet endpoint.

## Consequences

Provider fixtures cover both XRPL API shapes. The transaction validator is a
terminal safety boundary: any mismatch moves the attempt to a deterministic
failure/recovery diagnosis rather than retrying as if transient.
