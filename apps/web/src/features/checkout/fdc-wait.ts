export const FDC_TYPICAL_MIN_SECONDS = 90;
export const FDC_TYPICAL_MAX_SECONDS = 180;

export interface FdcWaitSnapshot {
  elapsedSeconds: number;
  elapsedLabel: string;
  isExtended: boolean;
}

export function fdcWaitSnapshot(startedAt: string, nowMs: number): FdcWaitSnapshot {
  const startedAtMs = Date.parse(startedAt);
  const elapsedSeconds = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000))
    : 0;

  return {
    elapsedSeconds,
    elapsedLabel: formatElapsed(elapsedSeconds),
    isExtended: elapsedSeconds >= FDC_TYPICAL_MAX_SECONDS,
  };
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
