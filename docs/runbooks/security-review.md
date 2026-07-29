# Security review runbook

- Confirm no secrets, private keys, provider tokens, payload blobs, or `.env`
  files are tracked.
- Confirm dynamic Flare contracts are registry-resolved and bytecode-checked.
- Confirm all XRPL transaction fields are validated after `validated=true` and
  `tesSUCCESS`.
- Confirm Xaman webhooks fetch authoritative payload details.
- Confirm monetary code contains no floating-point operations.
- Confirm all API mutations validate input, authorization, origin/CSRF, and
  idempotency.
- Confirm every job can safely resume after process termination.
- Confirm `SETTLED` is reachable only from decoded `PaymentSettled`.
- Confirm contract replay, recipient, fee, pause, deadline, reentrancy, and
  residual-balance tests pass.
- Confirm recovery is offered only after official eligibility checks.
- Confirm user-facing screens label testnet assets as valueless.

## Abuse-control retention

Authentication and payer mutations use PostgreSQL fixed-window counters keyed
by an HMAC pseudonym of the actor, payer session, or source address. No raw
source address is stored in a rate-limit key. Responses over the limit return
HTTP 429 with `Retry-After`.

Run the following from a trusted scheduler at least daily:

```bash
pnpm db:cleanup
```

It removes expired rate-limit buckets, idempotency claims, authentication
nonces, and merchant sessions. It does not delete payment, quote, chain-event,
FDC, Flare-submission, receipt, or recovery evidence.
