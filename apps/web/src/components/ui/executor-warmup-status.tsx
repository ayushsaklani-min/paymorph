'use client';

import { useEffect, useState } from 'react';

type WarmupState = 'WARMING' | 'READY' | 'DELAYED' | 'HIDDEN';

const PROBE_INTERVAL_MS = 4_000;
const DELAYED_AFTER_MS = 75_000;
const READY_DISPLAY_MS = 6_000;

interface ProbeEnvelope {
  readonly data?: { readonly state?: 'READY' | 'WARMING' | 'DISABLED' } | null;
}

export function ExecutorWarmupStatus() {
  const [state, setState] = useState<WarmupState>('WARMING');

  useEffect(() => {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleProbe = () => {
      timer = setTimeout(() => void probe(), PROBE_INTERVAL_MS);
    };

    const probe = async () => {
      try {
        const response = await fetch('/api/executor/wake?probe=1', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        });
        const envelope = (await response.json()) as ProbeEnvelope;
        if (cancelled) return;
        if (envelope.data?.state === 'READY') {
          setState('READY');
          timer = setTimeout(() => setState('HIDDEN'), READY_DISPLAY_MS);
          return;
        }
        if (envelope.data?.state === 'DISABLED') {
          setState('HIDDEN');
          return;
        }
      } catch {
        if (cancelled) return;
      }

      setState(Date.now() - startedAt >= DELAYED_AFTER_MS ? 'DELAYED' : 'WARMING');
      scheduleProbe();
    };

    void fetch('/api/executor/wake', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      keepalive: true,
    })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) void probe();
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  if (state === 'HIDDEN') return null;

  const ready = state === 'READY';
  const delayed = state === 'DELAYED';
  return (
    <aside
      aria-busy={!ready}
      aria-live="polite"
      aria-label={ready ? 'Testnet executor is awake' : 'Preparing the testnet executor'}
      className="pm-engine-status"
      data-engine-state={state}
      role="status"
    >
      <span className="pm-engine-status-mark" aria-hidden="true">
        {ready ? '✓' : ''}
      </span>
      <span>
        <strong>
          {ready
            ? 'Testnet executor is awake'
            : delayed
              ? 'Settlement engine is still warming'
              : 'Preparing testnet settlement'}
        </strong>
        <small>
          {ready
            ? 'Ready to process durable evidence jobs.'
            : delayed
              ? 'No action needed—testnet jobs remain durable.'
              : 'Keep exploring while the evidence executor wakes.'}
        </small>
      </span>
    </aside>
  );
}
