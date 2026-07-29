import { describe, expect, it } from 'vitest';
import { keccak256 } from 'viem';
import {
  buildFxrpSettlementCalls,
  encodeSkipMemo,
  encodeSmartAccountOperation,
} from '../src/smart-account/encoder.js';

const personalAccount = '0x1111111111111111111111111111111111111111';
const fxrpAddress = '0x2222222222222222222222222222222222222222';
const routerAddress = '0x3333333333333333333333333333333333333333';
const paymentId = `0x${'44'.repeat(32)}` as const;

describe('Flare Smart Account encoding', () => {
  it('encodes the official nine-field PackedUserOperation and 42-byte 0xFE memo', () => {
    const calls = buildFxrpSettlementCalls({
      fxrpAddress,
      routerAddress,
      paymentId,
      invoiceFxrpAmount: 1_000_000n,
      recipients: [
        { account: '0x5555555555555555555555555555555555555555', bps: 8_500 },
        { account: '0x6666666666666666666666666666666666666666', bps: 1_500 },
      ],
      feeBps: 50,
      deadline: 2_000_000_000n,
      personalAccount,
    });
    const encoded = encodeSmartAccountOperation({
      calls,
      sender: personalAccount,
      nonce: 7n,
      walletId: 0,
      executorFeeUBA: 100_000n,
    });

    expect(encoded.memoHex).toHaveLength(2 + 42 * 2);
    expect(encoded.memoHex.slice(0, 4)).toBe('0xFE');
    expect(encoded.memoHex.slice(-64)).toBe(keccak256(encoded.packedUserOpData).slice(2));
    expect(encoded.totalCallValue).toBe(0n);
    expect(encoded.calls).toHaveLength(2);
  });

  it('encodes the official 42-byte 0xE0 recovery memo', () => {
    const memo = encodeSkipMemo({
      originalXrplTransactionId: `0x${'ab'.repeat(32)}`,
      walletId: 0,
      executorFeeUBA: 100_000n,
    });
    expect(memo).toHaveLength(2 + 42 * 2);
    expect(memo.slice(0, 4)).toBe('0xE0');
    expect(memo.slice(-64)).toBe('ab'.repeat(32));
  });
});
