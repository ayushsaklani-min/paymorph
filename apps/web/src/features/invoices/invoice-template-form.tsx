'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatSplitPercentage, percentageToBps } from './split-percentage';

interface RecipientDraft {
  label: string;
  address: string;
  percentage: string;
}

export function InvoiceTemplateForm({ merchantAddress }: { merchantAddress: string }) {
  const router = useRouter();
  const [recipients, setRecipients] = useState<RecipientDraft[]>([
    { label: 'Merchant', address: merchantAddress, percentage: '100' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRequest = useRef<{ body: string; idempotencyKey: string } | null>(null);
  const totalBps = useMemo(
    () =>
      recipients.reduce((sum, recipient) => sum + (percentageToBps(recipient.percentage) ?? 0), 0),
    [recipients],
  );

  function updateRecipient(index: number, patch: Partial<RecipientDraft>) {
    setRecipients((current) =>
      current.map((recipient, position) =>
        position === index ? { ...recipient, ...patch } : recipient,
      ),
    );
  }

  async function submit(formData: FormData) {
    try {
      setSubmitting(true);
      setError(undefined);
      const serializedRecipients = recipients.map((recipient) => {
        const bps = percentageToBps(recipient.percentage);
        if (bps === null) {
          throw new Error('Each recipient share must be between 0.01% and 100%.');
        }
        return { label: recipient.label, address: recipient.address, bps };
      });
      if (totalBps !== 10_000) {
        throw new Error('Recipient shares must add up to exactly 100%.');
      }
      const body = JSON.stringify({
        name: formData.get('name'),
        defaults: {
          title: formData.get('title'),
          description: formData.get('description') || undefined,
          denomination: formData.get('denomination'),
          amount: formData.get('amount') || undefined,
          settlementAsset: formData.get('settlementAsset'),
          expiresInHours: Number(formData.get('expiresInHours')),
          recipients: serializedRecipients,
        },
      });
      if (pendingRequest.current?.body !== body) {
        pendingRequest.current = { body, idempotencyKey: crypto.randomUUID() };
      }
      const response = await fetch('/api/invoice-templates', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': pendingRequest.current.idempotencyKey,
        },
        body,
      });
      const envelope = (await response.json()) as { error?: { message: string } };
      if (!response.ok) {
        throw new Error(envelope.error?.message ?? 'Template could not be saved.');
      }
      router.refresh();
      setSubmitting(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Template could not be saved.');
      setSubmitting(false);
    }
  }

  return (
    <form action={(data) => void submit(data)} className="mt-8 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name">
          <input
            className={inputClass}
            maxLength={80}
            name="name"
            placeholder="Monthly membership"
            required
          />
        </Field>
        <Field label="Invoice title">
          <input
            className={inputClass}
            maxLength={80}
            name="title"
            placeholder="Membership payment"
            required
          />
        </Field>
      </div>
      <Field label="Default description (optional)">
        <textarea className={inputClass} maxLength={500} name="description" rows={2} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Denomination">
          <select className={inputClass} defaultValue="USD" name="denomination">
            <option value="USD">USD</option>
            <option value="XRP">XRP</option>
          </select>
        </Field>
        <Field label="Default amount">
          <input className={inputClass} inputMode="decimal" name="amount" placeholder="1.00" />
        </Field>
        <Field label="Settle in">
          <select className={inputClass} defaultValue="FXRP" name="settlementAsset">
            <option value="FXRP">FXRP</option>
            <option value="USDT0">USDT0 (when healthy)</option>
          </select>
        </Field>
        <Field label="Expiry (hours)">
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
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-white/[0.025] p-4">
        <p className="text-sm font-medium">Default recipient split</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          These addresses are copied into each new invoice. Recipient shares must add up to 100%.
        </p>
        <div className="mt-4 space-y-3">
          {recipients.map((recipient, index) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_100px_auto]" key={index}>
              <input
                aria-label={`Recipient ${index + 1} label`}
                className={inputClass}
                maxLength={50}
                onChange={(event) => updateRecipient(index, { label: event.target.value })}
                required
                value={recipient.label}
              />
              <input
                aria-label={`Recipient ${index + 1} Coston2 address`}
                className={`${inputClass} font-mono text-sm`}
                onChange={(event) => updateRecipient(index, { address: event.target.value })}
                pattern="^0x[0-9a-fA-F]{40}$"
                required
                value={recipient.address}
              />
              <input
                aria-label={`Recipient ${index + 1} share percentage`}
                className={inputClass}
                inputMode="decimal"
                max="100"
                min="0.01"
                onChange={(event) => updateRecipient(index, { percentage: event.target.value })}
                required
                step="0.01"
                type="number"
                value={recipient.percentage}
              />
              <button
                className="min-h-11 self-end rounded-full border border-[var(--line)] px-3 text-sm disabled:opacity-40"
                disabled={recipients.length === 1}
                onClick={() =>
                  setRecipients((current) => current.filter((_, position) => position !== index))
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          className="mt-4 min-h-10 rounded-full border border-[var(--line)] px-4 text-sm disabled:opacity-40"
          disabled={recipients.length >= 10}
          onClick={() =>
            setRecipients((current) => [...current, { label: '', address: '', percentage: '' }])
          }
          type="button"
        >
          Add recipient
        </button>
        <p
          className={`mt-3 text-sm ${totalBps === 10_000 ? 'text-[var(--accent)]' : 'text-amber-300'}`}
        >
          Split total: {formatSplitPercentage(totalBps)} of 100%
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={submitting || totalBps !== 10_000}
        type="submit"
      >
        {submitting ? 'Saving template…' : 'Save template'}
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
