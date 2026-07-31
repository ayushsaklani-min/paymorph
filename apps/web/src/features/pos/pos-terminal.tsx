'use client';

import { useRef, useState } from 'react';

export function PosTerminal({ merchantAddress }: { merchantAddress: string }) {
  const [checkoutUrl, setCheckoutUrl] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<{ body: string; key: string } | null>(null);

  async function createSale(data: FormData) {
    try {
      setPending(true);
      setError(undefined);
      const expires = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
      const body = JSON.stringify({
        title: data.get('title'),
        denomination: data.get('denomination'),
        amount: data.get('amount'),
        settlementAsset: 'FXRP',
        expiresAt: expires,
        recipients: [{ label: 'Merchant', address: merchantAddress, bps: 10_000 }],
      });
      if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': request.current.key },
        body,
      });
      const envelope = (await response.json()) as {
        data?: { id: string; publicSlug: string };
        error?: { message: string };
      };
      if (!response.ok || !envelope.data)
        throw new Error(envelope.error?.message ?? 'Sale could not be created.');
      const publish = await fetch(`/api/invoices/${envelope.data.id}/publish`, { method: 'POST' });
      if (!publish.ok) throw new Error('Sale was created but could not be published.');
      setCheckoutUrl(`${window.location.origin}/pay/${envelope.data.publicSlug}`);
      setPending(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sale could not be created.');
      setPending(false);
    }
  }

  if (checkoutUrl)
    return (
      <section className="mx-auto grid min-h-[72vh] max-w-2xl place-items-center rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <div>
          <p className="text-sm text-[var(--muted)]">POS checkout ready</p>
          <h1 className="mt-2 text-4xl font-semibold">Show this to the payer</h1>
          <img
            alt="QR code for the PayMorph checkout URL"
            className="mx-auto mt-8 size-64 rounded-2xl bg-white p-3"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(checkoutUrl)}`}
          />
          <p className="mt-6 break-all text-sm text-[var(--accent)]">{checkoutUrl}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              className="rounded-full border border-[var(--line)] px-5 py-3"
              onClick={() => void navigator.clipboard.writeText(checkoutUrl)}
              type="button"
            >
              Copy link
            </button>
            <a
              className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
              href={checkoutUrl}
              target="_blank"
            >
              Open checkout
            </a>
          </div>
          <p className="mt-6 text-sm text-[var(--muted)]">
            This confirms only that checkout is ready. Do not hand over goods until the final
            settlement receipt is visible.
          </p>
          <button
            className="mt-8 text-sm text-[var(--muted)] underline"
            onClick={() => {
              setCheckoutUrl(undefined);
              request.current = null;
            }}
            type="button"
          >
            Start next sale
          </button>
        </div>
      </section>
    );
  return (
    <form
      action={(data) => void createSale(data)}
      className="mx-auto mt-10 max-w-xl space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7"
    >
      <h1 className="text-3xl font-semibold">Point of sale</h1>
      <p className="text-[var(--muted)]">
        Each sale creates one expiring immutable invoice and a fresh checkout session.
      </p>
      <label className="block text-sm text-[var(--muted)]">
        Item title
        <input
          className={inputClass}
          defaultValue="In-person purchase"
          maxLength={80}
          name="title"
          required
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-[var(--muted)]">
          Amount
          <input
            className={inputClass}
            inputMode="decimal"
            name="amount"
            placeholder="1.00"
            required
          />
        </label>
        <label className="text-sm text-[var(--muted)]">
          Denomination
          <select className={inputClass} defaultValue="USD" name="denomination">
            <option value="USD">USD</option>
            <option value="XRP">XRP</option>
          </select>
        </label>
      </div>
      {error ? (
        <p className="text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="min-h-12 w-full rounded-full bg-[var(--accent)] font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Preparing checkout…' : 'Create sale QR'}
      </button>
    </form>
  );
}
const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[#0a1119] px-3 py-2 text-[var(--ink)]';
