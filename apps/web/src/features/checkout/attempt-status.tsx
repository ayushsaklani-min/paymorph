'use client';

import { useEffect, useRef, useState } from 'react';

interface Attempt {
  id: string;
  status: string;
  xrplTxHash: string | null;
  recoveryTxHash: string | null;
  flareTxHash: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  settledAt: string | null;
  updatedAt: string;
}

interface Envelope {
  data: Attempt | null;
  error: { message: string } | null;
}

interface RecoveryPayload {
  attemptId: string;
  payloadUuid: string;
  qrPngUrl: string;
  deeplinkUrl: string;
  websocketUrl: string;
  expiresAt: string;
  recoveryAsset: 'FXRP';
  warning: string;
}

interface RecoveryEnvelope {
  data: RecoveryPayload | null;
  error: { message: string } | null;
}

const TERMINAL = new Set([
  'SETTLED',
  'REJECTED',
  'QUOTE_EXPIRED',
  'XRPL_FAILED',
  'EXECUTION_REVERTED',
  'RECOVERED',
  'CANCELLED',
]);

const LABELS: Record<string, string> = {
  AWAITING_SIGNATURE: 'Waiting for your Xaman signature',
  XRPL_SIGNED: 'Payment submitted to XRPL Testnet',
  XRPL_VALIDATED: 'XRPL payment validated',
  FDC_REQUESTED: 'Requesting Flare Data Connector proof',
  FDC_READY: 'FDC proof ready',
  FLARE_SUBMITTED: 'Settlement submitted on Coston2',
  FLARE_CONFIRMED: 'Coston2 transaction confirmed',
  SETTLED: 'Payment settled',
  RECOVERY_REQUIRED: 'Settlement needs recovery',
};

