import {
  XrplValidationError,
  type ExpectedXrplPayment,
  type ValidatedXrplPayment,
} from './types.js';

const HASH_256 = /^[A-Fa-f0-9]{64}$/;
const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const CANONICAL_NONNEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const HASH_INSTRUCTION_MEMO = /^[A-Fa-f0-9]{84}$/;
const UINT32_MAX = 4_294_967_295;
const TF_PARTIAL_PAYMENT = 0x0002_0000;
const TF_FULLY_CANONICAL_SIG = 0x8000_0000;
const RIPPLE_EPOCH_UNIX_SECONDS = 946_684_800;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', `${label} must be an object`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', `${label} must be a string`);
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', `${label} must be an integer`);
  }
  return value;
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertAbsent(record: UnknownRecord, key: string): void {
  if (hasOwn(record, key)) {
    throw new XrplValidationError('PAYMENT_MISMATCH', `XRPL Payment must omit ${key}`);
  }
}

function normalizeExpectedMemo(memoHex: string, memoOpcode: 'E0' | 'FE'): string {
  const normalized = memoHex.startsWith('0x') ? memoHex.slice(2) : memoHex;
  if (
    !HASH_INSTRUCTION_MEMO.test(normalized) ||
    !normalized.toUpperCase().startsWith(memoOpcode)
  ) {
    throw new XrplValidationError(
      'INVALID_EXPECTATION',
      `Expected memo must be the exact 42-byte 0x${memoOpcode} instruction memo`,
    );
  }
  return normalized.toUpperCase();
}

function validateExpectation(expected: ExpectedXrplPayment): string {
  if (!HASH_256.test(expected.transactionHash)) {
    throw new XrplValidationError('INVALID_EXPECTATION', 'Invalid expected transaction hash');
  }
  if (!CLASSIC_ADDRESS.test(expected.payerAccount) || !CLASSIC_ADDRESS.test(expected.destination)) {
    throw new XrplValidationError(
      'INVALID_EXPECTATION',
      'Expected accounts must be classic r-addresses',
    );
  }
  if (!CANONICAL_POSITIVE_INTEGER.test(expected.amountDrops)) {
    throw new XrplValidationError(
      'INVALID_EXPECTATION',
      'Expected amount must be a canonical positive drops string',
    );
  }
  if (
    !Number.isSafeInteger(expected.lastLedgerSequence) ||
    expected.lastLedgerSequence < 1 ||
    expected.lastLedgerSequence > UINT32_MAX
  ) {
    throw new XrplValidationError(
      'INVALID_EXPECTATION',
      'Expected LastLedgerSequence must be an XRPL UInt32',
    );
  }
  if (
    expected.earliestCloseTimeMs !== undefined &&
    expected.latestCloseTimeMs !== undefined &&
    expected.earliestCloseTimeMs > expected.latestCloseTimeMs
  ) {
    throw new XrplValidationError('INVALID_EXPECTATION', 'Invalid close-time window');
  }
  return normalizeExpectedMemo(expected.memoHex, expected.memoOpcode ?? 'FE');
}

function unwrapResult(raw: unknown): UnknownRecord {
  const top = requireRecord(raw, 'XRPL response');
  return hasOwn(top, 'result') ? requireRecord(top.result, 'XRPL response.result') : top;
}

function extractTransaction(result: UnknownRecord): UnknownRecord {
  return hasOwn(result, 'tx_json')
    ? requireRecord(result.tx_json, 'XRPL response.result.tx_json')
    : result;
}

function extractMeta(result: UnknownRecord): UnknownRecord {
  return requireRecord(result.meta, 'XRPL transaction metadata');
}

function extractPaymentAmount(transaction: UnknownRecord): string {
  const hasAmount = hasOwn(transaction, 'Amount');
  const hasDeliverMax = hasOwn(transaction, 'DeliverMax');
  if (hasAmount === hasDeliverMax) {
    throw new XrplValidationError(
      'INVALID_PROVIDER_RESPONSE',
      'XRPL Payment must contain exactly one of Amount or DeliverMax',
    );
  }

  const amount = hasDeliverMax ? transaction.DeliverMax : transaction.Amount;
  const drops = requireString(amount, hasDeliverMax ? 'DeliverMax' : 'Amount');
  if (!CANONICAL_POSITIVE_INTEGER.test(drops)) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'XRPL Payment amount must be native XRP in canonical drops',
    );
  }
  return drops;
}

function extractDeliveredAmount(meta: UnknownRecord): string {
  const delivered = requireString(meta.delivered_amount, 'meta.delivered_amount');
  if (!CANONICAL_POSITIVE_INTEGER.test(delivered)) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'Delivered amount must be native XRP in canonical drops',
    );
  }
  return delivered;
}

function extractExactMemo(transaction: UnknownRecord): string {
  const memos = transaction.Memos;
  if (!Array.isArray(memos) || memos.length !== 1) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL Payment must contain exactly one memo');
  }

  const wrapper = requireRecord(memos[0], 'Memos[0]');
  if (Object.keys(wrapper).length !== 1 || !hasOwn(wrapper, 'Memo')) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL memo wrapper is not canonical');
  }
  const memo = requireRecord(wrapper.Memo, 'Memos[0].Memo');
  if (Object.keys(memo).length !== 1 || !hasOwn(memo, 'MemoData')) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL memo must contain only MemoData');
  }

  const memoData = requireString(memo.MemoData, 'MemoData');
  if (!HASH_INSTRUCTION_MEMO.test(memoData)) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL memo must be exactly 42 bytes');
  }
  return memoData.toUpperCase();
}

