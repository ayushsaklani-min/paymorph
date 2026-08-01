import { describe, expect, it } from 'vitest';
import { calculateQuote } from '../src/domain/quote.js';

const directMintSettings = {
  feeBIPS: 25n,
  minimumFeeUBA: 100_000n,
  executorFeeUBA: 100_000n,
};

describe('quote calculation', () => {
  it('calculates XRP-denominated FXRP settlement and protocol gross-up', () => {
    const quote = calculateQuote({
      denomination: 'XRP',
      settlementAsset: 'FXRP',
      invoiceBaseUnits: 1_000_000n,
      serviceFeeBps: 50,
      slippageBps: 150,
      xrpUsdValue: 2_500_000n,
      xrpUsdDecimals: 6,
      directMintSettings,
    });
    expect(quote.invoiceOutBaseUnits).toBe(1_000_000n);
    expect(quote.serviceFeeOutBaseUnits).toBe(5_000n);
    expect(quote.maxFxrpInputUBA).toBe(1_005_000n);
    expect(quote.xrplPaymentDrops).toBeGreaterThan(quote.maxFxrpInputUBA);
    expect(quote.route).toBe('DIRECT_FXRP');
  });

  it('calculates USD-denominated FXRP settlement', () => {
    const quote = calculateQuote({
      denomination: 'USD',
      settlementAsset: 'FXRP',
      invoiceBaseUnits: 100n,
      serviceFeeBps: 50,
      slippageBps: 150,
      xrpUsdValue: 2_500_000n,
      xrpUsdDecimals: 6,
      directMintSettings,
    });
    expect(quote.invoiceOutBaseUnits).toBe(400_000n);
    expect(quote.serviceFeeOutBaseUnits).toBe(2_000n);
  });

  it('refuses USDT0 without a real route quote', () => {
    expect(() =>
      calculateQuote({
        denomination: 'USD',
        settlementAsset: 'USDT0',
        invoiceBaseUnits: 100n,
        serviceFeeBps: 50,
        slippageBps: 150,
        xrpUsdValue: 2_500_000n,
        xrpUsdDecimals: 6,
        directMintSettings,
      }),
    ).toThrow(/real exact-output/);
  });

  it('uses a simulated exact-output FXRP input and ceil-bounds it for USDT0', () => {
    const quote = calculateQuote({
      denomination: 'USD',
      settlementAsset: 'USDT0',
      invoiceBaseUnits: 100n,
      serviceFeeBps: 50,
      slippageBps: 150,
      xrpUsdValue: 2_500_000n,
      xrpUsdDecimals: 6,
      directMintSettings,
      exactOutputFxrpQuoteUBA: 600_000n,
    });

    expect(quote.invoiceOutBaseUnits).toBe(1_000_000n);
    expect(quote.serviceFeeOutBaseUnits).toBe(5_000n);
    expect(quote.maxFxrpInputUBA).toBe(609_000n);
    expect(quote.xrplPaymentDrops).toBeGreaterThan(quote.maxFxrpInputUBA);
    expect(quote.route).toBe('EXACT_OUTPUT_V3');
  });
});
