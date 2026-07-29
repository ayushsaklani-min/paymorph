import { Prisma, type ExecutorNonceReservation } from '../generated/client/index.js';
import { db } from './index.js';

const MAX_RESERVATION_RETRIES = 5;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAIN_ID = /^(0|[1-9]\d*)$/;

export interface ReserveExecutorNonceInput {
  readonly attemptId: string;
  readonly generation: number;
  readonly chainId: string;
  readonly executorAddress: string;
  readonly pendingNonce: bigint;
}

export async function reserveExecutorNonce(
  input: ReserveExecutorNonceInput,
): Promise<ExecutorNonceReservation> {
  validateInput(input);
  for (let retry = 0; retry < MAX_RESERVATION_RETRIES; retry += 1) {
    try {
      return await db.$transaction(
        async (transaction) => {
          const existing = await transaction.executorNonceReservation.findUnique({
            where: {
              attemptId_generation: {
                attemptId: input.attemptId,
                generation: input.generation,
              },
            },
          });
          if (existing) {
            if (
              existing.chainId !== input.chainId ||
              existing.executorAddress !== input.executorAddress
            ) {
              throw new Error('Attempt nonce reservation belongs to another chain or executor');
            }
            return existing;
          }
          const highest = await transaction.executorNonceReservation.aggregate({
            where: {
              chainId: input.chainId,
              executorAddress: input.executorAddress,
            },
            _max: { nonce: true },
          });
          const nonce = selectExecutorNonce(input.pendingNonce, highest._max.nonce);
          return transaction.executorNonceReservation.create({
            data: {
              attemptId: input.attemptId,
              generation: input.generation,
              chainId: input.chainId,
              executorAddress: input.executorAddress,
              nonce,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (retry + 1 < MAX_RESERVATION_RETRIES && isReservationConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Unable to reserve executor nonce');
}

export function selectExecutorNonce(
  pendingNonce: bigint,
  highestReservedNonce: bigint | null,
): bigint {
  if (pendingNonce < 0n) throw new RangeError('Pending executor nonce cannot be negative');
  if (highestReservedNonce !== null && highestReservedNonce < 0n) {
    throw new RangeError('Reserved executor nonce cannot be negative');
  }
  const afterReservation = highestReservedNonce === null ? 0n : highestReservedNonce + 1n;
  return pendingNonce > afterReservation ? pendingNonce : afterReservation;
}

function validateInput(input: ReserveExecutorNonceInput): void {
  if (!input.attemptId) throw new TypeError('Attempt ID is required');
  if (
    !Number.isSafeInteger(input.generation) ||
    input.generation < -2_147_483_648 ||
    input.generation > 2_147_483_647
  ) {
    throw new RangeError('Reservation generation must be an Int32');
  }
  if (!CHAIN_ID.test(input.chainId)) throw new TypeError('Chain ID must be canonical');
  if (!EVM_ADDRESS.test(input.executorAddress)) {
    throw new TypeError('Executor address must be lowercase canonical hex');
  }
  if (input.pendingNonce < 0n) throw new RangeError('Pending executor nonce cannot be negative');
}

function isReservationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}
