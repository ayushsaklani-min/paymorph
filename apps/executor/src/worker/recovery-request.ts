export interface RecoveryXrplExpectation {
  readonly destination: string;
  readonly amountDrops: string;
  readonly memoHex: string;
  readonly targetTransactionId: `0x${string}`;
  readonly lastLedgerSequence: number;
  readonly desiredNetMintUBA: bigint;
}

export function parseRecoveryXrplExpectation(value: unknown): RecoveryXrplExpectation {
  const snapshot = requireRecord(value, 'Recovery request snapshot');
  requireExactKeys(snapshot, [
    'version',
    'network',
    'desiredNetMintUBA',
    'coston2BlockNumber',
    'xamanRequest',
  ]);
  if (snapshot.version !== 1 || snapshot.network !== 'XRPL_TESTNET') {
    throw new TypeError('Recovery request snapshot version or network is invalid');
  }
  const desiredNetMintUBA = BigInt(
    requireString(snapshot.desiredNetMintUBA, 'Recovery desiredNetMintUBA'),
  );
  if (desiredNetMintUBA <= 0n) {
    throw new TypeError('Recovery desired net mint must be positive');
  }

  const request = requireRecord(snapshot.xamanRequest, 'Recovery Xaman request');
  requireExactKeys(request, ['txjson', 'options', 'custom_meta']);
  const transaction = requireRecord(request.txjson, 'Recovery XRPL transaction');
  requireExactKeys(transaction, [
    'TransactionType',
    'Destination',
    'Amount',
    'LastLedgerSequence',
    'Memos',
  ]);
  if (transaction.TransactionType !== 'Payment') {
    throw new TypeError('Recovery transaction must be a Payment');
  }
  const destination = requireString(transaction.Destination, 'Recovery Destination');
  const amountDrops = requireString(transaction.Amount, 'Recovery Amount');
  if (!/^[1-9][0-9]*$/.test(amountDrops)) {
    throw new TypeError('Recovery Amount must be canonical positive drops');
  }
  if (
    typeof transaction.LastLedgerSequence !== 'number' ||
    !Number.isSafeInteger(transaction.LastLedgerSequence) ||
    transaction.LastLedgerSequence < 1 ||
    transaction.LastLedgerSequence > 4_294_967_295
  ) {
    throw new TypeError('Recovery LastLedgerSequence must be UInt32');
  }

  if (!Array.isArray(transaction.Memos) || transaction.Memos.length !== 1) {
    throw new TypeError('Recovery transaction must contain one memo');
  }
  const wrapper = requireRecord(transaction.Memos[0], 'Recovery memo wrapper');
  requireExactKeys(wrapper, ['Memo']);
  const memo = requireRecord(wrapper.Memo, 'Recovery memo');
  requireExactKeys(memo, ['MemoData']);
  const memoHex = requireString(memo.MemoData, 'Recovery MemoData').toUpperCase();
  if (!/^E0[A-F0-9]{82}$/.test(memoHex)) {
    throw new TypeError('Recovery memo must be the exact 42-byte 0xE0 memo');
  }

  const options = requireRecord(request.options, 'Recovery Xaman options');
  if (options.submit !== true || options.force_network !== 'TESTNET') {
    throw new TypeError('Recovery Xaman request must submit on TESTNET');
  }

  return {
    destination,
    amountDrops,
    memoHex,
    targetTransactionId: `0x${memoHex.slice(-64)}`,
    lastLedgerSequence: transaction.LastLedgerSequence,
    desiredNetMintUBA,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new TypeError('Persisted recovery request contains unexpected fields');
  }
}
