'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SignInStatus = 'CREATED' | 'SIGNED' | 'REJECTED' | 'EXPIRED';

interface SignInPayload {
  payerSessionId: string;
  payloadUuid: string;
  qrPngUrl: string;
  deeplinkUrl: string;
  websocketUrl: string;
  expiresAt: string;
}

interface SignInResolution {
  status: SignInStatus;
  xrplAccount: string | null;
  network: 'XRPL_TESTNET';
}

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

interface Quote {
  quoteId: string;
  attemptId: string;
  invoiceAmount: { asset: string; display: string };
  serviceFee: { asset: string; display: string; bps: number };
  customerPays: { asset: string; display: string; drops: string };
  expiresAt: string;
}

interface PaymentPayload {
  attemptId: string;
  payloadUuid: string;
  qrPngUrl: string;
  deeplinkUrl: string;
  websocketUrl: string;
  expiresAt: string;
}

function apiMessage<T>(envelope: ApiEnvelope<T>, fallback: string): string {
  return envelope.error?.message ?? fallback;
}

export function CheckoutSignIn({ invoiceSlug }: { invoiceSlug: string }) {
  const [payload, setPayload] = useState<SignInPayload | null>(null);
  const [resolution, setResolution] = useState<SignInResolution | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<PaymentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvingRef = useRef(false);
  const quoteIdempotencyKeyRef = useRef<string | null>(null);
  const paymentIdempotencyRef = useRef<{ quoteId: string; key: string } | null>(null);

  const resolveSignIn = useCallback(async () => {
    if (payload === null || resolvingRef.current) {
      return;
    }
    resolvingRef.current = true;
    setError(null);
    try {
      const response = await fetch(`/api/payer/signin/${encodeURIComponent(payload.payloadUuid)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const envelope = (await response.json()) as ApiEnvelope<SignInResolution>;
      if (!response.ok || envelope.data === null) {
        throw new Error(apiMessage(envelope, 'Unable to verify the Xaman SignIn'));
      }
      setResolution(envelope.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to verify the Xaman SignIn');
    } finally {
      resolvingRef.current = false;
    }
  }, [payload]);

  useEffect(() => {
    if (payment === null) return;
    const socket = new WebSocket(payment.websocketUrl);
    socket.addEventListener('message', () => {
      window.location.assign(
        `/pay/${encodeURIComponent(invoiceSlug)}/status/${encodeURIComponent(payment.attemptId)}`,
      );
    });
    return () => socket.close();
  }, [invoiceSlug, payment]);

  useEffect(() => {
    if (payload !== null && resolution === null) {
      void resolveSignIn();
    }
  }, [payload, resolution, resolveSignIn]);

  useEffect(() => {
    if (payload === null || resolution?.status === 'SIGNED') {
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(payload.websocketUrl);
    } catch {
      return;
    }
    socket.addEventListener('message', () => {
      void resolveSignIn();
    });
    return () => {
      socket.close();
    };
  }, [payload, resolution?.status, resolveSignIn]);

  async function beginSignIn() {
    setBusy(true);
    setError(null);
    setResolution(null);
    try {
      const response = await fetch('/api/payer/signin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ invoiceSlug }),
      });
      const envelope = (await response.json()) as ApiEnvelope<SignInPayload>;
      if (!response.ok || envelope.data === null) {
        throw new Error(apiMessage(envelope, 'Unable to start Xaman SignIn'));
      }
      setPayload(envelope.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start Xaman SignIn');
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    setBusy(true);
    setError(null);
    try {
      quoteIdempotencyKeyRef.current ??= crypto.randomUUID();
      const response = await fetch(
        `/api/public/invoices/${encodeURIComponent(invoiceSlug)}/quotes`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': quoteIdempotencyKeyRef.current,
          },
          body: JSON.stringify({ slippageBps: 150 }),
        },
      );
      const envelope = (await response.json()) as ApiEnvelope<Quote>;
      if (!response.ok || envelope.data === null) {
        throw new Error(apiMessage(envelope, 'Unable to create the exact quote'));
      }
      setQuote(envelope.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the exact quote');
    } finally {
      setBusy(false);
    }
  }

  async function createPayment() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      if (paymentIdempotencyRef.current?.quoteId !== quote.quoteId) {
        paymentIdempotencyRef.current = {
          quoteId: quote.quoteId,
          key: crypto.randomUUID(),
        };
      }
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.quoteId)}/payment-payload`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': paymentIdempotencyRef.current.key,
          },
          body: JSON.stringify({}),
        },
      );
      const envelope = (await response.json()) as ApiEnvelope<PaymentPayload>;
      if (!response.ok || envelope.data === null) {
        throw new Error(apiMessage(envelope, 'Unable to create the XRP payment request'));
      }
      setPayment(envelope.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the payment request');
    } finally {
      setBusy(false);
    }
  }

  const identified = resolution?.status === 'SIGNED' && resolution.xrplAccount !== null;

  return (
    <section aria-labelledby="checkout-steps" className="space-y-4">
      <h2 className="sr-only" id="checkout-steps">
        Checkout steps
      </h2>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
          >
            1
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Confirm your XRP account</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Sign a Xaman SignIn request. This identifies your XRPL Testnet account and does not
              send XRP.
            </p>

            {payload === null ? (
              <button
                className="mt-5 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60"
                disabled={busy}
                onClick={() => void beginSignIn()}
                type="button"
              >
                {busy ? 'Creating secure request…' : 'Connect with Xaman'}
              </button>
            ) : identified ? (
              <div
                aria-live="polite"
                className="mt-5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4"
              >
                <p className="font-semibold text-emerald-200">XRP account confirmed</p>
                <p className="mt-2 break-all font-mono text-xs text-emerald-100">
                  {resolution.xrplAccount}
                </p>
                <p className="mt-2 text-xs text-emerald-100/75">XRPL Testnet</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-5 sm:grid-cols-[11rem_1fr] sm:items-center">
                <div className="rounded-2xl bg-white p-3">
                  {/* Provider-hosted, short-lived QR image; no untrusted user source. */}
                  <img
                    alt="QR code for this Xaman SignIn request"
                    className="aspect-square h-auto w-full"
                    height="176"
                    src={payload.qrPngUrl}
                    width="176"
                  />
                </div>
                <div>
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    Scan with Xaman on another device, or open the request on this device.
                  </p>
                  <a
                    className="mt-4 inline-flex rounded-xl border border-[var(--accent)] px-4 py-2.5 font-semibold text-[var(--accent)]"
                    href={payload.deeplinkUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open in Xaman
                  </a>
                  <button
                    className="mt-3 block text-sm text-[var(--muted)] underline underline-offset-4"
                    onClick={() => void resolveSignIn()}
                    type="button"
                  >
                    I signed — check status
                  </button>
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    Request expires {new Date(payload.expiresAt).toLocaleTimeString()}.
                  </p>
                  {resolution?.status === 'REJECTED' || resolution?.status === 'EXPIRED' ? (
                    <button
                      className="mt-3 text-sm font-semibold text-[var(--accent)] underline underline-offset-4"
                      onClick={() => {
                        setPayload(null);
                        setResolution(null);
                      }}
                      type="button"
                    >
                      Create a new SignIn request
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {error !== null ? (
              <p aria-live="assertive" className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        aria-disabled={!identified}
        className={`rounded-2xl border bg-[var(--surface)] p-5 sm:p-6 ${
          identified ? 'border-[var(--accent)]/50' : 'border-[var(--line)] opacity-65'
        }`}
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] font-semibold"
          >
            2
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Review and pay in XRP</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {identified
                ? 'The quote uses a live Coston2 price and commits the exact settlement operation.'
                : 'Confirm your XRP account before an exact quote can be created.'}
            </p>
            {identified && quote === null ? (
              <button
                className="mt-5 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60"
                disabled={busy}
                onClick={() => void createQuote()}
                type="button"
              >
                {busy ? 'Preparing exact quote…' : 'Get exact quote'}
              </button>
            ) : null}
            {quote !== null ? (
              <div className="mt-5 rounded-xl border border-[var(--line)] p-4">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted)]">You pay</dt>
                    <dd className="font-semibold">{quote.customerPays.display} XRP</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted)]">Invoice settlement</dt>
                    <dd>
                      {quote.invoiceAmount.display} {quote.invoiceAmount.asset}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted)]">PayMorph fee</dt>
                    <dd>
                      {quote.serviceFee.display} {quote.serviceFee.asset}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-[var(--muted)]">
                  Sign before {new Date(quote.expiresAt).toLocaleTimeString()}.
                </p>
                {payment === null ? (
                  <button
                    className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void createPayment()}
                    type="button"
                  >
                    {busy ? 'Creating Xaman request…' : `Pay ${quote.customerPays.display} XRP`}
                  </button>
                ) : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
                    <div className="rounded-xl bg-white p-2">
                      <img
                        alt="QR code for the exact XRP Testnet payment"
                        className="aspect-square h-auto w-full"
                        height="144"
                        src={payment.qrPngUrl}
                        width="144"
                      />
                    </div>
                    <div>
                      <a
                        className="inline-flex rounded-xl border border-[var(--accent)] px-4 py-2.5 font-semibold text-[var(--accent)]"
                        href={payment.deeplinkUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open payment in Xaman
                      </a>
                      <a
                        className="mt-3 block text-sm text-[var(--muted)] underline underline-offset-4"
                        href={`/pay/${encodeURIComponent(invoiceSlug)}/status/${payment.attemptId}`}
                      >
                        Check settlement status
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {error !== null && identified ? (
              <p aria-live="assertive" className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
