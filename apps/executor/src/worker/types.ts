import type { AttemptStatus, JobType } from '@paymorph/db';
import type {
  FdcProgress,
  PreparedXrpPaymentRequest,
  SubmittedXrpPaymentRequest,
  XrpPaymentProof,
} from '../adapters/fdc/index.js';
import type { DirectMintFinalization, DirectMintFinalizeRequest } from '../adapters/flare/index.js';
import type { ValidatedXrplPayment } from '../adapters/xrpl/index.js';

export interface JobLease {
  readonly id: string;
  readonly attemptId: string;
  readonly jobType: JobType;
  readonly generation?: number;
}

export interface AttemptSnapshot {
  readonly id: string;
  readonly status: AttemptStatus;
  readonly paymentId: string;
  readonly payerXrplAccount: string;
  readonly personalAccount: string;
  readonly xrplTxHash?: string;
  readonly xrplLedgerIndex?: bigint;
  readonly xrplLastLedgerSequence?: bigint;
  readonly quote: {
    readonly id: string;
    readonly payerXrplAccount: string;
    readonly personalAccount: string;
    readonly personalAccountNonce: string;
    readonly xrplPaymentDrops: string;
    readonly memoHex: string;
    readonly userOpDataEnc: string;
    readonly directMintAddress: string;
    readonly assetManagerAddress: string;
    readonly fxrpAddress: string;
    readonly expiresAt: Date;
    readonly settlementDeadline: Date;
    readonly route: string;
  };
  readonly fdc?: {
    readonly status: 'PREPARED' | 'SUBMITTED' | 'PENDING' | 'READY' | 'FAILED';
    readonly requestBytes: string;
    readonly verifierRequest: unknown;
    readonly votingRoundId?: bigint;
    readonly proofJson?: unknown;
  };
  readonly flareCheckpoint?: {
    readonly transactionHash: string;
    readonly executorNonce: bigint;
    readonly reservationGeneration: number;
    readonly receiptJson?: unknown;
  };
  readonly paymentSettled?: {
    readonly chainId: string;
    readonly txHash: string;
    readonly logIndex: number;
    readonly blockNumber: bigint;
    readonly payload: unknown;
  };
}

export interface ExecutorStore {
  claim(workerId: string, limit: number, leaseMs: number): Promise<readonly JobLease[]>;
  complete(jobId: string, workerId: string): Promise<void>;
  retry(
    jobId: string,
    workerId: string,
    code: string,
    message: string,
    nextRunAt: Date,
  ): Promise<void>;
  loadAttempt(attemptId: string): Promise<AttemptSnapshot>;
  transition(attemptId: string, expected: AttemptStatus, next: AttemptStatus): Promise<void>;
  ensureJob(attemptId: string, jobType: JobType): Promise<void>;
  recordXrplValidated(attemptId: string, payment: ValidatedXrplPayment): Promise<void>;
  loadRecoveryRequest(
    attemptId: string,
    generation: number,
  ): Promise<RecoveryValidationSnapshot | null>;
  recordRecoveryXrplValidated(
    attemptId: string,
    generation: number,
    payment: ValidatedXrplPayment,
  ): Promise<void>;
  saveRecoveryValidationFailure(
    attemptId: string,
    generation: number,
    code: string,
    detail: string,
  ): Promise<void>;
  loadRecoveryExecution(
    attemptId: string,
    generation: number,
  ): Promise<RecoveryExecutionSnapshot | null>;
  saveRecoveryFdcPrepared(
    recoveryRequestId: string,
    request: PreparedXrpPaymentRequest,
  ): Promise<void>;
  saveRecoveryFdcSubmitted(
    recoveryRequestId: string,
    request: SubmittedXrpPaymentRequest,
  ): Promise<void>;
  saveRecoveryFdcPending(recoveryRequestId: string, detail: string): Promise<void>;
  saveRecoveryFdcReady(recoveryRequestId: string, proof: XrpPaymentProof): Promise<void>;
  saveRecoveryFdcFailure(recoveryRequestId: string, code: string, detail: string): Promise<void>;
  reserveRecoveryExecution(input: {
    readonly attemptId: string;
    readonly recoveryRequestId: string;
    readonly recoveryGeneration: number;
    readonly stage: 'MARKER' | 'ORIGINAL';
    readonly executionGeneration: number;
    readonly executorAddress: string;
    readonly pendingNonce: bigint;
  }): Promise<{ readonly reservationGeneration: number; readonly executorNonce: bigint }>;
  recordRecoveryBroadcast(input: {
    readonly recoveryRequestId: string;
    readonly stage: 'MARKER' | 'ORIGINAL';
    readonly executionGeneration: number;
    readonly transactionHash: string;
  }): Promise<void>;
  saveRecoveryExecutionResult(input: {
    readonly recoveryRequestId: string;
    readonly stage: 'MARKER' | 'ORIGINAL';
    readonly executionGeneration: number;
    readonly result: Extract<DirectMintFinalization, { status: 'READY' | 'PENDING' }>;
  }): Promise<void>;
  saveRecoveryExecutionFailure(input: {
    readonly recoveryRequestId: string;
    readonly stage: 'MARKER' | 'ORIGINAL';
    readonly executionGeneration: number;
    readonly code: string;
    readonly detail: string;
  }): Promise<void>;
  markAttemptRecovered(snapshot: RecoveryExecutionSnapshot): Promise<void>;
  saveFdcPrepared(attemptId: string, request: PreparedXrpPaymentRequest): Promise<void>;
  saveFdcSubmitted(attemptId: string, request: SubmittedXrpPaymentRequest): Promise<void>;
  saveFdcPending(attemptId: string, detail: string): Promise<void>;
  saveFdcReady(attemptId: string, proof: XrpPaymentProof): Promise<void>;
  saveFdcFailure(attemptId: string, code: string, detail: string): Promise<void>;
  reserveExecutorNonce(
    attemptId: string,
    generation: number,
    chainId: string,
    executorAddress: string,
    pendingNonce: bigint,
  ): Promise<bigint>;
  recordFlareBroadcast(
    attemptId: string,
    generation: number,
    executorNonce: bigint,
    transactionHash: string,
  ): Promise<void>;
  saveFlareFinalization(
    attempt: AttemptSnapshot,
    reservationGeneration: number,
    executorNonce: bigint,
    result: Extract<DirectMintFinalization, { status: 'READY' | 'PENDING' }>,
  ): Promise<void>;
  saveAttemptFailure(attemptId: string, code: string, detail: string): Promise<void>;
  settleFromPaymentEvent(attempt: AttemptSnapshot): Promise<void>;
}

