import { describe, expect, it } from 'vitest';
import { paymentResolutionGuidance } from '../src/features/checkout/payment-reconciliation.js';

describe('payment reconciliation guidance', () => {
  it('keeps an unexpected provider response in safe confirmation rather than showing it as final', () => {
    expect(
      paymentResolutionGuidance({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      }),
    ).toEqual({
      retryable: true,
      message: 'We received your Xaman update. Safely confirming the signed payment…',
    });
  });

  it('shows actual terminal payment failures clearly', () => {
    expect(
      paymentResolutionGuidance({
        code: 'XAMAN_REJECTED',
        message: 'Payment was signed by a different XRP account',
      }),
    ).toEqual({
      retryable: false,
      message: 'Payment was signed by a different XRP account',
    });
  });

  it('safely retries when no structured error response is available', () => {
    expect(paymentResolutionGuidance(null)).toMatchObject({ retryable: true });
  });
});
