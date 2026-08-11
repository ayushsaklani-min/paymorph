'use client';

import { useEffect, useRef, useState } from 'react';
import { FDC_TYPICAL_MAX_SECONDS, fdcWaitSnapshot } from './fdc-wait';

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

const JOURNEY = [
  ['Xaman', 'Approve the exact XRP Testnet payment'],
  ['XRPL', 'Confirm the payment on XRPL Testnet'],
  ['Flare Data Connector', 'Verify independent payment evidence'],
  ['Coston2', 'Mint and settle the merchant payment'],
] as const;

interface Presentation {
  title: string;
  description: string;
  nextStep: string;
  progress: number;
  tone: 'pending' | 'success' | 'attention';
}

function presentationFor(status: string | undefined): Presentation {
  switch (status) {
    case 'AWAITING_SIGNATURE':
      return {
        title: 'Approval pending',
        description: 'Your exact XRP Testnet payment is waiting for approval in Xaman.',
        nextStep: 'Approve it in Xaman. PayMorph will continue automatically after verification.',
        progress: 0,
        tone: 'pending',
      };
    case 'XRPL_SIGNED':
      return {
        title: 'XRP payment received',
        description: 'Your signed transaction was received and is being finalized on XRPL Testnet.',
        nextStep: 'No action needed. We are waiting for validated ledger evidence.',
        progress: 1,
        tone: 'pending',
      };
    case 'XRPL_VALIDATED':
      return {
        title: 'XRP payment verified',
        description: 'XRPL Testnet has validated the exact payment details.',
        nextStep: 'PayMorph is requesting independent Flare Data Connector evidence.',
        progress: 2,
        tone: 'pending',
      };
    case 'FDC_REQUESTED':
      return {
        title: 'Independent verification in progress',
        description: 'Flare data providers are reaching consensus on the validated XRPL payment.',
        nextStep: 'No action needed. Do not send a second payment while verification continues.',
        progress: 2,
        tone: 'pending',
      };
    case 'FDC_READY':
    case 'FLARE_SUBMITTED':
      return {
        title: 'Settlement is executing',
        description: 'The verified payment is being minted and routed on Flare Coston2.',
        nextStep: 'No action needed. We are waiting for the on-chain settlement receipt.',
        progress: 3,
        tone: 'pending',
      };
    case 'FLARE_CONFIRMED':
      return {
        title: 'Finalizing your receipt',
        description:
          'Coston2 confirmed the transaction and PayMorph is indexing settlement evidence.',
        nextStep: 'Your receipt will appear as soon as the PaymentSettled event is decoded.',
        progress: 3,
        tone: 'pending',
      };
    case 'SETTLED':
      return {
        title: 'Payment complete',
        description: 'Your merchant payment is settled and independently verified on-chain.',
        nextStep: 'Your permanent receipt is ready to view.',
        progress: 4,
        tone: 'success',
      };
    case 'RECOVERY_REQUIRED':
      return {
        title: 'Recovery review required',
        description:
          'The XRP payment was confirmed, but the original merchant settlement did not finish.',
        nextStep: 'Review the recovery details below before deciding whether to continue.',
        progress: 2,
        tone: 'attention',
      };
    case 'QUOTE_EXPIRED':
      return {
        title: 'Payment request expired',
        description: 'This protected quote expired before a verified Xaman signature was received.',
        nextStep: 'Return to checkout to create a new exact payment request.',
        progress: 0,
        tone: 'attention',
      };
    case 'REJECTED':
      return {
        title: 'Payment was not approved',
        description: 'Xaman did not return a signed payment for this request.',
        nextStep: 'Return to checkout when you are ready to create a new request.',
        progress: 0,
        tone: 'attention',
      };
    case 'XRPL_FAILED':
    case 'EXECUTION_REVERTED':
    case 'CANCELLED':
      return {
        title: 'Payment needs attention',
        description: 'This payment cannot continue automatically.',
        nextStep: 'Review the details below or return to checkout for a new request.',
        progress: 0,
        tone: 'attention',
      };
    default:
      return {
        title: 'Preparing secure payment status',
        description: 'Loading the latest independently verified payment evidence.',
        nextStep: 'This page refreshes automatically.',
        progress: 0,
        tone: 'pending',
      };
  }
}

