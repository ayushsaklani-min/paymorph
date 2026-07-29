import { describe, expect, it } from 'vitest';
import {
  assertAuthoritativeRecoveryRequest,
  parseRecoveryRequestSnapshot,
} from '../src/lib/server/recovery/notification.js';
import { buildRecoveryTransactionPlan } from '../src/lib/server/recovery/plan.js';
import { buildXamanRecoveryPayload } from '../src/lib/server/xaman/payloads.js';
import type { XamanAuthoritativePayload } from '../src/lib/server/xaman/types.js';

const DESTINATION = 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV';
const ORIGINAL_TRANSACTION_ID = 'AB'.repeat(32);

describe('official 0xE0 recovery request', () => {
  it('computes a positive one-XRP net mint and exact 42-byte target memo', () => {
    const plan = buildRecoveryTransactionPlan({
      originalXrplTransactionId: ORIGINAL_TRANSACTION_ID,
      destination: DESTINATION,
      directMintSettings: {
        feeBIPS: 25n,
        minimumFeeUBA: 100_000n,
        executorFeeUBA: 100_000n,
      },
      currentLedgerIndex: 90_000_000,
    });

    expect(plan).toEqual({
      destination: DESTINATION,
      amountDrops: '1200000',
      desiredNetMintUBA: '1000000',
      memoHex: `0xE00000000000000186a0${'AB'.repeat(32)}`,
      lastLedgerSequence: 90_000_075,
    });
    expect(plan.memoHex).toHaveLength(2 + 42 * 2);
  });

  it('builds a forced-Testnet Payment with no unsafe mutable fields', () => {
    const plan = buildRecoveryTransactionPlan({
      originalXrplTransactionId: ORIGINAL_TRANSACTION_ID,
      destination: DESTINATION,
      directMintSettings: {
        feeBIPS: 25n,
        minimumFeeUBA: 100_000n,
        executorFeeUBA: 100_000n,
      },
      currentLedgerIndex: 90_000_000,
    });
    const payload = buildXamanRecoveryPayload({
      attemptId: 'attempt-1',
      destination: plan.destination,
      amountDrops: plan.amountDrops,
      memoHex: plan.memoHex,
      lastLedgerSequence: plan.lastLedgerSequence,
      returnUrl: 'https://paymorph.example/pay/invoice/status/attempt-1',
    });

    expect(payload.txjson).toEqual({
      TransactionType: 'Payment',
      Destination: DESTINATION,
      Amount: '1200000',
      LastLedgerSequence: 90_000_075,
      Memos: [{ Memo: { MemoData: `E00000000000000186A0${'AB'.repeat(32)}` } }],
    });
    expect(payload.options).toMatchObject({
      submit: true,
      force_network: 'TESTNET',
      expire: 5,
    });
    expect(payload.custom_meta.identifier).toBe('recovery:attempt-1');
    expect(payload.txjson).not.toHaveProperty('Account');
    expect(payload.txjson).not.toHaveProperty('DestinationTag');
    expect(payload.txjson).not.toHaveProperty('NetworkID');
  });

  it('fails closed when fees cannot produce a positive recovery mint', () => {
    expect(() =>
      buildRecoveryTransactionPlan({
        originalXrplTransactionId: ORIGINAL_TRANSACTION_ID,
        destination: DESTINATION,
        directMintSettings: {
          feeBIPS: 10_000n,
          minimumFeeUBA: 0n,
          executorFeeUBA: 0n,
        },
        currentLedgerIndex: 90_000_000,
      }),
    ).toThrow(/positive net mint/);
  });

  it('matches authoritative Xaman fields to the durable request snapshot', () => {
    const transaction = {
      TransactionType: 'Payment' as const,
      Destination: DESTINATION,
      Amount: '1200000',
      LastLedgerSequence: 90_000_075,
      Memos: [{ Memo: { MemoData: `E000${'00'.repeat(8)}${'AB'.repeat(32)}` } }],
    };
    const snapshot = parseRecoveryRequestSnapshot({
      version: 1,
      network: 'XRPL_TESTNET',
      desiredNetMintUBA: '1000000',
      coston2BlockNumber: '33296723',
      xamanRequest: {
        txjson: transaction,
        options: {
          submit: true,
          force_network: 'TESTNET',
          expire: 5,
          return_url: {
            app: 'https://paymorph.example/status',
            web: 'https://paymorph.example/status',
          },
        },
        custom_meta: {
          identifier: 'recovery:attempt-1',
          instruction: 'Recovery',
        },
      },
    });
    const authoritative = authoritativeRecovery(transaction);

    expect(() =>
      assertAuthoritativeRecoveryRequest(authoritative, snapshot, 'attempt-1'),
    ).not.toThrow();
    expect(() =>
      assertAuthoritativeRecoveryRequest(
        {
          ...authoritative,
          request: { ...transaction, Amount: '1200001' },
        },
        snapshot,
        'attempt-1',
      ),
    ).toThrow(/differs/);
    expect(() =>
      assertAuthoritativeRecoveryRequest(
        {
          ...authoritative,
          request: { ...transaction, DestinationTag: 1 },
        },
        snapshot,
        'attempt-1',
      ),
    ).toThrow(/unexpected fields/);
  });
});

function authoritativeRecovery(
  request: Readonly<Record<string, unknown>>,
): XamanAuthoritativePayload {
  return {
    uuid: '22222222-2222-4222-8222-222222222222',
    applicationId: '11111111-1111-4111-8111-111111111111',
    kind: 'PAYMENT',
    customIdentifier: 'recovery:attempt-1',
    request,
    resolved: true,
    signed: true,
    cancelled: false,
    expired: false,
    forceNetwork: 'TESTNET',
    account: 'rMmTCjGFRWPz8S2zAUUoNVSQHxtRQD4eCx',
    signedBlob: 'DEADBEEF',
    transactionHash: 'A'.repeat(64),
    environmentNodeType: 'TESTNET',
    environmentNetworkId: 1,
    dispatchedNodeType: 'TESTNET',
    dispatchedResult: 'tesSUCCESS',
    issuedUserToken: null,
  };
}
