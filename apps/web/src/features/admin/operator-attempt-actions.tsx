'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

interface RecoveryDiagnosis {
  eligible: boolean;
  reason: string;
  transactionUsed: boolean;
  settlementFound: boolean;
  diagnosedAt: string;
}

export function OperatorAttemptActions({
  attemptId,
  retryJobType,
  canDiagnoseRecovery,
}: {
  attemptId: string;
  retryJobType: string | null;
  canDiagnoseRecovery: boolean;
}) {
  const router = useRouter();
  const retryKey = useRef<string | null>(null);
  const [pending, setPending] = useState<'retry' | 'diagnose' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<RecoveryDiagnosis | null>(null);

  async function retry() {
    if (retryJobType === null) return;
    setPending('retry');
    setMessage(null);
    retryKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/attempts/${encodeURIComponent(attemptId)}/retry`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': retryKey.current,
        },
        body: JSON.stringify({ jobType: retryJobType }),
      });
      const envelope = (await response.json()) as ApiEnvelope<{ jobId: string }>;
      if (!response.ok || envelope.data === null) {
        throw new Error(envelope.error?.message ?? 'Retry was not accepted');
      }
      setMessage(`Retry-safe ${retryJobType} job is ready.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Retry was not accepted');
    } finally {
      setPending(null);
    }
  }

  async function diagnose() {
    setPending('diagnose');
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/attempts/${encodeURIComponent(attemptId)}/diagnose-recovery`,
        { method: 'POST', credentials: 'same-origin' },
      );
      const envelope = (await response.json()) as ApiEnvelope<RecoveryDiagnosis>;
      if (!response.ok || envelope.data === null) {
        throw new Error(envelope.error?.message ?? 'Recovery diagnosis failed');
      }
      setDiagnosis(envelope.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recovery diagnosis failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="min-h-10 rounded-xl border border-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={retryJobType === null || pending !== null}
          onClick={() => void retry()}
          title={
            retryJobType === null
              ? 'No state-compatible implemented worker retry is available'
              : `Queue ${retryJobType}`
          }
          type="button"
        >
          {pending === 'retry'
            ? 'Queueing…'
            : retryJobType === null
              ? 'Retry unavailable'
              : `Retry ${retryJobType}`}
        </button>
        <button
          className="min-h-10 rounded-xl border border-[var(--line)] px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canDiagnoseRecovery || pending !== null}
          onClick={() => void diagnose()}
          title={
            canDiagnoseRecovery
              ? 'Run a fresh read-only Coston2 eligibility diagnosis'
              : 'This attempt has no validated recovery evidence'
          }
          type="button"
        >
          {pending === 'diagnose' ? 'Diagnosing…' : 'Diagnose recovery'}
        </button>
      </div>
      {message !== null ? (
        <p className="mt-2 text-right text-xs text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
      {diagnosis !== null ? (
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[#0a1119] p-3 text-xs">
          <p className="font-semibold">
            {diagnosis.eligible ? 'Eligible for recovery flow' : 'Not recovery eligible'}
          </p>
          <p className="mt-1 font-mono text-[var(--muted)]">{diagnosis.reason}</p>
          <p className="mt-1 text-[var(--muted)]">
            Transaction used: {diagnosis.transactionUsed ? 'yes' : 'no'} · settlement found:{' '}
            {diagnosis.settlementFound ? 'yes' : 'no'} · checked {diagnosis.diagnosedAt}
          </p>
        </div>
      ) : null}
    </div>
  );
}
