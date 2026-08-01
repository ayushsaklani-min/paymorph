# Security review runbook

- Confirm no secrets, private keys, provider tokens, payload blobs, or `.env`
  files are tracked.
- Confirm dynamic Flare contracts are registry-resolved and bytecode-checked.
- Confirm all XRPL transaction fields are validated after `validated=true` and
  `tesSUCCESS`.
- Confirm Xaman webhooks fetch authoritative payload details.
- Confirm provider-created checkout URLs are validated before browser use:
  QR images must be HTTPS, status sockets must be WSS, and deeplinks must be
  HTTPS, `xaman:`, or `xumm:` URLs without URL credentials. Do not widen this
  allowlist without a provider integration review and a regression test.
- Confirm every response receives the configured anti-framing, anti-MIME
  sniffing, referrer, permission, and cross-domain-policy headers. Do not add
  a restrictive CSP or cross-origin isolation header without first validating
  the Xaman QR/deeplink and socket flow in a browser.
- Confirm incoming `X-Request-Id` values are bounded/canonicalized and that
  unexpected API errors log only event metadata, never an arbitrary exception
  message or object.
- Confirm monetary code contains no floating-point operations.
- Confirm all API mutations validate input, authorization, origin/CSRF, and
  idempotency.

Versioned bearer-key mutations must use the shared API-key mutation guard. It
allows a missing `Origin` for server-to-server integrations, but rejects a
cross-site browser request before inspecting the bearer key. Do not bypass this
guard in a new `/api/v1` mutation route.

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

## Web-boundary regression check

Run the focused boundary suite after changing HTTP middleware, response
headers, or Xaman payload normalization:

```bash
pnpm --filter @paymorph/web exec vitest run tests/http.test.ts tests/security-headers.test.ts tests/xaman-boundary.test.ts
```