function FdcWaitPanel({ startedAt }: { startedAt: string }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const snapshot = fdcWaitSnapshot(startedAt, nowMs ?? Date.parse(startedAt));
  return (
    <div className="pm-card mt-6 overflow-hidden rounded-3xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Flare consensus round</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Secure FDC verification normally takes around 90–180 seconds on testnet.
          </p>
        </div>
        <time
          className="rounded-full border border-[var(--line)] bg-black/15 px-3 py-1.5 font-mono text-xs text-[var(--accent)]"
          dateTime={`PT${snapshot.elapsedSeconds}S`}
        >
          {snapshot.elapsedLabel} elapsed
        </time>
      </div>

      <div
        aria-label="Flare Data Connector verification is active"
        className="mt-5 h-2 overflow-hidden rounded-full bg-black/20"
        role="progressbar"
      >
        <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-[var(--accent)] via-[#f3ad96] to-[#e87f66]" />
      </div>

      <div className="mt-5 grid gap-2 text-xs sm:grid-cols-3">
        <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-2.5 text-emerald-100">
          <span className="mr-2" aria-hidden="true">
            ✓
          </span>
          XRPL evidence locked
        </p>
        <p className="rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/8 px-3 py-2.5">
          <span className="mr-2 animate-pulse" aria-hidden="true">
            ●
          </span>
          Provider consensus
        </p>
        <p className="rounded-xl border border-[var(--line)] bg-black/10 px-3 py-2.5 text-[var(--muted)]">
          <span className="mr-2" aria-hidden="true">
            3
          </span>
          Proof publication
        </p>
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
        {snapshot.isExtended
          ? `This is taking longer than the usual ${FDC_TYPICAL_MAX_SECONDS / 60}-minute window, but PayMorph is still checking safely every 10 seconds.`
          : 'You can leave this page open. PayMorph will move to Coston2 automatically as soon as the proof is valid.'}
      </p>
    </div>
  );
}

function JourneyTracker({ progress }: { progress: number }) {
  return (
    <ol className="mt-8 grid gap-3 sm:grid-cols-4" aria-label="Payment progress">
      {JOURNEY.map(([label, detail], index) => {
        const complete = progress > index;
        const active = progress === index && progress < JOURNEY.length;
        return (
          <li
            className={`relative overflow-hidden rounded-2xl border p-3.5 transition duration-300 hover:-translate-y-0.5 ${
              complete
                ? 'border-emerald-400/40 bg-emerald-400/10'
                : active
                  ? 'border-[var(--accent)]/70 bg-[var(--accent)]/10'
                  : 'border-[var(--line)] bg-black/10'
            }`}
            key={label}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${
                  complete
                    ? 'bg-emerald-300 text-emerald-950'
                    : active
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'border border-[var(--line)] text-[var(--muted)]'
                }`}
              >
                {complete ? '✓' : index + 1}
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function AttemptStatus({
  attemptId,
  invoiceSlug,
}: {
  attemptId: string;
  invoiceSlug: string;
}) {
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
      } catch {
        if (stopped) return;
        setError('Live updates are reconnecting. Your payment has not been changed.');
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

  const presentation = presentationFor(attempt?.status);
  const toneClass =
    presentation.tone === 'success'
      ? 'border-emerald-400/40 bg-emerald-400/10'
      : presentation.tone === 'attention'
        ? 'border-amber-300/40 bg-amber-300/10'
        : 'border-[var(--accent)]/35 bg-[var(--accent)]/8';

  return (
    <section className="pm-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-[var(--line)] bg-black/10 px-6 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">Secure payment tracking</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Updates automatically every few seconds
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-black/10 px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            Live
          </span>
        </div>
      </div>

      <div className="px-6 py-7 sm:px-8">
        <div className={`pm-card rounded-3xl border p-5 sm:p-6 ${toneClass}`} aria-live="polite">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold ${
                presentation.tone === 'success'
                  ? 'bg-emerald-300 text-emerald-950'
                  : presentation.tone === 'attention'
                    ? 'bg-amber-300 text-amber-950'
                    : 'bg-[var(--accent)] text-[var(--accent-ink)]'
              }`}
            >
              {presentation.tone === 'success'
                ? '✓'
                : presentation.tone === 'attention'
                  ? '!'
                  : '↗'}
            </span>
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">
                {LABELS[attempt?.status ?? ''] ?? 'Live payment status'}
              </p>
              <h1 className="pm-display mt-1 text-3xl">{presentation.title}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
                {presentation.description}
              </p>
              <p className="mt-3 text-sm font-medium">{presentation.nextStep}</p>
            </div>
          </div>
        </div>

        <JourneyTracker progress={presentation.progress} />

        {attempt?.status === 'FDC_REQUESTED' ? (
          <FdcWaitPanel startedAt={attempt.updatedAt} />
        ) : null}

        {attempt?.status === 'SETTLED' ? (
          <a
            className="pm-button pm-button-primary mt-7 inline-flex min-h-11 items-center px-5 py-3 font-semibold"
            href={`/receipt/${attempt.id}`}
          >
            View verified receipt
          </a>
        ) : null}

        {attempt &&
        ['QUOTE_EXPIRED', 'REJECTED', 'XRPL_FAILED', 'EXECUTION_REVERTED', 'CANCELLED'].includes(
          attempt.status,
        ) ? (
          <a
            className="pm-button pm-button-secondary mt-7 inline-flex min-h-11 items-center px-5 py-3 font-semibold text-[var(--accent)]"
            href={`/pay/${encodeURIComponent(invoiceSlug)}`}
          >
            Return to checkout
          </a>
        ) : null}
        {attempt?.status === 'RECOVERY_REQUIRED' ? (
          <div className="pm-card mt-6 rounded-3xl border border-amber-300/40 bg-amber-300/10 p-5">
            <h2 className="pm-display text-xl text-amber-100">Recovery requires a new payment</h2>
            <p className="mt-3 text-sm leading-6 text-amber-50">
              The original XRP payment was confirmed, but merchant settlement did not finish.
              Recovery requires signing another XRPL Testnet transaction.
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
                    I understand recovery sends another XRP Testnet payment and does not complete
                    the merchant invoice.
                  </span>
                </label>
                <button
                  className="pm-button pm-button-primary mt-5 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="pm-button pm-button-secondary mt-4 inline-flex px-4 py-2.5 font-semibold text-[var(--accent)]"
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
          <div className="pm-card mt-6 rounded-3xl border border-amber-300/40 bg-amber-300/10 p-5">
            <p className="text-sm font-semibold text-amber-100">Additional detail</p>
            <p className="mt-2 text-sm leading-6 text-amber-50/90">{attempt.failureMessage}</p>
          </div>
        ) : null}

        {attempt?.xrplTxHash || attempt?.recoveryTxHash || attempt?.flareTxHash ? (
          <div className="pm-card mt-7 rounded-3xl bg-black/10 p-5">
            <h2 className="pm-display text-lg">Verified records</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Links open the public Testnet explorers in a new tab.
            </p>
            <div className="mt-4 space-y-3">
              {attempt.xrplTxHash ? (
                <a
                  className="block break-all rounded-lg border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--accent)] underline underline-offset-4"
                  href={`https://testnet.xrpl.org/transactions/${attempt.xrplTxHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  XRPL payment: {attempt.xrplTxHash}
                </a>
              ) : null}
              {attempt.recoveryTxHash ? (
                <a
                  className="block break-all rounded-lg border border-[var(--line)] px-3 py-2 font-mono text-xs text-amber-200 underline underline-offset-4"
                  href={`https://testnet.xrpl.org/transactions/${attempt.recoveryTxHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Recovery XRPL payment: {attempt.recoveryTxHash}
                </a>
              ) : null}
              {attempt.flareTxHash ? (
                <a
                  className="block break-all rounded-lg border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--accent)] underline underline-offset-4"
                  href={`https://coston2-explorer.flare.network/tx/${attempt.flareTxHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Coston2 settlement: {attempt.flareTxHash}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-300/30 bg-sky-300/10 p-4 text-sm text-sky-100">
            <span aria-hidden="true" className="mt-0.5">
              ↻
            </span>
            <p>{error}</p>
          </div>
        ) : null}

        <p className="mt-8 border-t border-[var(--line)] pt-5 text-xs leading-5 text-[var(--muted)]">
          Testnet tokens have no real monetary value. PayMorph shows completion only after
          independently verified XRPL and Coston2 settlement evidence.
        </p>
      </div>
    </section>
  );
}