export function AttemptStatus({ attemptId }: { attemptId: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryConsent, setRecoveryConsent] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState<RecoveryPayload | null>(null);
  const [recoveryProgress, setRecoveryProgress] = useState<string | null>(null);
  const reconciledPaymentRef = useRef(false);

  useEffect(() => {
    if (reconciledPaymentRef.current) return;
    reconciledPaymentRef.current = true;

    async function reconcilePaymentReturn() {
      try {
        await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/resolve-payment`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      } catch {
        // The regular status projection remains available; this is a
        // best-effort return-page trigger, not settlement authority.
      }
    }

    void reconcilePaymentReturn();
  }, [attemptId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const envelope = (await response.json()) as Envelope;
        if (!response.ok || !envelope.data) {
          throw new Error(envelope.error?.message ?? 'Unable to load payment status');
        }
        if (stopped) return;
        setAttempt(envelope.data);
        setError(null);
        if (!TERMINAL.has(envelope.data.status)) timer = setTimeout(() => void poll(), 3_000);
      } catch (caught) {
        if (stopped) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load payment status');
        timer = setTimeout(() => void poll(), 5_000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [attemptId]);

  useEffect(() => {
    if (recoveryPayload === null || attempt?.recoveryTxHash) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(recoveryPayload.websocketUrl);
    } catch {
      setRecoveryProgress('Real-time status unavailable; payment status still refreshes here.');
      return;
    }
    socket.addEventListener('message', () => {
      setRecoveryProgress('Xaman update received. Verifying the signed request…');
    });
    socket.addEventListener('error', () => {
      setRecoveryProgress('Real-time status unavailable; payment status still refreshes here.');
    });
    return () => socket.close();
  }, [attempt?.recoveryTxHash, recoveryPayload]);

  async function createRecovery() {
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const storageKey = `paymorph:recovery-idempotency:${attemptId}`;
      let idempotencyKey = sessionStorage.getItem(storageKey);
      if (idempotencyKey === null) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(storageKey, idempotencyKey);
      }
      const response = await fetch(
        `/api/attempts/${encodeURIComponent(attemptId)}/recovery-payload`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: '{}',
        },
      );
      const envelope = (await response.json()) as RecoveryEnvelope;
      if (!response.ok || envelope.data === null) {
        throw new Error(envelope.error?.message ?? 'Unable to create recovery request');
      }
      setRecoveryPayload(envelope.data);
      setRecoveryProgress('Waiting for your recovery signature in Xaman.');
    } catch (caught) {
      setRecoveryError(
        caught instanceof Error ? caught.message : 'Unable to create recovery request',
      );
    } finally {
      setRecoveryBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted)]">Live payment status</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {attempt ? (LABELS[attempt.status] ?? attempt.status.replaceAll('_', ' ')) : 'Loading…'}
      </h1>
      {attempt?.status === 'SETTLED' ? (
        <a
          className="mt-5 inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
          href={`/receipt/${attempt.id}`}
        >
          View on-chain receipt
        </a>
      ) : null}
      {attempt?.status === 'RECOVERY_REQUIRED' ? (
        <div className="mt-6 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Recovery requires a new payment</h2>
          <p className="mt-3 text-sm leading-6 text-amber-50">
            The original XRP payment was confirmed, but merchant settlement did not finish. Recovery
            requires signing another XRPL Testnet transaction.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-50">
            <li>Recovery mints test FXRP to your Coston2 personal account.</li>
            <li>It does not return native XRP.</li>
            <li>It skips the original merchant settlement instruction.</li>
            <li>It does not mark this invoice as paid.</li>
            <li>All assets are testnet tokens with no real monetary value.</li>
          </ul>

          {recoveryPayload === null ? (
            <>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-amber-50">
                <input
                  checked={recoveryConsent}
                  className="mt-1 size-4 accent-[var(--accent)]"
                  onChange={(event) => setRecoveryConsent(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I understand recovery sends another XRP Testnet payment and does not complete the
                  merchant invoice.
                </span>
              </label>
              <button
                className="mt-5 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!recoveryConsent || recoveryBusy}
                onClick={() => void createRecovery()}
                type="button"
              >
                {recoveryBusy ? 'Checking eligibility…' : 'Continue to recovery'}
              </button>
            </>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-[10rem_1fr] sm:items-center">
              <div className="rounded-2xl bg-white p-3">
                <img
                  alt="QR code for the Xaman recovery request"
                  className="aspect-square h-auto w-full"
                  height="160"
                  src={recoveryPayload.qrPngUrl}
                  width="160"
                />
              </div>
              <div>
                <p className="text-sm leading-6 text-amber-50">
                  Review the exact recovery transaction in Xaman before signing.
                </p>
                <a
                  className="mt-4 inline-flex rounded-xl border border-[var(--accent)] px-4 py-2.5 font-semibold text-[var(--accent)]"
                  href={recoveryPayload.deeplinkUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open recovery in Xaman
                </a>
                <p aria-live="polite" className="mt-3 text-xs text-amber-100">
                  {attempt.recoveryTxHash
                    ? 'Recovery payment submitted. Waiting for XRPL validation and FDC evidence.'
                    : recoveryProgress}
                </p>
              </div>
            </div>
          )}
          {recoveryError ? (
            <p aria-live="assertive" className="mt-4 text-sm text-red-200" role="alert">
              {recoveryError}
            </p>
          ) : null}
        </div>
      ) : null}
      {attempt?.failureMessage ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          {attempt.failureMessage}
        </p>
      ) : null}
      {attempt?.xrplTxHash ? (
        <a
          className="mt-5 block break-all font-mono text-xs text-[var(--accent)] underline"
          href={`https://testnet.xrpl.org/transactions/${attempt.xrplTxHash}`}
          rel="noreferrer"
          target="_blank"
        >
          XRPL: {attempt.xrplTxHash}
        </a>
      ) : null}
      {attempt?.recoveryTxHash ? (
        <a
          className="mt-3 block break-all font-mono text-xs text-amber-200 underline"
          href={`https://testnet.xrpl.org/transactions/${attempt.recoveryTxHash}`}
          rel="noreferrer"
          target="_blank"
        >
          Recovery XRPL: {attempt.recoveryTxHash}
        </a>
      ) : null}
      {attempt?.flareTxHash ? (
        <a
          className="mt-3 block break-all font-mono text-xs text-[var(--accent)] underline"
          href={`https://coston2-explorer.flare.network/tx/${attempt.flareTxHash}`}
          rel="noreferrer"
          target="_blank"
        >
          Coston2: {attempt.flareTxHash}
        </a>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      <p className="mt-6 text-xs text-[var(--muted)]">
        Testnet tokens have no real monetary value. This page follows independently verified chain
        evidence.
      </p>
    </section>
  );
}