export interface RecoveryValidationSnapshot {
  readonly id: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly status: string;
  readonly xrplTxHash: string | null;
  readonly requestJson: unknown;
}

export interface RecoveryFdcSnapshot {
  readonly status: 'PREPARED' | 'SUBMITTED' | 'PENDING' | 'READY' | 'FAILED';
  readonly requestBytes: string;
  readonly verifierRequest: unknown;
  readonly votingRoundId?: bigint;
  readonly proofJson?: unknown;
}

export interface RecoveryStageSnapshot {
  readonly stage: 'MARKER' | 'ORIGINAL';
  readonly executionGeneration: number;
  readonly status: 'RESERVED' | 'SUBMITTED' | 'DELAYED' | 'CONFIRMED' | 'FAILED';
  readonly transactionHash?: string;
  readonly receiptJson?: unknown;
  readonly evidenceJson?: unknown;
}

export interface RecoveryExecutionSnapshot {
  readonly attempt: AttemptSnapshot;
  readonly request: RecoveryValidationSnapshot;
  readonly fdc?: RecoveryFdcSnapshot;
  readonly marker?: RecoveryStageSnapshot;
  readonly original?: RecoveryStageSnapshot;
}

export interface ExecutorBoundaries {
  readonly xrpl: {
    getTransaction(transactionHash: string): Promise<unknown>;
    getValidatedLedgerIndex(): Promise<number>;
  };
  readonly fdc: {
    prepareRequest(input: {
      transactionId: string;
    }): Promise<FdcProgress<PreparedXrpPaymentRequest>>;
    submitRequest(
      prepared: PreparedXrpPaymentRequest,
    ): Promise<FdcProgress<SubmittedXrpPaymentRequest>>;
    pollProof(submission: SubmittedXrpPaymentRequest): Promise<FdcProgress<XrpPaymentProof>>;
  };
  readonly flare: {
    readonly executorAddress: string;
    getPendingNonce(): Promise<bigint>;
    finalize(
      request: DirectMintFinalizeRequest,
      onSubmitted?: (transactionHash: `0x${string}`) => Promise<void>,
    ): Promise<DirectMintFinalization>;
    resume(
      request: DirectMintFinalizeRequest,
      transactionHash: `0x${string}`,
    ): Promise<DirectMintFinalization>;
  };
}

export type HandlerResult =
  | { readonly status: 'COMPLETE' }
  | {
      readonly status: 'RETRY';
      readonly code: string;
      readonly detail: string;
      readonly retryAfterMs: number;
    };
