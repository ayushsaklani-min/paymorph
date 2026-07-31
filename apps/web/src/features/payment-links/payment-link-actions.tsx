'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function PaymentLinkActions({ id }: { id: string }) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function archive() {
    try {
      setPending(true);
      setError(undefined);
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch(`/api/payment-links/${id}/archive`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey.current },
      });
      const envelope = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(envelope.error?.message ?? 'Link could not be archived.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Link could not be archived.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="text-right">
      <button
        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={pending}
        onClick={() => void archive()}
        type="button"
      >
        {pending ? 'Archiving…' : 'Archive'}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
