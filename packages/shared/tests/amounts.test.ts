import { describe, expect, it } from 'vitest';
import {
  ceilBps,
  formatBaseUnits,
  parseBaseUnits,
  parseDisplayAmount,
  splitByBps,
} from '../src/amounts/index.js';

describe('amount utilities', () => {
  it('parses and formats without floating point', () => {
    expect(parseDisplayAmount('1.234567', 6)).toBe(1_234_567n);
    expect(formatBaseUnits(1_234_500n, 6)).toBe('1.2345');
    expect(parseBaseUnits('0')).toBe(0n);
  });

  it('rejects non-canonical base units and excess precision', () => {
    expect(() => parseBaseUnits('01')).toThrow();
    expect(() => parseDisplayAmount('1.0000001', 6)).toThrow();
    expect(() => parseDisplayAmount('1e6', 6)).toThrow();
  });

  it('rounds service fees up', () => {
    expect(ceilBps(1n, 50)).toBe(1n);
    expect(ceilBps(1_000_000n, 50)).toBe(5_000n);
  });

  it('assigns recipient dust to the final recipient', () => {
    const shares = splitByBps(101n, [8_500, 1_000, 500]);
    expect(shares).toEqual([85n, 10n, 6n]);
    expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(101n);
  });
});
