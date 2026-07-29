import { describe, expect, it } from 'vitest';
import { XrplTestnetTransactionReader } from '../src/adapters/xrpl/client.js';
import type { ExpectedXrplPayment } from '../src/adapters/xrpl/types.js';
import { validateXrplPayment } from '../src/adapters/xrpl/validator.js';

const HASH = 'A'.repeat(64);
const ACCOUNT = 'rMmTCjGFRWPz8S2zAUUoNVSQHxtRQD4eCx';
const DESTINATION = 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV';
const MEMO_HEX = `FE00${'00'.repeat(8)}${'11'.repeat(32)}`;
const LAST_LEDGER = 90_000_123;

const expected: ExpectedXrplPayment = {
  transactionHash: HASH,
  payerAccount: ACCOUNT,
  destination: DESTINATION,
  amountDrops: '1000001',
  memoHex: MEMO_HEX,
  lastLedgerSequence: LAST_LEDGER,
};

function paymentFields(amountField: 'Amount' | 'DeliverMax') {
  return {
    TransactionType: 'Payment',
    Account: ACCOUNT,
    Destination: DESTINATION,
    [amountField]: '1000001',
    LastLedgerSequence: LAST_LEDGER,
    Sequence: 44,
    Fee: '12',
    Flags: 2_147_483_648,
    Memos: [{ Memo: { MemoData: MEMO_HEX } }],
  };
}

describe('XRPL Payment validation', () => {
  it('validates an exact official 0xE0 recovery payment when explicitly expected', () => {
    const recoveryMemo = `E000${'00'.repeat(8)}${'AB'.repeat(32)}`;
    const recoveryExpected: ExpectedXrplPayment = {
      ...expected,
      memoHex: recoveryMemo,
      memoOpcode: 'E0',
    };
    const fields = paymentFields('DeliverMax');
    const payment = validateXrplPayment(
      {
        result: {
          validated: true,
          hash: HASH,
          ledger_index: 90_000_120,
          close_time_iso: '2026-07-27T00:00:00Z',
          tx_json: {
            ...fields,
            Memos: [{ Memo: { MemoData: recoveryMemo } }],
          },
          meta: {
            TransactionResult: 'tesSUCCESS',
            delivered_amount: '1000001',
          },
        },
      },
      recoveryExpected,
    );

    expect(payment.memoHex).toBe(recoveryMemo);
  });

  it('accepts the official API v2 tx_json + DeliverMax response shape', () => {
    const payment = validateXrplPayment(
      {
        result: {
          validated: true,
          hash: HASH,
          ledger_index: 90_000_120,
          close_time_iso: '2026-07-27T00:00:00Z',
          tx_json: paymentFields('DeliverMax'),
          meta: {
            TransactionResult: 'tesSUCCESS',
            delivered_amount: '1000001',
          },
        },
      },
      expected,
    );

    expect(payment).toMatchObject({
      transactionHash: HASH,
      amountDrops: '1000001',
      deliveredAmountDrops: '1000001',
      memoHex: MEMO_HEX,
      ledgerCloseTime: '2026-07-27T00:00:00.000Z',
    });
  });

  it('accepts the API v1 flat transaction + Amount response shape', () => {
    const payment = validateXrplPayment(
      {
        result: {
          ...paymentFields('Amount'),
          validated: true,
          hash: HASH,
          ledger_index: 90_000_120,
          date: 838_166_400,
          meta: {
            TransactionResult: 'tesSUCCESS',
            delivered_amount: '1000001',
          },
        },
      },
      expected,
    );

    expect(payment.account).toBe(ACCOUNT);
    expect(payment.lastLedgerSequence).toBe(LAST_LEDGER);
  });

  it('rejects unvalidated, failed, and under-delivered transactions', () => {
    const base = {
      validated: true,
      hash: HASH,
      ledger_index: 90_000_120,
      close_time_iso: '2026-07-27T00:00:00Z',
      tx_json: paymentFields('DeliverMax'),
      meta: {
        TransactionResult: 'tesSUCCESS',
        delivered_amount: '1000001',
      },
    };

    expect(() => validateXrplPayment({ ...base, validated: false }, expected)).toThrow(
      /not validated/,
    );
    expect(() =>
      validateXrplPayment(
        { ...base, meta: { ...base.meta, TransactionResult: 'tecUNFUNDED_PAYMENT' } },
        expected,
      ),
    ).toThrow(/tecUNFUNDED_PAYMENT/);
    expect(() =>
      validateXrplPayment(
        { ...base, meta: { ...base.meta, delivered_amount: '1000000' } },
        expected,
      ),
    ).toThrow(/delivered amount/);
  });

  it('rejects partial-payment flags, destination tags, and extra memos', () => {
    const makeResponse = (tx: Record<string, unknown>) => ({
      validated: true,
      hash: HASH,
      ledger_index: 90_000_120,
      close_time_iso: '2026-07-27T00:00:00Z',
      tx_json: tx,
      meta: {
        TransactionResult: 'tesSUCCESS',
        delivered_amount: '1000001',
      },
    });
    const valid = paymentFields('DeliverMax');

    expect(() =>
      validateXrplPayment(makeResponse({ ...valid, Flags: 0x8002_0000 }), expected),
    ).toThrow(/tfPartialPayment/);
    expect(() =>
      validateXrplPayment(makeResponse({ ...valid, DestinationTag: 1 }), expected),
    ).toThrow(/DestinationTag/);
    expect(() =>
      validateXrplPayment(
        makeResponse({
          ...valid,
          Memos: [...valid.Memos, { Memo: { MemoData: '00' } }],
        }),
        expected,
      ),
    ).toThrow(/exactly one memo/);
  });

  it('rejects both Amount aliases appearing together', () => {
    const transaction = {
      ...paymentFields('DeliverMax'),
      Amount: '1000001',
    };

    expect(() =>
      validateXrplPayment(
        {
          validated: true,
          hash: HASH,
          ledger_index: 90_000_120,
          close_time_iso: '2026-07-27T00:00:00Z',
          tx_json: transaction,
          meta: {
            TransactionResult: 'tesSUCCESS',
            delivered_amount: '1000001',
          },
        },
        expected,
      ),
    ).toThrow(/exactly one of Amount or DeliverMax/);
  });
});

describe('XRPL Testnet reader', () => {
  it('requests API v2 JSON transaction data from the injected official client boundary', async () => {
    let connected = false;
    let request: unknown;
    const response = { result: { validated: false } };
    const reader = new XrplTestnetTransactionReader({
      isConnected: () => connected,
      connect: () => {
        connected = true;
        return Promise.resolve();
      },
      disconnect: () => {
        connected = false;
        return Promise.resolve();
      },
      request: (value) => {
        request = value;
        return Promise.resolve(response);
      },
    });

    await expect(reader.getTransaction(HASH)).resolves.toBe(response);
    expect(request).toEqual({
      command: 'tx',
      transaction: HASH,
      binary: false,
      api_version: 2,
    });

    await reader.close();
    expect(connected).toBe(false);
  });
});
