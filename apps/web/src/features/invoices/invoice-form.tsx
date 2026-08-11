'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bpsToPercentageInput, formatSplitPercentage, percentageToBps } from './split-percentage';

interface RecipientDraft {
  label: string;
  address: string;
  percentage: string;
}

export interface InvoiceFormTemplate {
  id: string;
  name: string;
  defaults: {
    title: string;
    description?: string | undefined;
    denomination: 'USD' | 'XRP';
    amount?: string | undefined;
    settlementAsset: 'FXRP' | 'USDT0';
    expiresInHours: number;
    recipients: Array<{ label: string; address: string; bps: number }>;
  };
}

const initialRecipient: RecipientDraft = { label: 'Merchant', address: '', percentage: '100' };

export function InvoiceForm({
  merchantAddress,
  template,
}: {
  merchantAddress: string;
  template?: InvoiceFormTemplate | undefined;
}) {
  const router = useRouter();
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() =>
    template
      ? template.defaults.recipients.map((recipient) => ({
          label: recipient.label,
          address: recipient.address,
          percentage: bpsToPercentageInput(recipient.bps),
        }))
      : [{ ...initialRecipient, address: merchantAddress }],
  );
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
      const expiresAtValue = formData.get('expiresAt');
      if (typeof expiresAtValue !== 'string') {
        throw new Error('Invoice expiry is required.');
      }
      const serializedRecipients = recipients.map((recipient) => {
        const bps = percentageToBps(recipient.percentage);
        if (bps === null) {
          throw new Error('Each recipient share must be between 0.01% and 100%.');
        }
        return { label: recipient.label, address: recipient.address, bps };
      });
      const body = JSON.stringify({
        title: formData.get('title'),
        description: formData.get('description') || undefined,
        externalRef: formData.get('externalRef') || undefined,
        denomination: formData.get('denomination'),
        amount: formData.get('amount'),
        settlementAsset: formData.get('settlementAsset'),
        expiresAt: new Date(expiresAtValue).toISOString(),
        recipients: serializedRecipients,
      });
      if (pendingRequest.current?.body !== body) {
        pendingRequest.current = { body, idempotencyKey: crypto.randomUUID() };
      }
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': pendingRequest.current.idempotencyKey,
        },
        body,
      });
      const envelope = (await response.json()) as {
        data?: { id: string };
        error?: { message: string; details?: unknown };
      };
      if (!response.ok || !envelope.data) {
        throw new Error(envelope.error?.message ?? 'Invoice could not be created.');
      }
      router.push(`/dashboard/invoices/${envelope.data.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invoice could not be created.');
      setSubmitting(false);
    }
  }

  return (
    <form action={(data) => void submit(data)} className="mt-10 space-y-8">
      {template ? (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--muted)]">
          Starting from <span className="font-medium text-[var(--ink)]">{template.name}</span>.
          Review the details before creating this immutable invoice.
        </div>
      ) : null}
      <fieldset className="grid gap-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <legend className="px-2 font-semibold">Invoice details</legend>
        <Field label="Title">
          <input
            className={inputClass}
            defaultValue={template?.defaults.title}
            maxLength={80}
            name="title"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            className={inputClass}
            defaultValue={template?.defaults.description}
            maxLength={500}
            name="description"
            rows={3}
          />
        </Field>
        <Field label="External reference">
          <input className={inputClass} maxLength={80} name="externalRef" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Denomination">
            <select
              className={inputClass}
              defaultValue={template?.defaults.denomination ?? 'USD'}
              name="denomination"
            >
              <option value="USD">USD</option>
              <option value="XRP">XRP</option>
            </select>
          </Field>
          <Field label="Amount">
            <input
              className={inputClass}
              inputMode="decimal"
              name="amount"
              pattern="^(0|[1-9]\d*)(\.\d+)?$"
              placeholder="1.00"
              required
              defaultValue={template?.defaults.amount}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Settlement asset">
            <select
              className={inputClass}
              defaultValue={template?.defaults.settlementAsset ?? 'FXRP'}
              name="settlementAsset"
            >
              <option value="FXRP">FXRP</option>
              <option value="USDT0">USDT0 (only when route is healthy)</option>
            </select>
          </Field>
          <Field label="Expires at">
            <input
              className={inputClass}
              defaultValue={defaultExpiry(template?.defaults.expiresInHours ?? 24)}
              name="expiresAt"
              required
              type="datetime-local"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <legend className="px-2 font-semibold">Recipient split</legend>
        <div className="mt-2 space-y-4">
          {recipients.map((recipient, index) => (
            <div
              className="grid gap-3 rounded-xl bg-white/[0.035] p-4 lg:grid-cols-[1fr_2fr_0.7fr_auto]"
              key={index}
            >
              <Field label={`Recipient ${index + 1} label`}>
                <input
                  className={inputClass}
                  maxLength={50}
                  onChange={(event) => updateRecipient(index, { label: event.target.value })}
                  required
                  value={recipient.label}
                />
              </Field>
              <Field label="Coston2 address">
                <input
                  className={`${inputClass} font-mono text-sm`}
                  onChange={(event) => updateRecipient(index, { address: event.target.value })}
                  pattern="^0x[0-9a-fA-F]{40}$"
                  required
                  value={recipient.address}
                />
              </Field>
              <Field label="Share (%)">
                <input
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
              </Field>
              <button
                aria-label={`Remove recipient ${index + 1}`}
                className="min-h-11 self-end rounded-full border border-[var(--line)] px-4 disabled:opacity-40"
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <button
            className="min-h-11 rounded-full border border-[var(--line)] px-5 disabled:opacity-40"
            disabled={recipients.length >= 10}
            onClick={() =>
              setRecipients((current) => [...current, { label: '', address: '', percentage: '' }])
            }
            type="button"
          >
            Add recipient
          </button>
          <p className={totalBps === 10_000 ? 'text-[var(--accent)]' : 'text-amber-300'}>
            Split total: {formatSplitPercentage(totalBps)} of 100%
          </p>
        </div>
      </fieldset>

      {error ? (
        <p
          className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className="min-h-12 rounded-full bg-[var(--accent)] px-7 py-3 font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        disabled={submitting || totalBps !== 10_000}
        type="submit"
      >
        {submitting ? 'Creating invoice…' : 'Create draft'}
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

function defaultExpiry(expiresInHours: number): string {
  const date = new Date(Date.now() + expiresInHours * 60 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
