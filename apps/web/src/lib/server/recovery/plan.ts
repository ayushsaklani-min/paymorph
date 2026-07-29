import {
  assertPositiveRecoveryNetMint,
  encodeSkipMemo,
  solveDirectMintGrossAmount,
  type DirectMintFeeSettings,
} from '@paymorph/shared';
import type { Hex } from 'viem';

const RECOVERY_NET_MINT_UBA = 1_000_000n;
const RECOVERY_LEDGER_WINDOW = 75;
const UINT32_MAX = 4_294_967_295;

export interface RecoveryTransactionPlan {
  readonly destination: string;
  readonly amountDrops: string;
  readonly desiredNetMintUBA: string;
  readonly memoHex: Hex;
  readonly lastLedgerSequence: number;
}

export function buildRecoveryTransactionPlan(input: {
  readonly originalXrplTransactionId: string;
  readonly destination: string;
  readonly directMintSettings: DirectMintFeeSettings;
  readonly currentLedgerIndex: number;
}): RecoveryTransactionPlan {
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(input.originalXrplTransactionId)) {
    throw new TypeError('Original XRPL transaction ID must be exactly 32 bytes');
  }
  if (!Number.isSafeInteger(input.currentLedgerIndex) || input.currentLedgerIndex <= 0) {
    throw new RangeError('Current XRPL ledger index must be a positive integer');
  }

  const lastLedgerSequence = input.currentLedgerIndex + RECOVERY_LEDGER_WINDOW;
  if (lastLedgerSequence > UINT32_MAX) {
    throw new RangeError('Recovery LastLedgerSequence exceeds XRPL UInt32');
  }
  const amount = solveDirectMintGrossAmount(RECOVERY_NET_MINT_UBA, input.directMintSettings);
  assertPositiveRecoveryNetMint(amount.netMintedUBA);

  const normalizedTransactionId = (
    input.originalXrplTransactionId.startsWith('0x')
      ? input.originalXrplTransactionId
      : `0x${input.originalXrplTransactionId}`
  ) as Hex;
  return {
    destination: input.destination,
    amountDrops: amount.grossPaymentUBA.toString(10),
    desiredNetMintUBA: RECOVERY_NET_MINT_UBA.toString(10),
    memoHex: encodeSkipMemo({
      originalXrplTransactionId: normalizedTransactionId,
      walletId: 0,
      executorFeeUBA: input.directMintSettings.executorFeeUBA,
    }),
    lastLedgerSequence,
  };
}
