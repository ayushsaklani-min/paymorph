import { decryptSensitive } from '@paymorph/shared';
import { getAddress, isHex, padHex, type Hex } from 'viem';
import {
  checkXrplFdcConfirmations,
  type PreparedXrpPaymentRequest,
  type SubmittedXrpPaymentRequest,
} from '../adapters/fdc/index.js';
import {
  recoveryExecutionData,
  type DirectMintFinalizeRequest,
  type DirectMintReceiptEvidence,
} from '../adapters/flare/index.js';
import { validateXrplPayment, XrplValidationError } from '../adapters/xrpl/index.js';
import {
  fromJson,
  preparedFromCheckpoint,
  proofFromCheckpoint,
  submittedFromCheckpoint,
} from './serialization.js';
import { parseRecoveryXrplExpectation } from './recovery-request.js';
import type {
  AttemptSnapshot,
  ExecutorBoundaries,
  ExecutorStore,
  HandlerResult,
  JobLease,
  RecoveryExecutionSnapshot,
  RecoveryStageSnapshot,
} from './types.js';

const DEFAULT_RETRY_MS = 10_000;

export class ExecutorHandlers {
  constructor(
    private readonly store: ExecutorStore,
    private readonly boundaries: ExecutorBoundaries,
    private readonly encryptionKey: Buffer,
    private readonly requiredXrplConfirmations = 3,
  ) {}

  async handle(job: JobLease): Promise<HandlerResult> {
    switch (job.jobType) {
      case 'VALIDATE_XRPL':
        return this.validateXrpl(job.attemptId);
      case 'VALIDATE_RECOVERY_XRPL':
        return this.validateRecoveryXrpl(job.attemptId, job.generation ?? 0);
      case 'REQUEST_RECOVERY_FDC':
        return this.processRecovery(job.attemptId, job.generation ?? 0);
      case 'REQUEST_FDC':
        return this.requestFdc(job.attemptId);
      case 'SUBMIT_FLARE':
        return this.submitFlare(job.attemptId);
      case 'INDEX_EVENTS':
        return this.indexEvents(job.attemptId);
      default:
        return retry('UNSUPPORTED_JOB', `Unsupported job type ${job.jobType}`, 60_000);
    }
  }

  private async validateXrpl(attemptId: string): Promise<HandlerResult> {
    const attempt = await this.store.loadAttempt(attemptId);
    if (attempt.status !== 'XRPL_SIGNED') {
      if (hasReached(attempt.status, 'XRPL_VALIDATED')) {
        await this.store.ensureJob(attempt.id, 'REQUEST_FDC');
        return complete();
      }
      return retry('INVALID_STATE', `VALIDATE_XRPL cannot run from ${attempt.status}`, 60_000);
    }
    if (!attempt.xrplTxHash || attempt.xrplLastLedgerSequence === undefined) {
      return this.failXrpl(attempt, 'XRPL_EXPECTATION_MISSING', 'Signed attempt lacks XRPL fields');
    }
    const lastLedgerSequence = Number(attempt.xrplLastLedgerSequence);
    if (
      !Number.isSafeInteger(lastLedgerSequence) ||
      lastLedgerSequence < 1 ||
      lastLedgerSequence > 0xffff_ffff
    ) {
      return this.failXrpl(
        attempt,
        'XRPL_EXPECTATION_INVALID',
        'LastLedgerSequence is outside XRPL UInt32',
      );
    }

    let payment;
    try {
      const raw = await this.boundaries.xrpl.getTransaction(attempt.xrplTxHash);
      payment = validateXrplPayment(raw, {
        transactionHash: attempt.xrplTxHash,
        payerAccount: attempt.payerXrplAccount,
        destination: attempt.quote.directMintAddress,
        amountDrops: attempt.quote.xrplPaymentDrops,
        memoHex: attempt.quote.memoHex,
        lastLedgerSequence,
        latestCloseTimeMs: attempt.quote.expiresAt.getTime(),
      });
    } catch (error) {
      if (error instanceof XrplValidationError) {
        if (error.code === 'NOT_VALIDATED' || error.code === 'INVALID_PROVIDER_RESPONSE') {
          return retry(error.code, error.message, DEFAULT_RETRY_MS);
        }
        return this.failXrpl(attempt, error.code, error.message);
      }
      throw error;
    }

    await this.store.recordXrplValidated(attempt.id, payment);
    const validatedLedgerIndex = await this.boundaries.xrpl.getValidatedLedgerIndex();
    const confirmations = checkXrplFdcConfirmations({
      transactionLedgerIndex: payment.ledgerIndex,
      validatedLedgerIndex,
      requiredConfirmations: this.requiredXrplConfirmations,
    });
    if (confirmations.status === 'PENDING') {
      return retry(confirmations.reason, confirmations.detail, confirmations.retryAfterMs);
    }
    if (confirmations.status === 'FAILED') {
      return this.failXrpl(attempt, confirmations.code, confirmations.detail);
    }
    await this.store.transition(attempt.id, 'XRPL_SIGNED', 'XRPL_VALIDATED');
    await this.store.ensureJob(attempt.id, 'REQUEST_FDC');
    return complete();
  }

