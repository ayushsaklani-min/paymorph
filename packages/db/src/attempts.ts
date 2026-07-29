import type { AttemptStatus } from '@paymorph/shared';
import { assertTransition } from '@paymorph/shared';
import { Prisma } from '../generated/client/index.js';
import { db } from './index.js';

export interface SettlementEvidence {
  chainId: string;
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  payload: Prisma.InputJsonValue;
}

export async function transitionAttempt(input: {
  attemptId: string;
  expectedStatus: AttemptStatus;
  nextStatus: AttemptStatus;
  settlementEvidence?: SettlementEvidence;
}): Promise<void> {
  if (input.nextStatus === 'RECOVERED') {
    throw new Error(
      'RECOVERED requires the dedicated persisted-evidence recovery transition',
    );
  }
  assertTransition(input.expectedStatus, input.nextStatus);
  if (input.nextStatus === 'SETTLED' && !input.settlementEvidence) {
    throw new Error('PaymentSettled evidence is required for SETTLED');
  }

  await db.$transaction(
    async (transaction) => {
      const current = await transaction.paymentAttempt.findUnique({
        where: { id: input.attemptId },
      });
      if (!current) throw new Error('Payment attempt not found');
      if (current.status !== input.expectedStatus) {
        if (current.status === input.nextStatus) return;
        throw new Error(`Attempt status changed concurrently: ${current.status}`);
      }

      if (input.settlementEvidence) {
        await transaction.chainEvent.upsert({
          where: {
            chainId_txHash_logIndex: {
              chainId: input.settlementEvidence.chainId,
              txHash: input.settlementEvidence.txHash,
              logIndex: input.settlementEvidence.logIndex,
            },
          },
          update: {},
          create: {
            attemptId: input.attemptId,
            chain: 'EVM',
            chainId: input.settlementEvidence.chainId,
            txHash: input.settlementEvidence.txHash,
            logIndex: input.settlementEvidence.logIndex,
            blockNumber: input.settlementEvidence.blockNumber,
            eventName: 'PaymentSettled',
            payloadJson: input.settlementEvidence.payload,
          },
        });
      }

      await transaction.paymentAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: input.nextStatus,
          ...(input.nextStatus === 'SETTLED'
            ? {
                flareTxHash: input.settlementEvidence!.txHash,
                settledAt: new Date(),
              }
            : {}),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
