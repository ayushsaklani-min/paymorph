import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminalStatus } from '../src/state-machine/attempt.js';

describe('payment attempt state machine', () => {
  it('permits the successful chain path', () => {
    expect(canTransition('XRPL_SIGNED', 'XRPL_VALIDATED')).toBe(true);
    expect(canTransition('FLARE_CONFIRMED', 'SETTLED')).toBe(true);
  });

  it('cannot settle from webhook-facing states', () => {
    expect(canTransition('AWAITING_SIGNATURE', 'SETTLED')).toBe(false);
    expect(() => assertTransition('XRPL_SIGNED', 'SETTLED')).toThrow();
  });

  it('treats settled as terminal', () => {
    expect(isTerminalStatus('SETTLED')).toBe(true);
  });
});