  private async validateRecoveryXrpl(
    attemptId: string,
    generation: number,
  ): Promise<HandlerResult> {
    const [attempt, recovery] = await Promise.all([
      this.store.loadAttempt(attemptId),
      this.store.loadRecoveryRequest(attemptId, generation),
    ]);
    if (recovery === null) {
      return retry(
        'RECOVERY_REQUEST_MISSING',
        `Recovery generation ${generation} is missing`,
        60_000,
      );
    }
    if (recovery.status === 'XRPL_VALIDATED') {
      return complete();
    }
    if (recovery.status === 'FAILED') {
      return complete();
    }
    if (
      attempt.status !== 'RECOVERY_REQUIRED' ||
      recovery.status !== 'XRPL_SIGNED' ||
      recovery.xrplTxHash === null
    ) {
      return retry(
        'INVALID_RECOVERY_STATE',
        `Recovery validation cannot run from ${attempt.status}/${recovery.status}`,
        60_000,
      );
    }

    let expected;
    try {
      expected = parseRecoveryXrplExpectation(recovery.requestJson);
      if (
        !attempt.xrplTxHash ||
        expected.targetTransactionId.slice(2).toLowerCase() !==
          attempt.xrplTxHash.replace(/^0x/, '').toLowerCase()
      ) {
        throw new Error('Recovery E0 memo does not target the original XRP transaction');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.store.saveRecoveryValidationFailure(
        attempt.id,
        generation,
        'RECOVERY_EXPECTATION_INVALID',
        detail,
      );
      return complete();
    }

    let payment;
    try {
      const raw = await this.boundaries.xrpl.getTransaction(recovery.xrplTxHash);
      payment = validateXrplPayment(raw, {
        transactionHash: recovery.xrplTxHash,
        payerAccount: attempt.payerXrplAccount,
        destination: expected.destination,
        amountDrops: expected.amountDrops,
        memoHex: expected.memoHex,
        memoOpcode: 'E0',
        lastLedgerSequence: expected.lastLedgerSequence,
      });
    } catch (error) {
      if (error instanceof XrplValidationError) {
        if (error.code === 'NOT_VALIDATED' || error.code === 'INVALID_PROVIDER_RESPONSE') {
          return retry(error.code, error.message, DEFAULT_RETRY_MS);
        }
        await this.store.saveRecoveryValidationFailure(
          attempt.id,
          generation,
          error.code,
          error.message,
        );
        return complete();
      }
      throw error;
    }

    const validatedLedgerIndex = await this.boundaries.xrpl.getValidatedLedgerIndex();
    const confirmations = checkXrplFdcConfirmations({
      transactionLedgerIndex: payment.ledgerIndex,
      validatedLedgerIndex,
      requiredConfirmations: this.requiredXrplConfirmations,
    });
    if (confirmations.status === 'PENDING') {
      return retry(confirmations.reason, confirmations.detail, confirmations.retryAfterMs);
    }
    if (confirmations.status === 'FAILED') {
      await this.store.saveRecoveryValidationFailure(
        attempt.id,
        generation,
        confirmations.code,
        confirmations.detail,
      );
      return complete();
    }

    await this.store.recordRecoveryXrplValidated(attempt.id, generation, payment);
    return complete();
  }

  private async requestFdc(attemptId: string): Promise<HandlerResult> {
    const attempt = await this.store.loadAttempt(attemptId);
    if (attempt.status === 'FDC_READY' || hasReached(attempt.status, 'FLARE_SUBMITTED')) {
      await this.store.ensureJob(attempt.id, 'SUBMIT_FLARE');
      return complete();
    }
    if (attempt.status !== 'XRPL_VALIDATED' && attempt.status !== 'FDC_REQUESTED') {
      return retry('INVALID_STATE', `REQUEST_FDC cannot run from ${attempt.status}`, 60_000);
    }
    if (!attempt.xrplTxHash) {
      return this.failFdc(attempt, 'XRPL_TX_MISSING', 'Validated attempt lacks XRPL tx hash');
    }

    let prepared: PreparedXrpPaymentRequest;
    if (!attempt.fdc) {
      const result = await this.boundaries.fdc.prepareRequest({
        transactionId: attempt.xrplTxHash,
      });
      if (result.status === 'PENDING') {
        return retry(result.reason, result.detail, result.retryAfterMs);
      }
      if (result.status === 'FAILED') return this.handleFdcFailure(attempt, result);
      prepared = result.value;
      await this.store.saveFdcPrepared(attempt.id, prepared);
    } else {
      prepared = preparedFromCheckpoint(attempt.fdc.requestBytes, attempt.fdc.verifierRequest);
    }

    let submitted: SubmittedXrpPaymentRequest;
    if (
      !attempt.fdc ||
      attempt.fdc.status === 'PREPARED' ||
      attempt.fdc.votingRoundId === undefined
    ) {
      const result = await this.boundaries.fdc.submitRequest(prepared);
      if (result.status === 'PENDING') {
        return retry(result.reason, result.detail, result.retryAfterMs);
      }
      if (result.status === 'FAILED') return this.handleFdcFailure(attempt, result);
      submitted = result.value;
      await this.store.saveFdcSubmitted(attempt.id, submitted);
      if (attempt.status === 'XRPL_VALIDATED') {
        await this.store.transition(attempt.id, 'XRPL_VALIDATED', 'FDC_REQUESTED');
      }
    } else {
      submitted = submittedFromCheckpoint(
        attempt.fdc.requestBytes,
        attempt.fdc.verifierRequest,
        attempt.fdc.votingRoundId,
      );
      if (attempt.status === 'XRPL_VALIDATED') {
        await this.store.transition(attempt.id, 'XRPL_VALIDATED', 'FDC_REQUESTED');
      }
    }

    const proof = await this.boundaries.fdc.pollProof(submitted);
    if (proof.status === 'PENDING') {
      await this.store.saveFdcPending(attempt.id, proof.detail);
      return retry(proof.reason, proof.detail, proof.retryAfterMs);
    }
    if (proof.status === 'FAILED') return this.handleFdcFailure(attempt, proof);
    await this.store.saveFdcReady(attempt.id, proof.value);
    await this.store.transition(attempt.id, 'FDC_REQUESTED', 'FDC_READY');
    await this.store.ensureJob(attempt.id, 'SUBMIT_FLARE');
    return complete();
  }

  private async processRecovery(attemptId: string, generation: number): Promise<HandlerResult> {
    const snapshot = await this.store.loadRecoveryExecution(attemptId, generation);
    if (!snapshot) {
      return retry('RECOVERY_REQUEST_MISSING', 'Recovery request checkpoint was not found', 60_000);
    }
    if (snapshot.attempt.status === 'RECOVERED') return complete();
    if (
      snapshot.attempt.status !== 'RECOVERY_REQUIRED' ||
      snapshot.request.status !== 'XRPL_VALIDATED' ||
      !snapshot.request.xrplTxHash
    ) {
      return retry(
        'RECOVERY_INVALID_STATE',
        `Recovery execution requires RECOVERY_REQUIRED/XRPL_VALIDATED, received ${snapshot.attempt.status}/${snapshot.request.status}`,
        60_000,
      );
    }

    if (snapshot.attempt.fdc?.status !== 'READY' || !snapshot.attempt.fdc.proofJson) {
      await this.store.saveAttemptFailure(
        snapshot.attempt.id,
        'RECOVERY_ORIGINAL_FDC_PROOF_MISSING',
        'Recovery requires the persisted READY FDC proof for the original XRP payment',
      );
      return complete();
    }
    const recoveryProof = await this.ensureRecoveryFdc(snapshot);
    if ('status' in recoveryProof) return recoveryProof;
    const originalTransactionId = normalizeBytes32(snapshot.attempt.xrplTxHash!);
    const recoveryExpectation = parseRecoveryXrplExpectation(snapshot.request.requestJson);
    const marker = await this.executeRecoveryStage(snapshot, {
      stage: 'MARKER',
      proof: recoveryProof.proof,
      transactionId: normalizeBytes32(snapshot.request.xrplTxHash),
      data: recoveryExecutionData({ stage: 'RECOVERY_MARKER' }),
      originalTransactionId,
      expectedNetMintUBA: recoveryExpectation.desiredNetMintUBA,
    });
    if ('status' in marker) return marker;

    const packedBytes = decryptSensitive(snapshot.attempt.quote.userOpDataEnc, {
      key: this.encryptionKey,
      aad: `quote:${snapshot.attempt.quote.id}`,
    });
    const originalData = `0x${packedBytes.toString('hex')}`;
    if (!isHex(originalData) || originalData === '0x') {
      await this.store.saveAttemptFailure(
        snapshot.attempt.id,
        'RECOVERY_ORIGINAL_USER_OP_INVALID',
        'Original committed user-operation bytes are unavailable',
      );
      return complete();
    }
    const original = await this.executeRecoveryStage(snapshot, {
      stage: 'ORIGINAL',
      proof: proofFromCheckpoint(snapshot.attempt.fdc.proofJson),
      transactionId: originalTransactionId,
      data: recoveryExecutionData({
        stage: 'RECOVERY_ORIGINAL',
        originalPackedUserOperationData: originalData,
      }),
    });
    if ('status' in original) return original;

    await this.store.markAttemptRecovered(snapshot);
    return complete();
  }

  private async ensureRecoveryFdc(
    snapshot: RecoveryExecutionSnapshot,
  ): Promise<{ proof: ReturnType<typeof proofFromCheckpoint> } | HandlerResult> {
    if (snapshot.fdc?.status === 'READY' && snapshot.fdc.proofJson) {
      return { proof: proofFromCheckpoint(snapshot.fdc.proofJson) };
    }
    let prepared: PreparedXrpPaymentRequest;
    if (!snapshot.fdc) {
      const result = await this.boundaries.fdc.prepareRequest({
        transactionId: snapshot.request.xrplTxHash!,
      });
      if (result.status === 'PENDING') {
        return retry(result.reason, result.detail, result.retryAfterMs);
      }
      if (result.status === 'FAILED') {
        if (result.retryable) return retry(result.code, result.detail, DEFAULT_RETRY_MS);
        await this.store.saveAttemptFailure(snapshot.attempt.id, result.code, result.detail);
        return complete();
      }
      prepared = result.value;
      await this.store.saveRecoveryFdcPrepared(snapshot.request.id, prepared);
    } else {
      prepared = preparedFromCheckpoint(snapshot.fdc.requestBytes, snapshot.fdc.verifierRequest);
    }

    let submitted: SubmittedXrpPaymentRequest;
    if (!snapshot.fdc || snapshot.fdc.votingRoundId === undefined) {
      const result = await this.boundaries.fdc.submitRequest(prepared);
      if (result.status === 'PENDING') {
        return retry(result.reason, result.detail, result.retryAfterMs);
      }
      if (result.status === 'FAILED') {
        if (result.retryable) return retry(result.code, result.detail, DEFAULT_RETRY_MS);
        await this.store.saveRecoveryFdcFailure(snapshot.request.id, result.code, result.detail);
        return complete();
      }
      submitted = result.value;
      await this.store.saveRecoveryFdcSubmitted(snapshot.request.id, submitted);
    } else {
      submitted = submittedFromCheckpoint(
        snapshot.fdc.requestBytes,
        snapshot.fdc.verifierRequest,
        snapshot.fdc.votingRoundId,
      );
    }
    const proof = await this.boundaries.fdc.pollProof(submitted);
    if (proof.status === 'PENDING') {
      await this.store.saveRecoveryFdcPending(snapshot.request.id, proof.detail);
      return retry(proof.reason, proof.detail, proof.retryAfterMs);
    }
    if (proof.status === 'FAILED') {
      if (proof.retryable) return retry(proof.code, proof.detail, DEFAULT_RETRY_MS);
      await this.store.saveRecoveryFdcFailure(snapshot.request.id, proof.code, proof.detail);
      return complete();
    }
    await this.store.saveRecoveryFdcReady(snapshot.request.id, proof.value);
    return { proof: proof.value };
  }

  private async executeRecoveryStage(
    snapshot: RecoveryExecutionSnapshot,
    input:
      | {
          stage: 'MARKER';
          proof: ReturnType<typeof proofFromCheckpoint>;
          transactionId: Hex;
          data: Hex;
          originalTransactionId: Hex;
          expectedNetMintUBA: bigint;
        }
      | {
          stage: 'ORIGINAL';
          proof: ReturnType<typeof proofFromCheckpoint>;
          transactionId: Hex;
          data: Hex;
        },
  ): Promise<{ evidence: DirectMintReceiptEvidence } | HandlerResult> {
    const checkpoint: RecoveryStageSnapshot | undefined =
      input.stage === 'MARKER' ? snapshot.marker : snapshot.original;
    if (checkpoint?.status === 'CONFIRMED' && checkpoint.evidenceJson) {
      return { evidence: fromJson<DirectMintReceiptEvidence>(checkpoint.evidenceJson) };
    }
    if (checkpoint?.status === 'FAILED') return complete();
    const saved = readFlareCheckpoint(checkpoint?.receiptJson);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
    if (
      checkpoint?.status === 'DELAYED' &&
      saved?.outcome === 'DELAYED' &&
      saved.executionAllowedAt > nowSeconds
    ) {
      return retry(
        'RECOVERY_DIRECT_MINT_DELAYED',
        `Recovery ${input.stage.toLowerCase()} execution is delayed`,
        Number((saved.executionAllowedAt - nowSeconds) * 1_000n),
      );
    }
    const newExecution = checkpoint === undefined || checkpoint.status === 'DELAYED';
    const executionGeneration =
      checkpoint === undefined
        ? 0
        : checkpoint.status === 'DELAYED'
          ? checkpoint.executionGeneration + 1
          : checkpoint.executionGeneration;
    const pendingNonce = await this.boundaries.flare.getPendingNonce();
    const reservation = await this.store.reserveRecoveryExecution({
      attemptId: snapshot.attempt.id,
      recoveryRequestId: snapshot.request.id,
      recoveryGeneration: snapshot.request.generation,
      stage: input.stage,
      executionGeneration,
      executorAddress: this.boundaries.flare.executorAddress,
      pendingNonce,
    });
    const request: DirectMintFinalizeRequest =
      input.stage === 'MARKER'
        ? {
            purpose: 'RECOVERY_MARKER',
            executorNonce: reservation.executorNonce,
            proof: input.proof,
            data: input.data,
            transactionId: input.transactionId,
            personalAccount: getAddress(snapshot.attempt.personalAccount),
            originalTransactionId: input.originalTransactionId,
            expectedNetMintUBA: input.expectedNetMintUBA,
          }
        : {
            purpose: 'RECOVERY_ORIGINAL',
            executorNonce: reservation.executorNonce,
            proof: input.proof,
            data: input.data,
            transactionId: input.transactionId,
            personalAccount: getAddress(snapshot.attempt.personalAccount),
            declaredTotalCallValue: 0n,
            nonce: BigInt(snapshot.attempt.quote.personalAccountNonce),
          };
    const result =
      newExecution || !checkpoint?.transactionHash
        ? await this.boundaries.flare.finalize(request, (transactionHash) =>
            this.store.recordRecoveryBroadcast({
              recoveryRequestId: snapshot.request.id,
              stage: input.stage,
              executionGeneration,
              transactionHash,
            }),
          )
        : await this.boundaries.flare.resume(request, normalizeBytes32(checkpoint.transactionHash));
    if (result.status === 'FAILED') {
      if (result.retryable) return retry(result.code, result.detail, DEFAULT_RETRY_MS);
      await this.store.saveRecoveryExecutionFailure({
        recoveryRequestId: snapshot.request.id,
        stage: input.stage,
        executionGeneration,
        code: result.code,
        detail: result.detail,
      });
      await this.store.saveAttemptFailure(snapshot.attempt.id, result.code, result.detail);
      return complete();
    }
    await this.store.saveRecoveryExecutionResult({
      recoveryRequestId: snapshot.request.id,
      stage: input.stage,
      executionGeneration,
      result,
    });
    if (result.status === 'PENDING') {
      const delay =
        result.executionAllowedAt > nowSeconds
          ? Number((result.executionAllowedAt - nowSeconds) * 1_000n)
          : DEFAULT_RETRY_MS;
      return retry(result.reason, result.detail, Math.max(delay, DEFAULT_RETRY_MS));
    }
    return { evidence: result.evidence };
  }

  private async submitFlare(attemptId: string): Promise<HandlerResult> {
    const attempt = await this.store.loadAttempt(attemptId);
    if (attempt.status === 'FLARE_CONFIRMED' || attempt.status === 'SETTLED') {
      await this.store.ensureJob(attempt.id, 'INDEX_EVENTS');
      return complete();
    }
    const checkpoint = readFlareCheckpoint(attempt.flareCheckpoint?.receiptJson);
    if (
      checkpoint?.outcome === 'READY' &&
      (attempt.status === 'FDC_READY' || attempt.status === 'FLARE_SUBMITTED')
    ) {
      if (attempt.status === 'FDC_READY') {
        await this.store.transition(attempt.id, 'FDC_READY', 'FLARE_SUBMITTED');
      }
      await this.store.transition(attempt.id, 'FLARE_SUBMITTED', 'FLARE_CONFIRMED');
      await this.store.ensureJob(attempt.id, 'INDEX_EVENTS');
      return complete();
    }
    if (attempt.status !== 'FDC_READY') {
      return retry('INVALID_STATE', `SUBMIT_FLARE cannot run from ${attempt.status}`, 60_000);
    }
    if (
      checkpoint?.outcome === 'DELAYED' &&
      checkpoint.executionAllowedAt > BigInt(Math.floor(Date.now() / 1_000))
    ) {
      return retry(
        'DIRECT_MINT_DELAYED',
        'Persisted direct mint is delayed; retry the same proof after executionAllowedAt',
        Number((checkpoint.executionAllowedAt - BigInt(Math.floor(Date.now() / 1_000))) * 1_000n),
      );
    }
    const delayedExecutionReady = checkpoint?.outcome === 'DELAYED';
    const reservationGeneration =
      (attempt.flareCheckpoint?.reservationGeneration ?? 0) + (delayedExecutionReady ? 1 : 0);
    if (!attempt.xrplTxHash || !attempt.fdc?.proofJson) {
      return this.failFlare(attempt, 'EVIDENCE_MISSING', 'FDC proof checkpoint is missing');
    }
    if (attempt.quote.settlementDeadline.getTime() <= Date.now()) {
      return this.failFlare(
        attempt,
        'SETTLEMENT_DEADLINE_EXPIRED',
        'The immutable settlement deadline passed before Coston2 submission',
      );
    }
    const pendingNonce = await this.boundaries.flare.getPendingNonce();
    const executorNonce = await this.store.reserveExecutorNonce(
      attempt.id,
      reservationGeneration,
      '114',
      this.boundaries.flare.executorAddress,
      pendingNonce,
    );
    const packedBytes = decryptSensitive(attempt.quote.userOpDataEnc, {
      key: this.encryptionKey,
      aad: `quote:${attempt.quote.id}`,
    });
    const data = `0x${packedBytes.toString('hex')}`;
    if (!isHex(data) || data === '0x') {
      return this.failFlare(attempt, 'USER_OP_INVALID', 'Decrypted user operation is not hex');
    }
    const finalizeRequest = {
      purpose: 'SETTLEMENT',
      executorNonce,
      proof: proofFromCheckpoint(attempt.fdc.proofJson),
      data,
      transactionId: normalizeBytes32(attempt.xrplTxHash),
      personalAccount: getAddress(attempt.personalAccount),
      declaredTotalCallValue: 0n,
      nonce: BigInt(attempt.quote.personalAccountNonce),
      paymentId: normalizeBytes32(attempt.paymentId),
    } as const;
    const result =
      attempt.flareCheckpoint === undefined || delayedExecutionReady
        ? await this.boundaries.flare.finalize(finalizeRequest, (transactionHash) =>
            this.store.recordFlareBroadcast(
              attempt.id,
              reservationGeneration,
              executorNonce,
              transactionHash,
            ),
          )
        : await this.boundaries.flare.resume(
            finalizeRequest,
            normalizeBytes32(attempt.flareCheckpoint.transactionHash),
          );
    if (result.status === 'FAILED') {
      if (result.retryable) return retry(result.code, result.detail, DEFAULT_RETRY_MS);
      return this.failFlare(attempt, result.code, result.detail);
    }
    await this.store.saveFlareFinalization(attempt, reservationGeneration, executorNonce, result);
    if (result.status === 'PENDING') {
      const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
      const delayMs =
        result.executionAllowedAt > nowSeconds
          ? Number((result.executionAllowedAt - nowSeconds) * 1_000n)
          : DEFAULT_RETRY_MS;
      return retry(result.reason, result.detail, Math.max(delayMs, DEFAULT_RETRY_MS));
    }
    await this.store.transition(attempt.id, 'FDC_READY', 'FLARE_SUBMITTED');
    await this.store.transition(attempt.id, 'FLARE_SUBMITTED', 'FLARE_CONFIRMED');
    await this.store.ensureJob(attempt.id, 'INDEX_EVENTS');
    return complete();
  }

  private async indexEvents(attemptId: string): Promise<HandlerResult> {
    const attempt = await this.store.loadAttempt(attemptId);
    if (attempt.status === 'SETTLED') return complete();
    if (attempt.status !== 'FLARE_CONFIRMED') {
      return retry('INVALID_STATE', `INDEX_EVENTS cannot run from ${attempt.status}`, 60_000);
    }
    if (!attempt.paymentSettled) {
      return retry(
        'PAYMENT_SETTLED_EVENT_PENDING',
        'No decoded PayMorphRouter.PaymentSettled event has been persisted',
        DEFAULT_RETRY_MS,
      );
    }
    await this.store.settleFromPaymentEvent(attempt);
    return complete();
  }

  private async failXrpl(
    attempt: AttemptSnapshot,
    code: string,
    detail: string,
  ): Promise<HandlerResult> {
    await this.store.saveAttemptFailure(attempt.id, code, detail);
    await this.store.transition(attempt.id, 'XRPL_SIGNED', 'XRPL_FAILED');
    return complete();
  }

  private async failFdc(
    attempt: AttemptSnapshot,
    code: string,
    detail: string,
  ): Promise<HandlerResult> {
    if (attempt.fdc) await this.store.saveFdcFailure(attempt.id, code, detail);
    await this.store.saveAttemptFailure(attempt.id, code, detail);
    await this.store.transition(attempt.id, attempt.status, 'RECOVERY_REQUIRED');
    return complete();
  }

  private handleFdcFailure(
    attempt: AttemptSnapshot,
    result: { code: string; retryable: boolean; detail: string },
  ): Promise<HandlerResult> | HandlerResult {
    if (result.retryable) return retry(result.code, result.detail, DEFAULT_RETRY_MS);
    return this.failFdc(attempt, result.code, result.detail);
  }

  private async failFlare(
    attempt: AttemptSnapshot,
    code: string,
    detail: string,
  ): Promise<HandlerResult> {
    await this.store.saveAttemptFailure(attempt.id, code, detail);
    await this.store.transition(attempt.id, 'FDC_READY', 'EXECUTION_REVERTED');
    return complete();
  }
}

function readFlareCheckpoint(
  value: unknown,
):
  | { readonly outcome: 'READY' }
  | { readonly outcome: 'DELAYED'; readonly executionAllowedAt: bigint }
  | undefined {
  if (value === undefined || value === null) return undefined;
  const decoded = fromJson<unknown>(value);
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return undefined;
  const record = decoded as Record<string, unknown>;
  if (record.outcome === 'READY') return { outcome: 'READY' };
  if (record.outcome === 'DELAYED' && typeof record.executionAllowedAt === 'bigint') {
    return { outcome: 'DELAYED', executionAllowedAt: record.executionAllowedAt };
  }
  return undefined;
}

function normalizeBytes32(value: string): Hex {
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  if (!isHex(hex)) throw new TypeError('Expected a hex identifier');
  return padHex(hex, { size: 32 });
}

function hasReached(current: string, threshold: 'XRPL_VALIDATED' | 'FLARE_SUBMITTED'): boolean {
  const order = [
    'XRPL_SIGNED',
    'XRPL_VALIDATED',
    'USEROP_UPLOADED',
    'FDC_REQUESTED',
    'FDC_READY',
    'FLARE_SUBMITTED',
    'FLARE_CONFIRMED',
    'SETTLED',
  ];
  return order.indexOf(current) >= order.indexOf(threshold);
}

function complete(): HandlerResult {
  return { status: 'COMPLETE' };
}

function retry(code: string, detail: string, retryAfterMs: number): HandlerResult {
  return { status: 'RETRY', code, detail, retryAfterMs };
}
