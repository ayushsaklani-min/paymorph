import { describe, expect, it } from 'vitest';
import { transitionAttempt } from '../src/attempts.js';

describe('generic attempt transitions', () => {
  it('cannot bypass persisted recovery evidence when transitioning to RECOVERED', async () => {
    await expect(
      transitionAttempt({
        attemptId: 'attempt-without-recovery-evidence',
        expectedStatus: 'RECOVERY_REQUIRED',
        nextStatus: 'RECOVERED',
      }),
    ).rejects.toThrow('RECOVERED requires the dedicated persisted-evidence recovery transition');
  });
});
