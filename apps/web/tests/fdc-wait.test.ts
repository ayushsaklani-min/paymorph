import { describe, expect, it } from 'vitest';
import { fdcWaitSnapshot } from '../src/features/checkout/fdc-wait.js';

describe('FDC wait presentation', () => {
  it('formats a normal consensus wait without calling it delayed', () => {
    expect(
      fdcWaitSnapshot('2026-08-09T17:13:30.000Z', Date.parse('2026-08-09T17:15:34.000Z')),
    ).toEqual({ elapsedSeconds: 124, elapsedLabel: '2m 04s', isExtended: false });
  });

  it('marks waits at or beyond three minutes as extended', () => {
    expect(
      fdcWaitSnapshot('2026-08-09T17:13:30.000Z', Date.parse('2026-08-09T17:16:30.000Z')),
    ).toMatchObject({ elapsedSeconds: 180, isExtended: true });
  });

  it('fails safe to zero for an invalid or future timestamp', () => {
    expect(fdcWaitSnapshot('not-a-date', Date.now()).elapsedSeconds).toBe(0);
    expect(
      fdcWaitSnapshot('2026-08-09T18:00:00.000Z', Date.parse('2026-08-09T17:00:00.000Z')),
    ).toMatchObject({ elapsedSeconds: 0, elapsedLabel: '0s' });
  });
});
