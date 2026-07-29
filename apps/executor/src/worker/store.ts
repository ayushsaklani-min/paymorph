import {
  claimDueJobs,
  completeJob,
  db,
  retryJob,
  reserveExecutorNonce,
  transitionAttempt,
  Prisma,
  type AttemptStatus,
  type JobType,
} from '@paymorph/db';
import { assertTransition } from '@paymorph/shared';
import { getAddress, type Address } from 'viem';
import type {
  DirectMintFinalization,
  DirectMintReceiptEvidence,
} from '../adapters/flare/index.js';
import { parseRecoveryXrplExpectation } from './recovery-request.js';
import { fromJson, toJson } from './serialization.js';
import type {
  AttemptSnapshot,
  ExecutorStore,
  RecoveryExecutionSnapshot,
  RecoveryStageSnapshot,
} from './types.js';

const CHAIN_ID = '114';

export class PrismaExecutorStore implements ExecutorStore {
  readonly #routerAddress: Address;

  constructor(routerAddress: Address) {
    this.#routerAddress = getAddress(routerAddress);
  }

  claim(workerId: string, limit: number, leaseMs: number) {
    return claimDueJobs({
      workerId,
      limit,
      leaseMs,
      jobTypes: [
        'VALIDATE_XRPL',
        'VALIDATE_RECOVERY_XRPL',
        'REQUEST_RECOVERY_FDC',
        'REQUEST_FDC',
        'SUBMIT_FLARE',
        'INDEX_EVENTS',
      ],
    });
  }

  complete(jobId: string, workerId: string) {
    return completeJob(jobId, workerId);
  }

  retry(jobId: string, workerId: string, code: string, message: string, nextRunAt: Date) {
    return retryJob({ jobId, workerId, errorCode: code, errorMessage: message, nextRunAt });
  }

