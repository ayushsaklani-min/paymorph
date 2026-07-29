export const ATTEMPT_STATUSES = [
  'CREATED',
  'IDENTIFYING',
  'IDENTIFIED',
  'QUOTED',
  'XAMAN_CREATED',
  'AWAITING_SIGNATURE',
  'XRPL_SIGNED',
  'XRPL_VALIDATED',
  'USEROP_UPLOADED',
  'FDC_REQUESTED',
  'FDC_READY',
  'FLARE_SUBMITTED',
  'FLARE_CONFIRMED',
  'SETTLED',
  'REJECTED',
  'QUOTE_EXPIRED',
  'XRPL_FAILED',
  'EXECUTION_REVERTED',
  'RECOVERY_REQUIRED',
  'RECOVERED',
  'CANCELLED',
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

const transitions: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
  CREATED: ['IDENTIFYING', 'CANCELLED'],
  IDENTIFYING: ['IDENTIFIED', 'REJECTED', 'CANCELLED'],
  IDENTIFIED: ['QUOTED', 'CANCELLED'],
  QUOTED: ['XAMAN_CREATED', 'QUOTE_EXPIRED', 'CANCELLED'],
  XAMAN_CREATED: ['AWAITING_SIGNATURE', 'REJECTED', 'QUOTE_EXPIRED'],
  AWAITING_SIGNATURE: ['XRPL_SIGNED', 'REJECTED', 'QUOTE_EXPIRED'],
  XRPL_SIGNED: ['XRPL_VALIDATED', 'XRPL_FAILED'],
  XRPL_VALIDATED: ['USEROP_UPLOADED', 'FDC_REQUESTED', 'RECOVERY_REQUIRED'],
  USEROP_UPLOADED: ['FDC_REQUESTED', 'RECOVERY_REQUIRED'],
  FDC_REQUESTED: ['FDC_READY', 'RECOVERY_REQUIRED'],
  FDC_READY: ['FLARE_SUBMITTED', 'EXECUTION_REVERTED', 'RECOVERY_REQUIRED'],
  FLARE_SUBMITTED: ['FLARE_CONFIRMED', 'EXECUTION_REVERTED', 'RECOVERY_REQUIRED'],
  FLARE_CONFIRMED: ['SETTLED', 'EXECUTION_REVERTED', 'RECOVERY_REQUIRED'],
  SETTLED: [],
  REJECTED: [],
  QUOTE_EXPIRED: [],
  XRPL_FAILED: [],
  EXECUTION_REVERTED: ['RECOVERY_REQUIRED'],
  RECOVERY_REQUIRED: ['RECOVERED'],
  RECOVERED: [],
  CANCELLED: [],
};

export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: AttemptStatus, to: AttemptStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid payment-attempt transition: ${from} -> ${to}`);
  }
}

export function isTerminalStatus(status: AttemptStatus): boolean {
  return transitions[status].length === 0;
}
