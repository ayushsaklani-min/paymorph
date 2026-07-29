import { describe, expect, it } from 'vitest';
import {
  directMintProtocolFeeUBA,
  solveDirectMintGrossAmount,
  type DirectMintFeeSettings,
} from '../src/amounts/direct-mint.js';

const CURRENT_COSTON2_SETTINGS: DirectMintFeeSettings = {
  feeBIPS: 25n,
  minimumFeeUBA: 100_000n,
  executorFeeUBA: 100_000n,
};

describe('direct-mint amount solver', () => {
  it('uses the minimum protocol fee for a small mint', () => {
    expect(solveDirectMintGrossAmount(1_000_000n, CURRENT_COSTON2_SETTINGS)).toEqual({
      grossPaymentUBA: 1_200_000n,
      protocolFeeUBA: 100_000n,
      executorFeeUBA: 100_000n,
      netMintedUBA: 1_000_000n,
    });
  });

  it('solves the proportional fee from gross rather than desired net', () => {
    const result = solveDirectMintGrossAmount(100_000_000n, CURRENT_COSTON2_SETTINGS);

    expect(result.protocolFeeUBA).toBe(
      (result.grossPaymentUBA * CURRENT_COSTON2_SETTINGS.feeBIPS) / 10_000n,
    );
    expect(result.netMintedUBA).toBeGreaterThanOrEqual(100_000_000n);
    expect(
      result.grossPaymentUBA -
        1n -
        directMintProtocolFeeUBA(result.grossPaymentUBA - 1n, CURRENT_COSTON2_SETTINGS) -
        CURRENT_COSTON2_SETTINGS.executorFeeUBA,
    ).toBeLessThan(100_000_000n);
  });

  it('keeps the solution minimal across representative bigint values', () => {
    const desiredAmounts = [0n, 1n, 99_999n, 100_000n, 1_000_001n, 10n ** 12n];

    for (const desiredNetMintUBA of desiredAmounts) {
      const result = solveDirectMintGrossAmount(desiredNetMintUBA, CURRENT_COSTON2_SETTINGS);
      expect(result.netMintedUBA).toBeGreaterThanOrEqual(desiredNetMintUBA);
      if (result.grossPaymentUBA > 0n) {
        const previousGross = result.grossPaymentUBA - 1n;
        const previousNet =
          previousGross -
          directMintProtocolFeeUBA(previousGross, CURRENT_COSTON2_SETTINGS) -
          CURRENT_COSTON2_SETTINGS.executorFeeUBA;
        expect(previousNet).toBeLessThan(desiredNetMintUBA);
      }
    }
  });

  it('caps the protocol fee at the gross payment', () => {
    expect(
      directMintProtocolFeeUBA(50_000n, {
        feeBIPS: 25n,
        minimumFeeUBA: 100_000n,
      }),
    ).toBe(50_000n);
  });

  it('returns zero when a zero payment satisfies a zero-fee request', () => {
    expect(
      solveDirectMintGrossAmount(0n, {
        feeBIPS: 0n,
        minimumFeeUBA: 0n,
        executorFeeUBA: 0n,
      }),
    ).toEqual({
      grossPaymentUBA: 0n,
      protocolFeeUBA: 0n,
      executorFeeUBA: 0n,
      netMintedUBA: 0n,
    });
  });

  it('rejects impossible or out-of-range settings', () => {
    expect(() =>
      solveDirectMintGrossAmount(1n, {
        feeBIPS: 10_000n,
        minimumFeeUBA: 0n,
        executorFeeUBA: 0n,
      }),
    ).toThrow(/100%/);
    expect(() =>
      solveDirectMintGrossAmount(1n, {
        feeBIPS: 10_001n,
        minimumFeeUBA: 0n,
        executorFeeUBA: 0n,
      }),
    ).toThrow(/feeBIPS/);
    expect(() =>
      solveDirectMintGrossAmount(-1n, {
        feeBIPS: 25n,
        minimumFeeUBA: 0n,
        executorFeeUBA: 0n,
      }),
    ).toThrow(/unsigned 64-bit/);
  });
});
