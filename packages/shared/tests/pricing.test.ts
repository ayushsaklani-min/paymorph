import { describe, expect, it } from 'vitest';
import {
  applySlippageCeil,
  ftsoPriceAsRational,
  usdCentsToFxrpUBA,
  usdCentsToUsdt0BaseUnits,
  xrpUbaToUsdt0BaseUnits,
} from '../src/amounts/pricing.js';

describe('integer quote pricing', () => {
  it('converts a USD invoice to FXRP with upward rounding', () => {
    // XRP/USD = 2.500000, so $1.00 is exactly 0.4 XRP.
    expect(usdCentsToFxrpUBA(100n, 2_500_000n, 6)).toBe(400_000n);
    expect(usdCentsToFxrpUBA(1n, 3_000_000n, 6)).toBe(3_334n);
  });

  it('supports the full signed FTSO decimal range semantics', () => {
    expect(ftsoPriceAsRational(250n, 2)).toEqual({
      numerator: 250n,
      denominator: 100n,
    });
    expect(ftsoPriceAsRational(25n, -1)).toEqual({
      numerator: 250n,
      denominator: 1n,
    });
  });

  it('converts all denomination/settlement pairs deterministically', () => {
    expect(usdCentsToUsdt0BaseUnits(100n)).toBe(1_000_000n);
    expect(xrpUbaToUsdt0BaseUnits(400_000n, 2_500_000n, 6)).toBe(1_000_000n);
  });

  it('ceil-applies slippage without floating point', () => {
    expect(applySlippageCeil(101n, 150)).toBe(103n);
  });
});
