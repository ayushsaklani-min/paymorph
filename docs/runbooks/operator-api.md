# Operator API runbook

The operator API is a narrow testnet operations surface. It can inspect redacted
attempt projections and enqueue a retry-safe executor step. It cannot edit
quotes, user-operation bytes, recipients, hashes, payment state, or chain
evidence, and it cannot mark an attempt settled.

## Authentication

Set `OPERATOR_SESSION_TOKEN` to exactly 32 random bytes encoded as unpadded
base64url:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Present that value only in the `paymorph_operator` cookie. The application does
not issue this cookie and merchant sessions never authorize `/api/admin`.
Comparison is constant-time and audit records store only a truncated SHA-256
operator identifier.

For a hosted deployment, inject the cookie through a protected operator access
layer that provides TLS, `Secure`, `HttpOnly`, and `SameSite=Strict`. Do not put
the token in source code, browser storage, URLs, logs, screenshots, or shell
history. Rotate it after suspected exposure.

If the environment token is missing or malformed, the API fails closed.

## Protected operator view

`/admin/attempts` uses the same cookie boundary and redacted query service as
the API. It provides status/age/page-size filters, cursor pagination, job
summaries, state-compatible retry controls, and read-only recovery diagnosis.
It is intentionally not linked from merchant navigation and is marked
`noindex`.

## Attempt search

`GET /api/admin/attempts` is newest-update-first and supports:

- `cursor` and `limit` (`25` by default, maximum `100`);
- exact `status`;
- `olderThan` as an ISO date-time applied to `updatedAt`.

Without an explicit status, routine terminal outcomes (`SETTLED`, `REJECTED`,
`QUOTE_EXPIRED`, `RECOVERED`, and `CANCELLED`) are excluded so the default view
stays focused on pending and failed operations. They remain searchable by exact
status.

The response allowlists attempt IDs, status, invoice/payment identifiers,
transaction/user-operation hashes, and the 50 newest job summaries per attempt.
It excludes payer accounts, provider payload data, full error text, encrypted
user-operation bytes, and tokens.

## Manual retry

`POST /api/admin/attempts/{id}/retry` requires:

- the operator cookie;
- same-origin browser enforcement;
- a UUID `Idempotency-Key`;
- a strict `{ "jobType": "..." }` body.

The server derives the only safe next job from durable attempt state:

| Attempt state                                       | Retry-safe job  |
| --------------------------------------------------- | --------------- |
| `XRPL_SIGNED`                                       | `VALIDATE_XRPL` |
| `XRPL_VALIDATED`, `FDC_REQUESTED`                   | `REQUEST_FDC`   |
| `FDC_READY`                                         | `SUBMIT_FLARE`  |
| `FLARE_SUBMITTED` with a confirmed ready checkpoint | `SUBMIT_FLARE`  |
| `FLARE_CONFIRMED`                                   | `INDEX_EVENTS`  |

All other state/job combinations return `IDEMPOTENCY_CONFLICT`. In particular,
terminal validation failures, contract reverts, recovery states, unsupported
worker job types, active `RUNNING` jobs, and attempts with another active job
are not blindly retried.

An existing `READY` job is returned. A `RETRY` job is moved to `READY`. When the
latest matching job is terminal, a new generation is created so its history is
preserved. Every material enqueue or reactivation writes an `AuditLog`.

This endpoint only creates durable queue work. A `202` response is not evidence
that XRPL validation, FDC, Coston2 execution, settlement, or any live gate
succeeded.
