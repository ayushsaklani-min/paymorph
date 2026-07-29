export const PAYMORPH_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVOICE_NOT_ACTIVE',
  'PAYER_NOT_IDENTIFIED',
  'WRONG_XRPL_NETWORK',
  'QUOTE_ROUTE_UNAVAILABLE',
  'QUOTE_EXPIRED',
  'NONCE_CHANGED',
  'XAMAN_REJECTED',
  'XRPL_VALIDATION_MISMATCH',
  'FDC_NOT_READY',
  'FLARE_SIMULATION_FAILED',
  'SETTLEMENT_REVERTED',
  'RECOVERY_NOT_ELIGIBLE',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type PayMorphErrorCode = (typeof PAYMORPH_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: PayMorphErrorCode;
  readonly details?: unknown;

  constructor(code: PayMorphErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
