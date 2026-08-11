import { describe, expect, it } from 'vitest';
import { bpsToPercentageInput, formatSplitPercentage, percentageToBps } from './split-percentage';

describe('recipient split percentage formatting', () => {
  it.each([
    ['100', 10_000],
    ['60', 6_000],
    ['33.33', 3_333],
    ['12.5', 1_250],
    ['0.01', 1],
  ])('converts %s percent to exact basis points', (percentage, expected) => {
    expect(percentageToBps(percentage)).toBe(expected);
  });

  it.each(['', '0', '0.001', '33.333', '100.01', '101', '-1', 'one'])(
    'rejects invalid percentage input %s',
    (percentage) => {
      expect(percentageToBps(percentage)).toBeNull();
    },
  );

  it('formats stored integer shares as customer-facing percentages', () => {
    expect(bpsToPercentageInput(10_000)).toBe('100');
    expect(bpsToPercentageInput(3_333)).toBe('33.33');
    expect(bpsToPercentageInput(1_250)).toBe('12.5');
    expect(formatSplitPercentage(10_000)).toBe('100%');
  });
});
