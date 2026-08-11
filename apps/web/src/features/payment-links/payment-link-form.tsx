'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canonicalPaymentLinkAmount, paymentLinkErrorMessage } from './payment-link-form-helpers';

export function PaymentLinkForm({ merchantAddress }: { merchantAddress: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRequest = useRef<{ body: string; idempotencyKey: string } | null>(null);

  async function submit(formData: FormData) {
    try {
      setSubmitting(true);
      setError(undefined);
      const linkExpiry = formData.get('linkExpiresAt');
      const amount = canonicalPaymentLinkAmount(formData.get('amount'));
      const body = JSON.stringify({
        name: formData.get('name'),
        mode: formData.get('mode'),
        ...(typeof linkExpiry === 'string' && linkExpiry
          ? { expiresAt: new Date(linkExpiry).toISOString() }
          : {}),
        defaults: {
          title: formData.get('title'),
          description: formData.get('description') || undefined,
          denomination: formData.get('denomination'),
          amount,
          settlementAsset: formData.get('settlementAsset'),
          expiresInHours: Number(formData.get('expiresInHours')),
          recipients: [{ label: 'Merchant', address: merchantAddress, bps: 10_000 }],
        },
      });
      if (pendingRequest.current?.body !== body) {
        pendingRequest.current = { body, idempotencyKey: crypto.randomUUID() };
      }
      const response = await fetch('/api/payment-links', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': pendingRequest.current.idempotencyKey,
        },
        body,
      });
      const envelope = (await response.json()) as {
        error?: { message?: unknown; details?: unknown };
      };
      if (!response.ok) throw new Error(paymentLinkErrorMessage(envelope.error));
      router.refresh();
      setSubmitting(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment link could not be created.');
      setSubmitting(false);
    }
  }

  return (
    <form action={(data) => void submit(data)} className="mt-6 space-y-4">
      <Field label="Link name">
        <input
          className={inputClass}
          maxLength={80}
          name="name"
          placeholder="Summer drop"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice title">
          <input
            className={inputClass}
            maxLength={80}
            name="title"
            placeholder="Summer collection"
            required
          />
        </Field>
        <Field label="Amount">
          <input
            className={inputClass}
            inputMode="decimal"
            name="amount"
            pattern="^(0|[1-9]\d*)(\.\d+)?$"
            placeholder="1.00"
            required
            title="Enter a positive amount such as 1 or 1.25"
          />
        </Field>
      </div>
      <Field label="Description (optional)">
        <textarea className={inputClass} maxLength={500} name="description" rows={2} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Link type">
          <select className={inputClass} defaultValue="REUSABLE" name="mode">
            <option value="REUSABLE">Reusable</option>
            <option value="SINGLE_USE">Single use</option>
          </select>
        </Field>
        <Field label="Checkout expires after (hours)">
          <input
            className={inputClass}
            defaultValue="24"
            max="720"
            min="1"
            name="expiresInHours"
            required
            type="number"
          />
        </Field>
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
      <Field label="Stop accepting new checkouts at (optional)">
        <input className={inputClass} name="linkExpiresAt" type="datetime-local" />
      </Field>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Each checkout creates an immutable canonical invoice. The default recipient is your
        connected Coston2 wallet. Amounts use a dot as the decimal separator.
      </p>
      {error ? (
        <p className="text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {submitting ? 'Creating link…' : 'Create payment link'}
      </button>
    </form>
  );
}

const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-deep)] px-3 py-2 text-[var(--ink)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}
