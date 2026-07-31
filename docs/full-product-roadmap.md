# Full Product Blueprint Delivery Roadmap

Last updated: 2026-07-31

## Scope source and authority

The expanded product scope is defined by
[`docs/reference/PayMorph_Full_Product_Blueprint.docx`](reference/PayMorph_Full_Product_Blueprint.docx).
The existing PDF remains authoritative for payment-protocol invariants:
[`docs/reference/PayMorph_Complete_Blueprint.pdf`](reference/PayMorph_Complete_Blueprint.pdf).

The two documents agree on the evidence-first settlement model. This roadmap
therefore treats the DOCX as the merchant-platform product specification and
the PDF, architecture, and ADRs as the protocol authority. A future conflict
that affects signing, money movement, finality, or replay protection requires
an ADR before code changes.

## Delivery stance

PayMorph will be delivered as one canonical settlement platform with several
collection and integration surfaces. Payment links, POS, requests, the public
API, and integrations must create or reference the same immutable invoice,
quote, payment attempt, and receipt records. No surface may create a parallel
or simulated settlement path.

### Explicitly deferred

The following remain unavailable until separately designed and live-tested:

- refunds;
- recurring XRP auto-debits (recurring requests are a later feature);
- escrow;
- mainnet and real-value custody;
- USDT0 settlement while the Coston2 swap route fails runtime verification.

## Current baseline

Implemented baseline capabilities:

- merchant EIP-191 sign-in and merchant invoice dashboard;
- immutable FXRP invoice terms and on-chain recipient splits;
- Xaman payer identity and exact XRPL Testnet payment requests;
- durable XRPL → FDC → Coston2 execution pipeline;
- receipt projection whose terminal settlement evidence is `PaymentSettled`;
- operator diagnostics, recovery disclosures, network readiness, and an
  FXRP-only deployed Coston2 router;
- mobile-oriented, evidence-driven checkout and settlement timeline.

Increments 1, 2, and 5 are implemented as evidence-preserving product
projections: the merchant dashboard, payment evidence views, templates,
payment links, payment requests, POS, collection analytics, explorer,
marketplace, and treasury all reuse canonical invoices and attempts. Increment
3 includes the scoped invoice/payment-link/payment API, SDK, hosted button,
and signed webhook outbox. Increment 4 has a WooCommerce MVP;
WordPress/WooCommerce testnet acceptance remains required before it can be
called live-ready.

The baseline is the starting point, not the completion claim for every product
surface in the DOCX.

## Delivery increments

| Increment | Product outcome          | Primary deliverables                                                         | Exit gate                                                            |
| --------- | ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0         | Stable core evidence     | Retained tiny FXRP testnet receipt, deployment/network checks                | XRPL, FDC, Coston2, and `PaymentSettled` artifact retained           |
| 1         | Merchant operating shell | Sidebar/navigation, KPI projections, payment list/detail, funnel, templates  | Merchant understands business and settlement health without raw logs |
| 2         | Collection surfaces      | Payment links, link analytics, payment requests, QR POS                      | Three collection paths create canonical invoices/attempts only       |
| 3         | Developer platform       | `/v1` API, scoped API keys, outbound webhooks, SDK quickstart, hosted button | Example store creates a payment and verifies `payment.settled`       |
| 4         | Commerce integration     | One production-honest Shopify or WooCommerce MVP                             | External order changes to paid only after verified webhook           |
| 5         | Differentiation          | Marketplace dashboards, public explorer, read-only FXRP treasury             | Multi-recipient receipt and explorer evidence are demonstrable       |
| 6         | Post-hackathon           | Refunds, recurring requests, escrow, verified extra assets                   | Feature-specific live acceptance evidence                            |

## Increment 1 — merchant operating shell

### Product surfaces

- Overview dashboard with revenue, operational, and settlement KPIs.
- Payment list with phase, failure reason, age, exact XRP amount, settlement
  asset, and evidence links.
- Payment detail that reuses the public evidence timeline and adds
  merchant-only metadata.
- Invoice templates for product, donation, freelancer, marketplace, and
  physical-goods collection flows.

### Data and API rules

