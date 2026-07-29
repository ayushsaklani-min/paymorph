export const XRPL_TESTNET_WEBSOCKET_URL = 'wss://s.altnet.rippletest.net:51233' as const;

export interface ExpectedXrplPayment {
  transactionHash: string;
  payerAccount: string;
  destination: string;
  amountDrops: string;
  memoHex: string;
  memoOpcode?: 'E0' | 'FE';
  lastLedgerSequence: number;
  earliestCloseTimeMs?: number;
  latestCloseTimeMs?: number;
}

export interface ValidatedXrplPayment {
  transactionHash: string;
  ledgerIndex: number;
  ledgerCloseTime: string;
  account: string;
  destination: string;
  amountDrops: string;
  deliveredAmountDrops: string;
  memoHex: string;
  lastLedgerSequence: number;
  sequence: number;
  feeDrops: string;
}

export class XrplValidationError extends Error {
  readonly code:
    | 'INVALID_EXPECTATION'
    | 'INVALID_PROVIDER_RESPONSE'
    | 'NOT_VALIDATED'
    | 'TRANSACTION_FAILED'
    | 'PAYMENT_MISMATCH';

  constructor(code: XrplValidationError['code'], message: string) {
    super(message);
    this.name = 'XrplValidationError';
    this.code = code;
  }
}
