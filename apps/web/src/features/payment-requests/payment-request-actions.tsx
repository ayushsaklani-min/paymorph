'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function PaymentRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function cancel() {
    try {
      setPending(true);
      setError(undefined);
      key.current ??= crypto.randomUUID();
      const response = await fetch(`/api/payment-requests/${id}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': key.current },
      });
      const body = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'Request could not be cancelled.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request could not be cancelled.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="text-right">
      <button
        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={pending}
        onClick={() => void cancel()}
        type="button"
      >
        {pending ? 'Cancelling…' : 'Cancel'}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