- Dashboard values are rebuildable projections, never settlement authority.
- Use stable UTC daily aggregates and canonical base-unit strings.
- Template defaults are copied into a draft; publishing still freezes the
  resulting invoice terms and recipient splits.
- Add read-only internal `/api/dashboard/*` routes before exposing any public
  API equivalent.

### Verification

- Projection rebuild and aggregation tests.
- Merchant ownership and redaction tests.
- Responsive dashboard/manual accessibility review.

## Increment 2 — collection surfaces

### Payment links

- Support single-use and reusable links with explicit status and expiry.
- Keep `/pay/:slug` as the canonical hosted-checkout entry.
- Store views and checkout starts as analytics events; settlement conversion is
  derived from final attempts, never a browser callback.
- Archive links without deleting invoices, attempts, or receipts.

### Payment requests

- Create a named, expiring request using the same invoice and checkout flow.
- Track delivery/open/start/settlement as non-authoritative product events.
- Reminders cannot change financial terms.

### POS

- Full-screen merchant QR display and explicit next-sale reset only after
  acknowledgement.
- Use a POS session that creates or references a canonical checkout session;
  never announce payment success before settlement evidence.

### Verification

- Idempotency/concurrency tests for every create/archive/send action.
- Mobile and reduced-motion UI tests.
- POS reset and delayed-settlement tests.

## Increment 3 — developer platform

### Public API

- Versioned `/v1` routes for invoices, payment links, checkout sessions,
  payments, and receipts.
- Hashed, scoped, rotatable `pm_test_` API keys; private keys never appear in
  browser code.
- Consistent envelopes, request IDs, idempotency, cursor pagination, rate
  limits, and OpenAPI-first validation.

### Webhooks

- Merchant webhook endpoints, rotating signing secrets, append-only events,
  durable delivery attempts, exponential retries, and operator replay.
- Sign `timestamp + '.' + exact raw body`.
- Emit `payment.settled` only after decoded final settlement evidence.

### SDK and hosted button

- `@paymorph/node` typed server SDK with idempotency, pagination, and webhook
  verification helpers.
- Publishable-key-only browser loader with modal/redirect behavior and a
  no-JavaScript fallback link.
- Add an example store that verifies server webhooks before fulfillment.

### Verification

- API-key scope/rotation tests; no secret values in logs or projections.
- Golden webhook signature and retry/deduplication tests.
- SDK contract tests against OpenAPI fixtures.

## Increment 4 — commerce integration

Choose one integration based on the fastest reliable test environment:

- Shopify: OAuth install, pending-payment invoice creation, signed callbacks,
  and paid-order transition on `payment.settled`; or
- WooCommerce: testnet gateway configuration, checkout redirect, signed
  webhook transition, and order metabox evidence links.

The integration stores an idempotent external-order mapping and may not mutate
an already-published PayMorph invoice.

## Increment 5 — differentiated product surfaces

- Marketplace account/order projections over existing deterministic split
  settlement.
- Public evidence explorer searchable by public identifiers and transaction
  hashes, with merchant-private data redacted.
- Read-only FXRP treasury balance/history view and strategy configuration
  gated by the same real route-health checks as checkout.

## Non-negotiable acceptance criteria

Every increment that touches payments must satisfy all applicable conditions:

1. User flow includes clear pending, failed, expired, and recovery states.
2. Mutation authorization, idempotency, transactionality, and audit behavior
   are implemented and documented.
3. Provider callbacks are authoritatively re-fetched before critical state
   transitions.
4. The executor persists restart checkpoints and only consumes the exact
   committed operation bytes.
5. Required chain events are decoded and stored before a success claim.
6. Unit, integration, and relevant browser tests pass.
7. OpenAPI, environment examples, README, runbooks, and `memory.md` remain
   aligned.
8. A credentialed feature is not marked live-ready until it has retained
   testnet evidence.

## Immediate next implementation sequence

1. Add the application shell and dashboard navigation without changing payment
   behavior.
2. Add safe dashboard summary, timeseries, funnel, and payments read models.
3. Build the merchant dashboard and payment-detail pages against those read
   models.
4. Add payment-link lifecycle and analytics on top of canonical invoices.
5. Continue with requests and POS only after collection-surface invariants are
   covered by tests.
