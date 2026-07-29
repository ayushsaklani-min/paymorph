import { describe, expect, it } from 'vitest';
import { parseRecoveryXrplExpectation } from '../src/worker/recovery-request.js';

function snapshot() {
  return {
    version: 1,
    network: 'XRPL_TESTNET',
    desiredNetMintUBA: '1000000',
    coston2BlockNumber: '33296723',
    xamanRequest: {
      txjson: {
        TransactionType: 'Payment',
        Destination: 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV',
        Amount: '1200000',
        LastLedgerSequence: 90_000_075,
        Memos: [{ Memo: { MemoData: `E000${'00'.repeat(8)}${'AB'.repeat(32)}` } }],
      },
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
  };
}

describe('durable recovery request parsing', () => {
  it('recovers the exact XRPL validation expectation', () => {
    expect(parseRecoveryXrplExpectation(snapshot())).toEqual({
      destination: 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV',
      amountDrops: '1200000',
      memoHex: `E000${'00'.repeat(8)}${'AB'.repeat(32)}`,
      targetTransactionId: `0x${'AB'.repeat(32)}`,
      lastLedgerSequence: 90_000_075,
      desiredNetMintUBA: 1_000_000n,
    });
  });

  it('rejects added transaction fields and wrong memo opcodes', () => {
    const withTag = snapshot();
    Object.assign(withTag.xamanRequest.txjson, { DestinationTag: 1 });
    expect(() => parseRecoveryXrplExpectation(withTag)).toThrow(/unexpected fields/);

    const wrongMemo = snapshot();
    wrongMemo.xamanRequest.txjson.Memos[0]!.Memo.MemoData =
      `FE00${'00'.repeat(8)}${'AB'.repeat(32)}`;
    expect(() => parseRecoveryXrplExpectation(wrongMemo)).toThrow(/0xE0/);
  });
});