  async loadAttempt(attemptId: string): Promise<AttemptSnapshot> {
    const attempt = await db.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quote: true,
        fdcRequest: true,
        flareSubmissions: { orderBy: { submittedAt: 'desc' }, take: 1 },
        executorNonceReservations: true,
        chainEvents: {
          where: { chainId: CHAIN_ID, eventName: 'PaymentSettled' },
          orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
          take: 1,
        },
      },
    });
    if (!attempt) throw new Error(`Payment attempt ${attemptId} was not found`);
    const settled = attempt.chainEvents[0];
    const flareCheckpoint = attempt.flareSubmissions[0];
    const flareReservation =
      flareCheckpoint === undefined
        ? undefined
        : attempt.executorNonceReservations.find(
            (reservation) => reservation.nonce === flareCheckpoint.nonce,
          );
    if (flareCheckpoint !== undefined && flareReservation === undefined) {
      throw new Error('Flare submission is missing its executor nonce reservation');
    }
    return {
      id: attempt.id,
      status: attempt.status,
      paymentId: attempt.paymentId,
      payerXrplAccount: attempt.payerXrplAccount,
      personalAccount: attempt.personalAccount,
      ...(attempt.xrplTxHash === null ? {} : { xrplTxHash: attempt.xrplTxHash }),
      ...(attempt.xrplLedgerIndex === null ? {} : { xrplLedgerIndex: attempt.xrplLedgerIndex }),
      ...(attempt.xrplLastLedgerSequence === null
        ? {}
        : { xrplLastLedgerSequence: attempt.xrplLastLedgerSequence }),
      quote: {
        id: attempt.quote.id,
        payerXrplAccount: attempt.quote.payerXrplAccount,
        personalAccount: attempt.quote.personalAccount,
        personalAccountNonce: attempt.quote.personalAccountNonce.toFixed(0),
        xrplPaymentDrops: attempt.quote.xrplPaymentDrops.toFixed(0),
        memoHex: attempt.quote.memoHex,
        userOpDataEnc: attempt.quote.userOpDataEnc,
        directMintAddress: attempt.quote.directMintAddress,
        assetManagerAddress: attempt.quote.assetManagerAddress,
        fxrpAddress: attempt.quote.fxrpAddress,
        expiresAt: attempt.quote.expiresAt,
        route: attempt.quote.route,
      },
      ...(attempt.fdcRequest === null
        ? {}
        : {
            fdc: {
              status: attempt.fdcRequest.status,
              requestBytes: attempt.fdcRequest.requestBytes,
              verifierRequest: attempt.fdcRequest.verifierRequest,
              ...(attempt.fdcRequest.votingRoundId === null
                ? {}
                : { votingRoundId: attempt.fdcRequest.votingRoundId }),
              ...(attempt.fdcRequest.proofJson === null
                ? {}
                : { proofJson: attempt.fdcRequest.proofJson }),
            },
          }),
      ...(flareCheckpoint === undefined
        ? {}
        : {
            flareCheckpoint: {
              transactionHash: flareCheckpoint.transactionHash,
              executorNonce: flareCheckpoint.nonce,
              reservationGeneration: flareReservation!.generation,
              ...(flareCheckpoint.receiptJson === null
                ? {}
                : { receiptJson: flareCheckpoint.receiptJson }),
            },
          }),
      ...(settled === undefined
        ? {}
        : {
            paymentSettled: {
              chainId: settled.chainId,
              txHash: settled.txHash,
              logIndex: settled.logIndex,
              blockNumber: settled.blockNumber,
              payload: settled.payloadJson,
            },
          }),
    };
  }

  transition(attemptId: string, expected: AttemptStatus, next: AttemptStatus) {
    return transitionAttempt({ attemptId, expectedStatus: expected, nextStatus: next });
  }

  async ensureJob(attemptId: string, jobType: JobType): Promise<void> {
    await db.executorJob.upsert({
      where: { attemptId_jobType_generation: { attemptId, jobType, generation: 0 } },
      update: {},
      create: { attemptId, jobType, generation: 0 },
    });
  }

  async recordXrplValidated(
    attemptId: string,
    payment: { ledgerIndex: number; ledgerCloseTime: string },
  ): Promise<void> {
    await db.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        xrplLedgerIndex: BigInt(payment.ledgerIndex),
        xrplValidatedAt: new Date(payment.ledgerCloseTime),
      },
    });
  }

  async loadRecoveryRequest(attemptId: string, generation: number) {
    return db.recoveryRequest.findUnique({
      where: { attemptId_generation: { attemptId, generation } },
      select: {
        id: true,
        attemptId: true,
        generation: true,
        status: true,
        xrplTxHash: true,
        requestJson: true,
      },
    });
  }

  async recordRecoveryXrplValidated(
    attemptId: string,
    generation: number,
    payment: {
      transactionHash: string;
      ledgerIndex: number;
      ledgerCloseTime: string;
    },
  ): Promise<void> {
    await db.$transaction(async (transaction) => {
      const updated = await transaction.recoveryRequest.updateMany({
        where: {
          attemptId,
          generation,
          status: 'XRPL_SIGNED',
          xrplTxHash: payment.transactionHash,
        },
        data: {
          status: 'XRPL_VALIDATED',
          xrplLedgerIndex: BigInt(payment.ledgerIndex),
          xrplValidatedAt: new Date(payment.ledgerCloseTime),
          lastError: null,
        },
      });
      if (updated.count !== 1) {
        const current = await transaction.recoveryRequest.findUnique({
          where: { attemptId_generation: { attemptId, generation } },
          select: { status: true, xrplTxHash: true },
        });
        if (
          current?.status !== 'XRPL_VALIDATED' ||
          current.xrplTxHash !== payment.transactionHash
        ) {
          throw new Error('Recovery request changed before XRPL validation was recorded');
        }
      }
      await transaction.executorJob.upsert({
        where: {
          attemptId_jobType_generation: {
            attemptId,
            jobType: 'REQUEST_RECOVERY_FDC',
            generation,
          },
        },
        update: {
          status: 'READY',
          nextRunAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
        },
        create: {
          attemptId,
          jobType: 'REQUEST_RECOVERY_FDC',
          generation,
        },
      });
    });
  }

  async saveRecoveryValidationFailure(
    attemptId: string,
    generation: number,
    code: string,
    detail: string,
  ): Promise<void> {
    await db.recoveryRequest.updateMany({
      where: {
        attemptId,
        generation,
        status: 'XRPL_SIGNED',
      },
      data: {
        status: 'FAILED',
        lastError: `${code}: ${detail}`.slice(0, 2_000),
      },
    });
  }

  async loadRecoveryExecution(
    attemptId: string,
    generation: number,
  ): Promise<RecoveryExecutionSnapshot | null> {
    const [attempt, request] = await Promise.all([
      this.loadAttempt(attemptId),
      db.recoveryRequest.findUnique({
        where: { attemptId_generation: { attemptId, generation } },
        include: {
          fdcRequest: true,
          executions: {
            orderBy: [{ stage: 'asc' }, { executionGeneration: 'desc' }],
          },
        },
      }),
    ]);
    if (!request) return null;
    const stage = (name: 'MARKER' | 'ORIGINAL'): RecoveryStageSnapshot | undefined => {
      const value = request.executions.find((execution) => execution.stage === name);
      if (!value) return undefined;
      return {
        stage: value.stage,
        executionGeneration: value.executionGeneration,
        status: value.status,
        ...(value.transactionHash === null ? {} : { transactionHash: value.transactionHash }),
        ...(value.receiptJson === null ? {} : { receiptJson: value.receiptJson }),
        ...(value.evidenceJson === null ? {} : { evidenceJson: value.evidenceJson }),
      };
    };
    const marker = stage('MARKER');
    const original = stage('ORIGINAL');
    return {
      attempt,
      request: {
        id: request.id,
        attemptId: request.attemptId,
        generation: request.generation,
        status: request.status,
        xrplTxHash: request.xrplTxHash,
        requestJson: request.requestJson,
      },
      ...(request.fdcRequest === null
        ? {}
        : {
            fdc: {
              status: request.fdcRequest.status,
              requestBytes: request.fdcRequest.requestBytes,
              verifierRequest: request.fdcRequest.verifierRequest,
              ...(request.fdcRequest.votingRoundId === null
                ? {}
                : { votingRoundId: request.fdcRequest.votingRoundId }),
              ...(request.fdcRequest.proofJson === null
                ? {}
                : { proofJson: request.fdcRequest.proofJson }),
            },
          }),
      ...(marker === undefined ? {} : { marker }),
      ...(original === undefined ? {} : { original }),
    };
  }

  async saveRecoveryFdcPrepared(
    recoveryRequestId: string,
    request: {
      transactionId: string;
      proofOwner: string;
      abiEncodedRequest: string;
    },
  ): Promise<void> {
    await db.recoveryFdcRequest.upsert({
      where: { recoveryRequestId },
      update: {
        status: 'PREPARED',
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
        },
        lastError: null,
      },
      create: {
        recoveryRequestId,
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
        },
      },
    });
  }

  async saveRecoveryFdcSubmitted(
    recoveryRequestId: string,
    request: {
      transactionId: string;
      proofOwner: string;
      abiEncodedRequest: string;
      requestTransactionHash: string;
      requestBlockNumber: bigint;
      votingRoundId: bigint;
    },
  ): Promise<void> {
    await db.recoveryFdcRequest.update({
      where: { recoveryRequestId },
      data: {
        status: 'SUBMITTED',
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
          requestTransactionHash: request.requestTransactionHash,
          requestBlockNumber: request.requestBlockNumber.toString(),
        },
        votingRoundId: request.votingRoundId,
        submittedAt: new Date(),
        lastError: null,
      },
    });
  }

  async saveRecoveryFdcPending(recoveryRequestId: string, detail: string): Promise<void> {
    await db.recoveryFdcRequest.update({
      where: { recoveryRequestId },
      data: { status: 'PENDING', lastError: detail.slice(0, 2_000) },
    });
  }

  async saveRecoveryFdcReady(recoveryRequestId: string, proof: unknown): Promise<void> {
    await db.recoveryFdcRequest.update({
      where: { recoveryRequestId },
      data: { status: 'READY', proofJson: toJson(proof), readyAt: new Date(), lastError: null },
    });
  }

  async saveRecoveryFdcFailure(
    recoveryRequestId: string,
    code: string,
    detail: string,
  ): Promise<void> {
    await db.recoveryFdcRequest.update({
      where: { recoveryRequestId },
      data: { status: 'FAILED', lastError: `${code}: ${detail}`.slice(0, 2_000) },
    });
  }

  async reserveRecoveryExecution(input: {
    attemptId: string;
    recoveryRequestId: string;
    recoveryGeneration: number;
    stage: 'MARKER' | 'ORIGINAL';
    executionGeneration: number;
    executorAddress: string;
    pendingNonce: bigint;
  }): Promise<{ reservationGeneration: number; executorNonce: bigint }> {
    const reservationGeneration = recoveryReservationGeneration(
      input.recoveryGeneration,
      input.stage,
      input.executionGeneration,
    );
    const reservation = await reserveExecutorNonce({
      attemptId: input.attemptId,
      generation: reservationGeneration,
      chainId: CHAIN_ID,
      executorAddress: input.executorAddress.toLowerCase(),
      pendingNonce: input.pendingNonce,
    });
    await db.recoveryExecution.upsert({
      where: {
        recoveryRequestId_stage_executionGeneration: {
          recoveryRequestId: input.recoveryRequestId,
          stage: input.stage,
          executionGeneration: input.executionGeneration,
        },
      },
      update: {
        nonceReservationId: reservation.id,
      },
      create: {
        recoveryRequestId: input.recoveryRequestId,
        stage: input.stage,
        executionGeneration: input.executionGeneration,
        status: 'RESERVED',
        nonceReservationId: reservation.id,
      },
    });
    return { reservationGeneration, executorNonce: reservation.nonce };
  }

  async recordRecoveryBroadcast(input: {
    recoveryRequestId: string;
    stage: 'MARKER' | 'ORIGINAL';
    executionGeneration: number;
    transactionHash: string;
  }): Promise<void> {
    await db.$transaction(async (transaction) => {
      const execution = await transaction.recoveryExecution.findUnique({
        where: {
          recoveryRequestId_stage_executionGeneration: {
            recoveryRequestId: input.recoveryRequestId,
            stage: input.stage,
            executionGeneration: input.executionGeneration,
          },
        },
        include: { nonceReservation: true, recoveryRequest: true },
      });
      if (!execution?.nonceReservation) throw new Error('Recovery execution has no nonce reservation');
      await transaction.recoveryExecution.update({
        where: { id: execution.id },
        data: {
          status: 'SUBMITTED',
          transactionHash: input.transactionHash,
          submittedAt: new Date(),
          lastError: null,
        },
      });
      await transaction.executorNonceReservation.update({
        where: { id: execution.nonceReservation.id },
        data: { transactionHash: input.transactionHash },
      });
      await transaction.flareSubmission.upsert({
        where: { transactionHash: input.transactionHash },
        update: {},
        create: {
          attemptId: execution.recoveryRequest.attemptId,
          transactionHash: input.transactionHash,
          nonce: execution.nonceReservation.nonce,
          status: 'SUBMITTED',
          receiptJson: {
            purpose: input.stage === 'MARKER' ? 'RECOVERY_MARKER' : 'RECOVERY_ORIGINAL',
          },
        },
      });
    });
  }

  async saveRecoveryExecutionResult(input: {
    recoveryRequestId: string;
    stage: 'MARKER' | 'ORIGINAL';
    executionGeneration: number;
    result: Extract<DirectMintFinalization, { status: 'READY' | 'PENDING' }>;
  }): Promise<void> {
    const purpose =
      input.stage === 'MARKER' ? 'RECOVERY_MARKER' : 'RECOVERY_ORIGINAL';
    const receiptJson =
      input.result.status === 'READY'
        ? toJson({ purpose, outcome: 'READY', receipt: input.result.receipt })
        : toJson({
            purpose,
            outcome: 'DELAYED',
            reason: input.result.reason,
            executionAllowedAt: input.result.executionAllowedAt,
            amountUBA: input.result.amountUBA,
          });
    await db.$transaction(async (transaction) => {
      await transaction.recoveryExecution.update({
        where: {
          recoveryRequestId_stage_executionGeneration: {
            recoveryRequestId: input.recoveryRequestId,
            stage: input.stage,
            executionGeneration: input.executionGeneration,
          },
        },
        data: {
          status: input.result.status === 'READY' ? 'CONFIRMED' : 'DELAYED',
          transactionHash: input.result.transactionHash,
          receiptJson,
          ...(input.result.status === 'READY'
            ? {
                evidenceJson: toJson(input.result.evidence),
                confirmedAt: new Date(),
              }
            : { confirmedAt: null }),
          lastError: null,
        },
      });
      await transaction.flareSubmission.update({
        where: { transactionHash: input.result.transactionHash },
        data: { status: 'CONFIRMED', receiptJson, confirmedAt: new Date() },
      });
    });
  }

  async saveRecoveryExecutionFailure(input: {
    recoveryRequestId: string;
    stage: 'MARKER' | 'ORIGINAL';
    executionGeneration: number;
    code: string;
    detail: string;
  }): Promise<void> {
    await db.recoveryExecution.update({
      where: {
        recoveryRequestId_stage_executionGeneration: {
          recoveryRequestId: input.recoveryRequestId,
          stage: input.stage,
          executionGeneration: input.executionGeneration,
        },
      },
      data: {
        status: 'FAILED',
        lastError: `${input.code}: ${input.detail}`.slice(0, 2_000),
      },
    });
  }

  async markAttemptRecovered(snapshot: RecoveryExecutionSnapshot): Promise<void> {
    assertTransition('RECOVERY_REQUIRED', 'RECOVERED');
    await db.$transaction(
      async (transaction) => {
        const current = await transaction.paymentAttempt.findUnique({
          where: { id: snapshot.attempt.id },
        });
        if (!current) throw new Error('Payment attempt not found');
        if (current.status === 'RECOVERED') return;
        if (current.status !== 'RECOVERY_REQUIRED') {
          throw new Error(`Attempt status changed concurrently: ${current.status}`);
        }
        const persistedRequest = await transaction.recoveryRequest.findUnique({
          where: { id: snapshot.request.id },
          select: {
            attemptId: true,
            status: true,
            xrplTxHash: true,
            requestJson: true,
          },
        });
        if (
          !persistedRequest ||
          persistedRequest.attemptId !== current.id ||
          persistedRequest.status !== 'XRPL_VALIDATED'
        ) {
          throw new Error('RECOVERED requires an XRPL-validated persisted recovery request');
        }
        const originalTransactionId = normalizeTransactionId(current.xrplTxHash);
        const recoveryTransactionId = normalizeTransactionId(
          persistedRequest.xrplTxHash ?? undefined,
        );
        const recoveryExpectation = parseRecoveryXrplExpectation(
          persistedRequest.requestJson,
        );
        if (
          recoveryExpectation.targetTransactionId.toLowerCase() !==
          originalTransactionId.toLowerCase()
        ) {
          throw new Error('Persisted recovery request does not target the original XRPL payment');
        }
        const confirmedExecutions = await transaction.recoveryExecution.findMany({
          where: {
            recoveryRequestId: snapshot.request.id,
            status: 'CONFIRMED',
          },
          orderBy: { executionGeneration: 'desc' },
          select: {
            stage: true,
            transactionHash: true,
            evidenceJson: true,
          },
        });
        const markerRecord = confirmedExecutions.find(
          (execution) => execution.stage === 'MARKER',
        );
        const originalRecord = confirmedExecutions.find(
          (execution) => execution.stage === 'ORIGINAL',
        );
        if (
          !markerRecord?.evidenceJson ||
          !markerRecord.transactionHash ||
          !originalRecord?.evidenceJson ||
          !originalRecord.transactionHash
        ) {
          throw new Error('RECOVERED requires confirmed persisted marker and original evidence');
        }
        const markerEvidence = fromJson<DirectMintReceiptEvidence>(markerRecord.evidenceJson);
        const originalEvidence = fromJson<DirectMintReceiptEvidence>(
          originalRecord.evidenceJson,
        );
        if (
          markerEvidence.transactionHash.toLowerCase() !==
            markerRecord.transactionHash.toLowerCase() ||
          originalEvidence.transactionHash.toLowerCase() !==
            originalRecord.transactionHash.toLowerCase() ||
          !markerEvidence.ignoreMemo ||
          markerEvidence.smartAccountMint.transactionId.toLowerCase() !==
            recoveryTransactionId.toLowerCase() ||
          markerEvidence.smartAccountMint.mintedAmountUBA <= 0n ||
          markerEvidence.masterAccountMint.transactionId.toLowerCase() !==
            recoveryTransactionId.toLowerCase() ||
          markerEvidence.masterAccountMint.personalAccount.toLowerCase() !==
            current.personalAccount.toLowerCase() ||
          markerEvidence.masterAccountMint.amountUBA !==
            recoveryExpectation.desiredNetMintUBA ||
          markerEvidence.ignoreMemo.targetTransactionId.toLowerCase() !==
            originalTransactionId.toLowerCase() ||
          markerEvidence.ignoreMemo.personalAccount.toLowerCase() !==
            current.personalAccount.toLowerCase() ||
          originalEvidence.smartAccountMint.transactionId.toLowerCase() !==
            originalTransactionId.toLowerCase() ||
          originalEvidence.smartAccountMint.mintedAmountUBA <= 0n ||
          originalEvidence.masterAccountMint.transactionId.toLowerCase() !==
            originalTransactionId.toLowerCase() ||
          originalEvidence.masterAccountMint.personalAccount.toLowerCase() !==
            current.personalAccount.toLowerCase() ||
          originalEvidence.masterAccountMint.amountUBA <= 0n ||
          originalEvidence.userOperation !== undefined ||
          originalEvidence.paymentSettled !== undefined
        ) {
          throw new Error('Persisted recovery evidence does not prove ignored memo and original mint');
        }
        await transaction.chainEvent.createMany({
          data: [
            {
              attemptId: snapshot.attempt.id,
              chain: 'EVM',
              chainId: CHAIN_ID,
              txHash: markerEvidence.transactionHash,
              logIndex: markerEvidence.ignoreMemo.logIndex,
              blockNumber: markerEvidence.blockNumber,
              eventName: 'RecoveryIgnoreMemoSet',
              payloadJson: {
                personalAccount: markerEvidence.ignoreMemo.personalAccount,
                targetTransactionId: markerEvidence.ignoreMemo.targetTransactionId,
              },
            },
            {
              attemptId: snapshot.attempt.id,
              chain: 'EVM',
              chainId: CHAIN_ID,
              txHash: originalEvidence.transactionHash,
              logIndex: originalEvidence.masterAccountMint.logIndex,
              blockNumber: originalEvidence.blockNumber,
              eventName: 'RecoveryMinted',
              payloadJson: {
                personalAccount: originalEvidence.masterAccountMint.personalAccount,
                transactionId: originalEvidence.masterAccountMint.transactionId,
                sourceAddress: originalEvidence.masterAccountMint.sourceAddress,
                amountUBA: originalEvidence.masterAccountMint.amountUBA.toString(),
                executorFeeUBA: originalEvidence.masterAccountMint.executorFeeUBA.toString(),
                executor: originalEvidence.masterAccountMint.executor,
              },
            },
          ],
          skipDuplicates: true,
        });
        await transaction.paymentAttempt.update({
          where: { id: snapshot.attempt.id },
          data: { status: 'RECOVERED', version: { increment: 1 } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async saveFdcPrepared(
    attemptId: string,
    request: {
      transactionId: string;
      proofOwner: string;
      abiEncodedRequest: string;
    },
  ): Promise<void> {
    await db.fdcRequest.upsert({
      where: { attemptId },
      update: {
        status: 'PREPARED',
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
        },
        lastError: null,
      },
      create: {
        attemptId,
        status: 'PREPARED',
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
        },
      },
    });
  }

  async saveFdcSubmitted(
    attemptId: string,
    request: {
      transactionId: string;
      proofOwner: string;
      abiEncodedRequest: string;
      requestTransactionHash: string;
      requestBlockNumber: bigint;
      votingRoundId: bigint;
    },
  ): Promise<void> {
    await db.fdcRequest.update({
      where: { attemptId },
      data: {
        status: 'SUBMITTED',
        requestBytes: request.abiEncodedRequest,
        verifierRequest: {
          transactionId: request.transactionId,
          proofOwner: request.proofOwner,
          requestTransactionHash: request.requestTransactionHash,
          requestBlockNumber: request.requestBlockNumber.toString(),
        },
        votingRoundId: request.votingRoundId,
        submittedAt: new Date(),
        lastError: null,
      },
    });
  }

  async saveFdcPending(attemptId: string, detail: string): Promise<void> {
    await db.fdcRequest.update({
      where: { attemptId },
      data: { status: 'PENDING', lastError: detail.slice(0, 2_000) },
    });
  }

  async saveFdcReady(attemptId: string, proof: unknown): Promise<void> {
    await db.fdcRequest.update({
      where: { attemptId },
      data: { status: 'READY', proofJson: toJson(proof), readyAt: new Date(), lastError: null },
    });
  }

  async saveFdcFailure(attemptId: string, code: string, detail: string): Promise<void> {
    await db.fdcRequest.update({
      where: { attemptId },
      data: { status: 'FAILED', lastError: `${code}: ${detail}`.slice(0, 2_000) },
    });
  }

  async reserveExecutorNonce(
    attemptId: string,
    generation: number,
    chainId: string,
    executorAddress: string,
    pendingNonce: bigint,
  ): Promise<bigint> {
    const reservation = await reserveExecutorNonce({
      attemptId,
      generation,
      chainId,
      executorAddress: executorAddress.toLowerCase(),
      pendingNonce,
    });
    return reservation.nonce;
  }

  async recordFlareBroadcast(
    attemptId: string,
    generation: number,
    executorNonce: bigint,
    transactionHash: string,
  ): Promise<void> {
    await db.$transaction(async (transaction) => {
      const reservation = await transaction.executorNonceReservation.findUnique({
        where: { attemptId_generation: { attemptId, generation } },
      });
      if (!reservation || reservation.nonce !== executorNonce) {
        throw new Error('Flare broadcast does not match its executor nonce reservation');
      }
      const replacementForHash =
        reservation.transactionHash && reservation.transactionHash !== transactionHash
          ? reservation.transactionHash
          : null;
      if (replacementForHash) {
        await transaction.flareSubmission.updateMany({
          where: { attemptId, transactionHash: replacementForHash },
          data: { status: 'REPLACED' },
        });
      }
      await transaction.flareSubmission.upsert({
        where: { transactionHash },
        update: {},
        create: {
          attemptId,
          transactionHash,
          nonce: executorNonce,
          status: 'SUBMITTED',
          replacementForHash,
        },
      });
      await transaction.executorNonceReservation.update({
        where: { id: reservation.id },
        data: { transactionHash },
      });
      await transaction.paymentAttempt.update({
        where: { id: attemptId },
        data: { flareTxHash: transactionHash, flareSubmittedAt: new Date() },
      });
    });
  }

  async saveFlareFinalization(
    attempt: AttemptSnapshot,
    reservationGeneration: number,
    executorNonce: bigint,
    result: Extract<DirectMintFinalization, { status: 'READY' | 'PENDING' }>,
  ): Promise<void> {
    const ready = result.status === 'READY';
    await db.$transaction(async (transaction) => {
      const reservation = await transaction.executorNonceReservation.findUnique({
        where: {
          attemptId_generation: {
            attemptId: attempt.id,
            generation: reservationGeneration,
          },
        },
      });
      if (!reservation || reservation.nonce !== executorNonce) {
        throw new Error('Flare submission does not match its durable executor nonce reservation');
      }
      const replacementForHash =
        reservation.transactionHash && reservation.transactionHash !== result.transactionHash
          ? reservation.transactionHash
          : null;
      if (replacementForHash) {
        await transaction.flareSubmission.updateMany({
          where: { attemptId: attempt.id, transactionHash: replacementForHash },
          data: { status: 'REPLACED' },
        });
      }
      await transaction.flareSubmission.upsert({
        where: { transactionHash: result.transactionHash },
        update: {
          status: 'CONFIRMED',
          receiptJson: toJson(
            ready
              ? { outcome: 'READY', receipt: result.receipt, evidence: result.evidence }
              : {
                  outcome: 'DELAYED',
                  reason: result.reason,
                  executionAllowedAt: result.executionAllowedAt,
                  amountUBA: result.amountUBA,
                },
          ),
          confirmedAt: new Date(),
        },
        create: {
          attemptId: attempt.id,
          transactionHash: result.transactionHash,
          nonce: executorNonce,
          status: 'CONFIRMED',
          replacementForHash,
          receiptJson: toJson(
            ready
              ? { outcome: 'READY', receipt: result.receipt, evidence: result.evidence }
              : {
                  outcome: 'DELAYED',
                  reason: result.reason,
                  executionAllowedAt: result.executionAllowedAt,
                  amountUBA: result.amountUBA,
                },
          ),
          confirmedAt: new Date(),
        },
      });
      await transaction.executorNonceReservation.update({
        where: { id: reservation.id },
        data: { transactionHash: result.transactionHash },
      });
      await transaction.paymentAttempt.update({
        where: { id: attempt.id },
        data: { flareTxHash: result.transactionHash, flareSubmittedAt: new Date() },
      });
      if (ready) {
        const settled = result.evidence.paymentSettled;
        if (!settled) throw new Error('Settlement finalization lacks PaymentSettled evidence');
        const asset = settled.asset === 0 ? 'FXRP' : settled.asset === 1 ? 'USDT0' : undefined;
        if (!asset) throw new Error(`Unsupported settlement asset enum ${settled.asset}`);
        const events: Prisma.ChainEventCreateManyInput[] = [
          ...result.evidence.recipientsPaid.map((event) => ({
            attemptId: attempt.id,
            chain: 'EVM',
            chainId: CHAIN_ID,
            txHash: result.transactionHash,
            logIndex: event.logIndex,
            blockNumber: result.evidence.blockNumber,
            eventName: 'RecipientPaid',
            payloadJson: {
              paymentId: event.paymentId,
              recipient: event.recipient,
              token: event.token,
              amount: event.amount.toString(),
              bps: event.bps,
            },
          })),
          {
            attemptId: attempt.id,
            chain: 'EVM',
            chainId: CHAIN_ID,
            txHash: result.transactionHash,
            logIndex: settled.logIndex,
            blockNumber: result.evidence.blockNumber,
            eventName: 'PaymentSettled',
            payloadJson: {
              paymentId: settled.paymentId,
              payerPersonalAccount: settled.payerPersonalAccount,
              asset,
              invoiceAmount: settled.invoiceAmount.toString(),
              serviceFee: settled.serviceFee.toString(),
              inputFxrpUsed: settled.inputFxrpUsed.toString(),
              refundTo: settled.refundTo,
              refundFxrp: settled.refundFxrp.toString(),
              routerAddress: this.#routerAddress,
              routerVersion: '1',
              assetManagerAddress: attempt.quote.assetManagerAddress,
            },
          },
        ];
        await transaction.chainEvent.createMany({ data: events, skipDuplicates: true });
      }
    });
  }

  async saveAttemptFailure(attemptId: string, code: string, detail: string): Promise<void> {
    await db.paymentAttempt.update({
      where: { id: attemptId },
      data: { failureCode: code, failureMessage: detail.slice(0, 2_000) },
    });
  }

  async settleFromPaymentEvent(attempt: AttemptSnapshot): Promise<void> {
    if (!attempt.paymentSettled) throw new Error('PaymentSettled chain event is missing');
    await transitionAttempt({
      attemptId: attempt.id,
      expectedStatus: 'FLARE_CONFIRMED',
      nextStatus: 'SETTLED',
      settlementEvidence: {
        chainId: attempt.paymentSettled.chainId,
        txHash: attempt.paymentSettled.txHash,
        logIndex: attempt.paymentSettled.logIndex,
        blockNumber: attempt.paymentSettled.blockNumber,
        payload: attempt.paymentSettled.payload as Prisma.InputJsonValue,
      },
    });
  }
}

function recoveryReservationGeneration(
  recoveryGeneration: number,
  stage: 'MARKER' | 'ORIGINAL',
  executionGeneration: number,
): number {
  if (
    !Number.isSafeInteger(recoveryGeneration) ||
    recoveryGeneration < 0 ||
    !Number.isSafeInteger(executionGeneration) ||
    executionGeneration < 0 ||
    executionGeneration >= 50_000
  ) {
    throw new RangeError('Invalid recovery execution generation');
  }
  const namespace =
    recoveryGeneration * 100_000 + (stage === 'MARKER' ? 1 : 50_001) + executionGeneration;
  if (!Number.isSafeInteger(namespace) || namespace > 2_147_483_648) {
    throw new RangeError('Recovery generation exceeds the Int32 reservation namespace');
  }
  return -namespace;
}

function normalizeTransactionId(value: string | null | undefined): string {
  if (!value || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Original XRPL transaction hash is missing or invalid');
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}
