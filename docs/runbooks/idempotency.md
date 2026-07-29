# HTTP mutation idempotency

PayMorph requires a UUID `Idempotency-Key` for implemented invoice creation,
public quote creation, and Xaman Payment payload creation.

## Scope and request identity

- Invoice creation scopes the key to the authenticated merchant.
- Quote and Payment payload creation scope the key to the active opaque payer
  session and the invoice or quote resource.
- The raw merchant or payer cookie is never stored in an idempotency record.
- The request hash is SHA-256 over validated JSON with recursively sorted object
  keys. Route resources and normalized defaults are included in that input.

The same UUID can therefore be used independently by different authenticated
resources. Reusing one scoped UUID with different input returns
`IDEMPOTENCY_CONFLICT` with HTTP 409.

## Claim lifecycle

The unique `(scope, idempotencyKey)` database constraint elects one request as
the owner. Provider and business logic runs only after that short database claim
has completed; no database transaction remains open across a network or Xaman
call.

- A concurrent retry while the owner is running receives HTTP 409 and does not
  execute the mutation.
- A completed retry receives the stored status and successful response data.
- Completed responses remain replayable for 24 hours.
- An abandoned in-flight claim expires after one hour.
- Known-safe invoice and quote domain failures release their claim.
- Payment payload failures retain the claim because an unknown Xaman outcome
  must not trigger a second external payload.

## Operational diagnosis

Inspect `IdempotencyRecord` by exact scope and UUID. Never copy `responseJson`
into logs because it is customer response data. A row with a null
`responseStatus` is in flight or abandoned; compare `expiresAt` before
intervening. A row with a response status is a completed replay record.

Do not manually delete an unexpired Payment payload claim unless Xaman and the
local `XamanPayload`/`PaymentAttempt` projection have both been reconciled.
