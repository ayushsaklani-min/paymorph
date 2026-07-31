'use client';

import { useRef, useState } from 'react';

export function PaymentLinkCheckout({ slug }: { slug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const idempotencyKey = useRef<string | null>(null);

  async function start() {
    try {
      setPending(true);
      setError(undefined);
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch(`/api/public/payment-links/${slug}/checkout`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey.current },
      });
      const envelope = (await response.json()) as {
        data?: { invoiceSlug: string };
        error?: { message: string };
      };
      if (!response.ok || !envelope.data) {
        throw new Error(envelope.error?.message ?? 'Checkout could not be started.');
      }
      window.location.assign(`/pay/${envelope.data.invoiceSlug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkout could not be started.');
      setPending(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        className="min-h-12 w-full rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={pending}
        onClick={() => void start()}
        type="button"
      >
        {pending ? 'Preparing secure checkout…' : 'Continue to secure checkout'}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
