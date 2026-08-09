'use client';

import { useRef, useState } from 'react';
import { CheckoutSignIn } from '@/features/checkout/checkout-signin';

interface PosSale {
  checkoutUrl: string;
  invoiceSlug: string;
}

export function PosTerminal({ merchantAddress }: { merchantAddress: string }) {
  const [sale, setSale] = useState<PosSale>();
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
      setSale({
        checkoutUrl: `${window.location.origin}/pay/${envelope.data.publicSlug}`,
        invoiceSlug: envelope.data.publicSlug,
      });
      setPending(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sale could not be created.');
      setPending(false);
    }
  }

  if (sale)
    return (
      <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <header className="text-center">
          <p className="pm-kicker">POS sale ready</p>
          <h1 className="pm-display mt-3 text-3xl sm:text-4xl">Scan with Xaman</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
            PayMorph is preparing a Xaman SignIn request for this sale. The first signature only
            confirms the payer&apos;s XRP Testnet account; it does not send XRP.
          </p>
        </header>

        <div className="mt-7">
          <CheckoutSignIn autoStart invoiceSlug={sale.invoiceSlug} />
        </div>

        <footer className="mt-7 border-t border-[var(--line)] pt-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Browser fallback
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            If the customer cannot scan with Xaman, share this checkout link and open it in their
            phone browser.
          </p>
          <p className="mt-3 break-all text-xs text-[var(--accent)]">{sale.checkoutUrl}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              className="rounded-full border border-[var(--line)] px-5 py-3"
              onClick={() => void navigator.clipboard.writeText(sale.checkoutUrl)}
              type="button"
            >
              Copy browser link
            </button>
            <a
              className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
              href={sale.checkoutUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open browser checkout
            </a>
          </div>
          <p className="mt-6 text-sm leading-6 text-[var(--muted)]">
            This confirms only that checkout is ready. Do not hand over goods until the final
            settlement receipt is visible.
          </p>
          <button
            className="mt-8 text-sm text-[var(--muted)] underline"
            onClick={() => {
              setSale(undefined);
              request.current = null;
            }}
            type="button"
          >
            Start next sale
          </button>
        </footer>
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
