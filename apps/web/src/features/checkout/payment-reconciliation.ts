export interface PaymentResolutionError {
  readonly code: string;
  readonly message: string;
}

export const PAYMENT_RESOLUTION_RETRY_MS = 4_000;

const TERMINAL_PAYMENT_RESOLUTION_CODES = new Set([
  'FORBIDDEN',
  'PAYER_NOT_IDENTIFIED',
  'QUOTE_EXPIRED',
  'VALIDATION_ERROR',
  'XAMAN_REJECTED',
]);

export function paymentResolutionGuidance(error: PaymentResolutionError | null): {
  readonly retryable: boolean;
  readonly message: string;
} {
  if (error !== null && TERMINAL_PAYMENT_RESOLUTION_CODES.has(error.code)) {
    return { retryable: false, message: error.message };
  }

  return {
    retryable: true,
    message: 'We received your Xaman update. Safely confirming the signed payment…',
  };
}
