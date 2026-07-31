# PayMorph for WooCommerce

This is a testnet-only WooCommerce gateway. It creates a merchant-owned
PayMorph draft invoice through the scoped server API, publishes the immutable
terms, and redirects the buyer to `/pay/:slug`.

It does **not** mark a WooCommerce order as paid on a browser return, Xaman
signature, or XRPL payment. The order changes to paid only when its WordPress
REST webhook verifies PayMorph's exact-body HMAC `payment.settled` event. That
event is emitted by PayMorph only after decoded `PaymentSettled` evidence.

## Install and configure

1. Copy this directory to `wp-content/plugins/paymorph-woocommerce` and enable
   **PayMorph (Testnet)** in WordPress.
2. In WooCommerce → Settings → Payments → PayMorph, enable the gateway and set:
   - HTTPS PayMorph deployment URL;
   - a `pm_test_` API key with `invoices:write` only;
   - the canonical Coston2 settlement recipient address; and
   - a random webhook signing secret.
3. In PayMorph merchant settings, configure the same webhook signing secret and
   the plugin's displayed `https://your-store/wp-json/paymorph/v1/webhook`
   endpoint.
4. Keep the store currency as USD. This MVP rejects other denominations rather
   than converting money with floating point arithmetic.

## Evidence and recovery behavior

- The plugin stores the PayMorph invoice ID and checkout URL in order metadata;
  it reuses that URL on retry, so it never creates a replacement invoice for an
  existing order.
- WordPress verifies the timestamp (five-minute window), the exact raw request
  body, and the HMAC before looking up the order by PayMorph invoice ID.
- Duplicate `payment.settled` deliveries are harmless: already-paid orders are
  left paid and the receipt path is retained.
- Invalid, missing, delayed, or unverified events leave the order unpaid.

No customer wallet key, API key, or webhook secret is sent to the browser.
