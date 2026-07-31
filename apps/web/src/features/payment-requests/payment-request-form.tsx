'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function PaymentRequestForm({ merchantAddress }: { merchantAddress: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<{ body: string; key: string } | null>(null);

  async function submit(data: FormData) {
    try {
      setPending(true);
      setError(undefined);
      const expiresAt = data.get('expiresAt');
      const body = JSON.stringify({
        reference: data.get('reference'),
        recipientName: data.get('recipientName') || undefined,
        recipientEmail: data.get('recipientEmail') || undefined,
        invoice: {
          title: data.get('title'),
          description: data.get('description') || undefined,
          denomination: data.get('denomination'),
          amount: data.get('amount'),
          settlementAsset: data.get('settlementAsset'),
          expiresAt: typeof expiresAt === 'string' ? new Date(expiresAt).toISOString() : undefined,
          recipients: [{ label: 'Merchant', address: merchantAddress, bps: 10_000 }],
        },
      });
      if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
      const response = await fetch('/api/payment-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': request.current.key },
        body,
      });
      const envelope = (await response.json()) as { error?: { message: string } };
      if (!response.ok)
        throw new Error(envelope.error?.message ?? 'Payment request could not be created.');
      router.refresh();
      setPending(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment request could not be created.');
      setPending(false);
    }
  }

  return (
    <form action={(data) => void submit(data)} className="mt-6 space-y-4">
      <Field label="Request reference">
        <input
          className={inputClass}
          maxLength={80}
          name="reference"
          placeholder="INV-2026-001"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recipient name (optional)">
          <input className={inputClass} maxLength={120} name="recipientName" />
        </Field>
        <Field label="Recipient email (optional)">
          <input className={inputClass} name="recipientEmail" type="email" />
        </Field>
      </div>
      <Field label="Invoice title">
        <input className={inputClass} maxLength={80} name="title" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <input
            className={inputClass}
            inputMode="decimal"
            name="amount"
            placeholder="1.00"
            required
          />
        </Field>
        <Field label="Expires at">
          <input
            className={inputClass}
            defaultValue={defaultExpiry()}
            name="expiresAt"
            required
            type="datetime-local"
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Denomination">
          <select className={inputClass} defaultValue="USD" name="denomination">
            <option value="USD">USD</option>
            <option value="XRP">XRP</option>
          </select>
        </Field>
        <Field label="Settlement asset">
          <select className={inputClass} defaultValue="FXRP" name="settlementAsset">
            <option value="FXRP">FXRP</option>
            <option value="USDT0">USDT0 (when healthy)</option>
          </select>
        </Field>
      </div>
      <Field label="Description (optional)">
        <textarea className={inputClass} maxLength={500} name="description" rows={2} />
      </Field>
      <p className="text-xs text-[var(--muted)]">
        PayMorph stores recipient details for your reference only. Copy and send the checkout link
        yourself; no email is sent by this testnet build.
      </p>
      {error ? (
        <p className="text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Creating request…' : 'Create request'}
      </button>
    </form>
  );
}
const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[#0a1119] px-3 py-2 text-[var(--ink)]';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}
function defaultExpiry() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
