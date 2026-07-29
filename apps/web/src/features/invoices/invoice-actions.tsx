'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function mutate(action: 'publish' | 'cancel') {
    try {
      setPending(true);
      setError(undefined);
      const response = await fetch(`/api/invoices/${invoiceId}/${action}`, { method: 'POST' });
      const envelope = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(envelope.error?.message ?? `Could not ${action} invoice.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not update invoice.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {status === 'DRAFT' ? (
          <button
            className="min-h-11 rounded-full bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)]"
            disabled={pending}
            onClick={() => void mutate('publish')}
            type="button"
          >
            Publish invoice
          </button>
        ) : null}
        {status === 'DRAFT' || status === 'ACTIVE' ? (
          <button
            className="min-h-11 rounded-full border border-[var(--line)] px-5"
            disabled={pending}
            onClick={() => void mutate('cancel')}
            type="button"
          >
            Cancel invoice
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