function extractCloseTime(result: UnknownRecord): { milliseconds: number; iso: string } {
  if (typeof result.close_time_iso === 'string') {
    const milliseconds = Date.parse(result.close_time_iso);
    if (!Number.isFinite(milliseconds)) {
      throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', 'Invalid close_time_iso');
    }
    return { milliseconds, iso: new Date(milliseconds).toISOString() };
  }

  const rippleSeconds = requireInteger(result.date, 'XRPL transaction date');
  if (rippleSeconds < 0) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', 'Invalid XRPL transaction date');
  }
  const milliseconds = (rippleSeconds + RIPPLE_EPOCH_UNIX_SECONDS) * 1_000;
  return { milliseconds, iso: new Date(milliseconds).toISOString() };
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new XrplValidationError('PAYMENT_MISMATCH', `${label} does not match the quote`);
  }
}

export function validateXrplPayment(
  raw: unknown,
  expected: ExpectedXrplPayment,
): ValidatedXrplPayment {
  const expectedMemo = validateExpectation(expected);
  const result = unwrapResult(raw);
  const transaction = extractTransaction(result);
  const meta = extractMeta(result);

  if (result.validated !== true) {
    throw new XrplValidationError('NOT_VALIDATED', 'XRPL transaction is not validated');
  }
  if (meta.TransactionResult !== 'tesSUCCESS') {
    throw new XrplValidationError(
      'TRANSACTION_FAILED',
      `XRPL transaction result is ${String(meta.TransactionResult)}`,
    );
  }

  const resultHash = requireString(result.hash ?? transaction.hash, 'XRPL transaction hash');
  if (!HASH_256.test(resultHash)) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', 'Invalid XRPL transaction hash');
  }
  assertEqual(
    resultHash.toUpperCase(),
    expected.transactionHash.toUpperCase(),
    'XRPL transaction hash',
  );

  assertEqual(transaction.TransactionType, 'Payment', 'TransactionType');
  assertEqual(transaction.Account, expected.payerAccount, 'XRPL payer Account');
  assertEqual(transaction.Destination, expected.destination, 'XRPL Destination');

  for (const prohibitedField of [
    'AccountTxnID',
    'CredentialIDs',
    'Delegate',
    'DestinationTag',
    'DomainID',
    'InvoiceID',
    'SendMax',
    'Paths',
    'DeliverMin',
    'NetworkID',
    'SourceTag',
    'TicketSequence',
  ]) {
    assertAbsent(transaction, prohibitedField);
  }

  const flags =
    transaction.Flags === undefined ? 0 : requireInteger(transaction.Flags, 'XRPL Payment Flags');
  if (flags < 0 || flags > UINT32_MAX) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', 'XRPL Payment Flags is not UInt32');
  }
  if ((flags & TF_PARTIAL_PAYMENT) !== 0) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'XRPL Payment must not enable tfPartialPayment',
    );
  }
  if (flags !== 0 && flags !== TF_FULLY_CANONICAL_SIG) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'XRPL Payment contains an unexpected transaction flag',
    );
  }

  const amountDrops = extractPaymentAmount(transaction);
  const deliveredAmountDrops = extractDeliveredAmount(meta);
  assertEqual(amountDrops, expected.amountDrops, 'XRPL Payment amount');
  assertEqual(deliveredAmountDrops, expected.amountDrops, 'XRPL delivered amount');

  const memoHex = extractExactMemo(transaction);
  assertEqual(memoHex, expectedMemo, 'XRPL custom-instruction memo');

  const lastLedgerSequence = requireInteger(transaction.LastLedgerSequence, 'LastLedgerSequence');
  if (lastLedgerSequence < 1 || lastLedgerSequence > UINT32_MAX) {
    throw new XrplValidationError(
      'INVALID_PROVIDER_RESPONSE',
      'LastLedgerSequence is not an XRPL UInt32',
    );
  }
  assertEqual(lastLedgerSequence, expected.lastLedgerSequence, 'LastLedgerSequence');

  const ledgerIndex = requireInteger(result.ledger_index, 'XRPL ledger_index');
  if (ledgerIndex < 1 || ledgerIndex > UINT32_MAX) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', 'XRPL ledger_index is not UInt32');
  }
  if (ledgerIndex > lastLedgerSequence) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'XRPL transaction validated after LastLedgerSequence',
    );
  }

  const closeTime = extractCloseTime(result);
  if (
    expected.earliestCloseTimeMs !== undefined &&
    closeTime.milliseconds < expected.earliestCloseTimeMs
  ) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL transaction closed too early');
  }
  if (
    expected.latestCloseTimeMs !== undefined &&
    closeTime.milliseconds > expected.latestCloseTimeMs
  ) {
    throw new XrplValidationError('PAYMENT_MISMATCH', 'XRPL transaction closed after quote expiry');
  }

  const sequence = requireInteger(transaction.Sequence, 'XRPL Payment Sequence');
  if (sequence < 1 || sequence > UINT32_MAX) {
    throw new XrplValidationError(
      'PAYMENT_MISMATCH',
      'XRPL Payment must use a positive account Sequence',
    );
  }
  const feeDrops = requireString(transaction.Fee, 'XRPL Payment Fee');
  if (!CANONICAL_NONNEGATIVE_INTEGER.test(feeDrops)) {
    throw new XrplValidationError(
      'INVALID_PROVIDER_RESPONSE',
      'XRPL Payment Fee must be canonical drops',
    );
  }

  return {
    transactionHash: resultHash.toUpperCase(),
    ledgerIndex,
    ledgerCloseTime: closeTime.iso,
    account: expected.payerAccount,
    destination: expected.destination,
    amountDrops,
    deliveredAmountDrops,
    memoHex,
    lastLedgerSequence,
    sequence,
    feeDrops,
  };
}
