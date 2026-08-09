/* eslint-disable @typescript-eslint/unbound-method -- Vitest verifies injected method spies. */
import { encryptSensitive } from '@paymorph/shared';
import { describe, expect, it, vi } from 'vitest';
import { ExecutorHandlers } from '../src/worker/handlers.js';
import type { AttemptSnapshot, ExecutorBoundaries, ExecutorStore } from '../src/worker/types.js';

const KEY = Buffer.alloc(32, 7);
const TX_HASH = 'A'.repeat(64);
const MEMO = `FE${'00'.repeat(9)}${'11'.repeat(32)}`;
const PAYER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const DESTINATION = 'rLs1MzkFWCxTbuAHgjeTZK4fcCDDnf2KRv';
const PERSONAL_ACCOUNT = '0x1000000000000000000000000000000000000001';
const PAYMENT_ID = `0x${'22'.repeat(32)}`;

describe('executor handler orchestration', () => {
  it('validates the exact XRPL quote, waits for three ledgers, then enqueues FDC', async () => {
    const snapshot = attempt({ status: 'XRPL_SIGNED' });
    const store = fakeStore(snapshot);
    const boundaries = fakeBoundaries();
    boundaries.xrpl.getTransaction = vi.fn().mockResolvedValue(validatedPayment());
    boundaries.xrpl.getValidatedLedgerIndex = vi.fn().mockResolvedValue(102);
    const handler = new ExecutorHandlers(store, boundaries, KEY, 3);

    await expect(
      handler.handle({ id: 'job-1', attemptId: snapshot.id, jobType: 'VALIDATE_XRPL' }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(store.recordXrplValidated).toHaveBeenCalledWith(
      snapshot.id,
      expect.objectContaining({
        transactionHash: TX_HASH,
        ledgerIndex: 100,
        amountDrops: '1200000',
        memoHex: MEMO,
      }),
    );
    expect(store.transition).toHaveBeenCalledWith(snapshot.id, 'XRPL_SIGNED', 'XRPL_VALIDATED');
    expect(store.ensureJob).toHaveBeenCalledWith(snapshot.id, 'REQUEST_FDC');
  });

  it('persists every FDC checkpoint before advancing to FDC_READY', async () => {
    const snapshot = attempt({ status: 'XRPL_VALIDATED' });
    const store = fakeStore(snapshot);
    const prepared = {
      transactionId: `0x${TX_HASH}`,
      proofOwner: '0x2000000000000000000000000000000000000002',
      abiEncodedRequest: '0x1234',
    } as const;
    const submitted = {
      ...prepared,
      requestTransactionHash: `0x${'33'.repeat(32)}` as const,
      requestBlockNumber: 50n,
      votingRoundId: 9n,
    };
    const proof = { merkleProof: [], data: {} } as never;
    const boundaries = fakeBoundaries();
    boundaries.fdc.prepareRequest = vi.fn().mockResolvedValue({ status: 'READY', value: prepared });
    boundaries.fdc.submitRequest = vi.fn().mockResolvedValue({ status: 'READY', value: submitted });
    boundaries.fdc.pollProof = vi.fn().mockResolvedValue({ status: 'READY', value: proof });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({ id: 'job-2', attemptId: snapshot.id, jobType: 'REQUEST_FDC' }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(store.saveFdcPrepared).toHaveBeenCalledWith(snapshot.id, prepared);
    expect(store.saveFdcSubmitted).toHaveBeenCalledWith(snapshot.id, submitted);
    expect(store.saveFdcReady).toHaveBeenCalledWith(snapshot.id, proof);
    expect(store.transition).toHaveBeenNthCalledWith(
      1,
      snapshot.id,
      'XRPL_VALIDATED',
      'FDC_REQUESTED',
    );
    expect(store.transition).toHaveBeenNthCalledWith(2, snapshot.id, 'FDC_REQUESTED', 'FDC_READY');
    expect(store.ensureJob).toHaveBeenCalledWith(snapshot.id, 'SUBMIT_FLARE');
  });

  it('decrypts the immutable quote bytes with quote-bound AAD before finalization', async () => {
    const packed = Buffer.from('1234', 'hex');
    const snapshot = attempt({
      status: 'FDC_READY',
      fdc: {
        status: 'READY',
        requestBytes: '0x1234',
        verifierRequest: {},
        votingRoundId: 9n,
        proofJson: { merkleProof: [], data: {} },
      },
      userOpDataEnc: encryptSensitive(packed, { key: KEY, aad: 'quote:quote-1' }),
    });
    const store = fakeStore(snapshot);
    const boundaries = fakeBoundaries();
    boundaries.flare.finalize = vi.fn().mockResolvedValue({
      status: 'READY',
      transactionHash: `0x${'44'.repeat(32)}`,
      receipt: {},
      evidence: {
        transactionHash: `0x${'44'.repeat(32)}`,
        blockNumber: 1n,
        smartAccountMint: {},
        masterAccountMint: {},
        recipientsPaid: [{}],
        paymentSettled: {},
      },
    });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({ id: 'job-3', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(boundaries.flare.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        data: '0x1234',
        executorNonce: 21n,
        nonce: 7n,
        paymentId: PAYMENT_ID,
        declaredTotalCallValue: 0n,
      }),
      expect.any(Function),
    );
    expect(store.transition).toHaveBeenNthCalledWith(
      1,
      snapshot.id,
      'FDC_READY',
      'FLARE_SUBMITTED',
    );
    expect(store.reserveExecutorNonce).toHaveBeenCalledWith(
      snapshot.id,
      0,
      '114',
      '0x2000000000000000000000000000000000000002',
      21n,
    );
    expect(store.transition).toHaveBeenNthCalledWith(
      2,
      snapshot.id,
      'FLARE_SUBMITTED',
      'FLARE_CONFIRMED',
    );
  });

  it('resumes a persisted successful Flare checkpoint without submitting again', async () => {
    const snapshot = attempt({
      status: 'FLARE_SUBMITTED',
      flareCheckpoint: {
        transactionHash: `0x${'44'.repeat(32)}`,
        executorNonce: 21n,
        reservationGeneration: 0,
        receiptJson: { outcome: 'READY' },
      },
    });
    const store = fakeStore(snapshot);
    const boundaries = fakeBoundaries();
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({ id: 'job-restart', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(boundaries.flare.finalize).not.toHaveBeenCalled();
    expect(store.transition).toHaveBeenCalledWith(
      snapshot.id,
      'FLARE_SUBMITTED',
      'FLARE_CONFIRMED',
    );
    expect(store.ensureJob).toHaveBeenCalledWith(snapshot.id, 'INDEX_EVENTS');
  });

  it('reuses the durable executor nonce when a submission retry restarts', async () => {
    const snapshot = attempt({
      status: 'FDC_READY',
      fdc: {
        status: 'READY',
        requestBytes: '0x1234',
        verifierRequest: {},
        votingRoundId: 9n,
        proofJson: { merkleProof: [], data: {} },
      },
    });
    const store = fakeStore(snapshot);
    vi.mocked(store.reserveExecutorNonce).mockResolvedValue(31n);
    const boundaries = fakeBoundaries();
    boundaries.flare.getPendingNonce = vi
      .fn()
      .mockResolvedValueOnce(31n)
      .mockResolvedValueOnce(32n);
    boundaries.flare.finalize = vi.fn().mockResolvedValue({
      status: 'FAILED',
      code: 'SUBMISSION_FAILED',
      retryable: true,
      detail: 'receipt temporarily unavailable',
    });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await handler.handle({ id: 'job-retry-1', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' });
    await handler.handle({ id: 'job-retry-2', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' });

    expect(store.reserveExecutorNonce).toHaveBeenNthCalledWith(
      1,
      snapshot.id,
      0,
      '114',
      boundaries.flare.executorAddress,
      31n,
    );
    expect(store.reserveExecutorNonce).toHaveBeenNthCalledWith(
      2,
      snapshot.id,
      0,
      '114',
      boundaries.flare.executorAddress,
      32n,
    );
    expect(boundaries.flare.finalize).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ executorNonce: 31n }),
      expect.any(Function),
    );
    expect(boundaries.flare.finalize).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ executorNonce: 31n }),
      expect.any(Function),
    );
  });

  it('stops an expired immutable settlement before reserving a nonce or simulating', async () => {
    const snapshot = attempt({
      status: 'FDC_READY',
      fdc: {
        status: 'READY',
        requestBytes: '0x1234',
        verifierRequest: {},
        votingRoundId: 9n,
        proofJson: { merkleProof: [], data: {} },
      },
      quote: {
        ...attempt().quote,
        settlementDeadline: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    const store = fakeStore(snapshot);
    const boundaries = fakeBoundaries();
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({ id: 'job-expired', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(store.saveAttemptFailure).toHaveBeenCalledWith(
      snapshot.id,
      'SETTLEMENT_DEADLINE_EXPIRED',
      'The immutable settlement deadline passed before Coston2 submission',
    );
    expect(store.transition).toHaveBeenCalledWith(snapshot.id, 'FDC_READY', 'EXECUTION_REVERTED');
    expect(boundaries.flare.getPendingNonce).not.toHaveBeenCalled();
    expect(boundaries.flare.finalize).not.toHaveBeenCalled();
  });

  it('resumes a checkpointed broadcast hash instead of broadcasting a replacement', async () => {
    const transactionHash = `0x${'66'.repeat(32)}`;
    const snapshot = attempt({
      status: 'FDC_READY',
      fdc: {
        status: 'READY',
        requestBytes: '0x1234',
        verifierRequest: {},
        votingRoundId: 9n,
        proofJson: { merkleProof: [], data: {} },
      },
      flareCheckpoint: {
        transactionHash,
        executorNonce: 21n,
        reservationGeneration: 0,
      },
    });
    const store = fakeStore(snapshot);
    const boundaries = fakeBoundaries();
    boundaries.flare.resume = vi.fn().mockResolvedValue({
      status: 'FAILED',
      code: 'SUBMISSION_FAILED',
      retryable: true,
      detail: 'receipt pending',
      transactionHash,
    });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({ id: 'job-resume', attemptId: snapshot.id, jobType: 'SUBMIT_FLARE' }),
    ).resolves.toMatchObject({ status: 'RETRY', code: 'SUBMISSION_FAILED' });

    expect(boundaries.flare.finalize).not.toHaveBeenCalled();
    expect(boundaries.flare.resume).toHaveBeenCalledWith(
      expect.objectContaining({ executorNonce: 21n }),
      transactionHash,
    );
  });

  it('uses a new nonce generation for the same proof after a delayed mint becomes executable', async () => {
    const snapshot = attempt({
      status: 'FDC_READY',
      fdc: {
        status: 'READY',
        requestBytes: '0x1234',
        verifierRequest: {},
        votingRoundId: 9n,
        proofJson: { merkleProof: [], data: {} },
      },
      flareCheckpoint: {
        transactionHash: `0x${'77'.repeat(32)}`,
        executorNonce: 21n,
        reservationGeneration: 0,
        receiptJson: {
          outcome: 'DELAYED',
          executionAllowedAt: { $paymorphBigInt: '1' },
        },
      },
    });
    const store = fakeStore(snapshot);
    vi.mocked(store.reserveExecutorNonce).mockResolvedValue(22n);
    const boundaries = fakeBoundaries();
    boundaries.flare.getPendingNonce = vi.fn().mockResolvedValue(22n);
    boundaries.flare.finalize = vi.fn().mockResolvedValue({
      status: 'FAILED',
      code: 'SUBMISSION_FAILED',
      retryable: true,
      detail: 'replacement pending',
    });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await handler.handle({
      id: 'job-delayed-generation',
      attemptId: snapshot.id,
      jobType: 'SUBMIT_FLARE',
    });

    expect(store.reserveExecutorNonce).toHaveBeenCalledWith(
      snapshot.id,
      1,
      '114',
      boundaries.flare.executorAddress,
      22n,
    );
    expect(boundaries.flare.resume).not.toHaveBeenCalled();
    expect(boundaries.flare.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ executorNonce: 22n }),
      expect.any(Function),
    );
  });

  it('keeps INDEX_EVENTS pending until PaymentSettled exists, then settles from it', async () => {
    const missing = attempt({ status: 'FLARE_CONFIRMED' });
    const missingStore = fakeStore(missing);
    const handler = new ExecutorHandlers(missingStore, fakeBoundaries(), KEY);

    await expect(
      handler.handle({ id: 'job-4', attemptId: missing.id, jobType: 'INDEX_EVENTS' }),
    ).resolves.toMatchObject({ status: 'RETRY', code: 'PAYMENT_SETTLED_EVENT_PENDING' });
    expect(missingStore.settleFromPaymentEvent).not.toHaveBeenCalled();

    const evidenced = attempt({
      status: 'FLARE_CONFIRMED',
      paymentSettled: {
        chainId: '114',
        txHash: `0x${'55'.repeat(32)}`,
        logIndex: 4,
        blockNumber: 88n,
        payload: { asset: 'FXRP' },
      },
    });
    const evidencedStore = fakeStore(evidenced);
    const evidencedHandler = new ExecutorHandlers(evidencedStore, fakeBoundaries(), KEY);
    await expect(
      evidencedHandler.handle({
        id: 'job-5',
        attemptId: evidenced.id,
        jobType: 'INDEX_EVENTS',
      }),
    ).resolves.toEqual({ status: 'COMPLETE' });
    expect(evidencedStore.settleFromPaymentEvent).toHaveBeenCalledWith(evidenced);
  });

  it('validates a signed 0xE0 recovery generation before queuing recovery FDC', async () => {
    const recoveryMemo = `E000${'00'.repeat(8)}${TX_HASH}`;
    const snapshot = attempt({ status: 'RECOVERY_REQUIRED' });
    const store = fakeStore(snapshot);
    vi.mocked(store.loadRecoveryRequest).mockResolvedValue({
      id: 'recovery-1',
      attemptId: snapshot.id,
      generation: 2,
      status: 'XRPL_SIGNED',
      xrplTxHash: TX_HASH,
      requestJson: recoveryRequestJson(recoveryMemo),
    });
    const boundaries = fakeBoundaries();
    vi.mocked(boundaries.xrpl.getTransaction).mockResolvedValue(
      validatedRecoveryPayment(recoveryMemo),
    );
    vi.mocked(boundaries.xrpl.getValidatedLedgerIndex).mockResolvedValue(103);
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({
        id: 'recovery-job',
        attemptId: snapshot.id,
        jobType: 'VALIDATE_RECOVERY_XRPL',
        generation: 2,
      }),
    ).resolves.toEqual({ status: 'COMPLETE' });
    expect(store.recordRecoveryXrplValidated).toHaveBeenCalledWith(
      snapshot.id,
      2,
      expect.objectContaining({
        transactionHash: TX_HASH,
        memoHex: recoveryMemo,
      }),
    );
    expect(store.saveRecoveryValidationFailure).not.toHaveBeenCalled();
  });

  it('rejects a recovery memo that targets a different original payment', async () => {
    const recoveryMemo = `E000${'00'.repeat(8)}${'B'.repeat(64)}`;
    const snapshot = attempt({ status: 'RECOVERY_REQUIRED' });
    const store = fakeStore(snapshot);
    vi.mocked(store.loadRecoveryRequest).mockResolvedValue({
      id: 'recovery-1',
      attemptId: snapshot.id,
      generation: 2,
      status: 'XRPL_SIGNED',
      xrplTxHash: 'C'.repeat(64),
      requestJson: recoveryRequestJson(recoveryMemo),
    });
    const boundaries = fakeBoundaries();
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({
        id: 'recovery-job',
        attemptId: snapshot.id,
        jobType: 'VALIDATE_RECOVERY_XRPL',
        generation: 2,
      }),
    ).resolves.toEqual({ status: 'COMPLETE' });
    expect(store.saveRecoveryValidationFailure).toHaveBeenCalledWith(
      snapshot.id,
      2,
      'RECOVERY_EXPECTATION_INVALID',
      'Recovery E0 memo does not target the original XRP transaction',
    );
    expect(boundaries.xrpl.getTransaction).not.toHaveBeenCalled();
  });

  it('checkpoints recovery FDC and executes marker before the original proof', async () => {
    const recoveryTransactionHash = 'C'.repeat(64);
    const recoveryMemo = `E000${'00'.repeat(8)}${TX_HASH}`;
    const originalProof = { merkleProof: [], data: { original: true } };
    const recoveryProof = { merkleProof: [], data: { recovery: true } };
    const snapshot = attempt({
      status: 'RECOVERY_REQUIRED',
      fdc: {
        status: 'READY',
        requestBytes: '0x1111',
        verifierRequest: {},
        votingRoundId: 8n,
        proofJson: originalProof,
      },
    });
    const store = fakeStore(snapshot);
    vi.mocked(store.loadRecoveryExecution).mockResolvedValue({
      attempt: snapshot,
      request: {
        id: 'recovery-1',
        attemptId: snapshot.id,
        generation: 2,
        status: 'XRPL_VALIDATED',
        xrplTxHash: recoveryTransactionHash,
        requestJson: recoveryRequestJson(recoveryMemo),
      },
    });
    vi.mocked(store.reserveRecoveryExecution)
      .mockResolvedValueOnce({ reservationGeneration: -200_001, executorNonce: 31n })
      .mockResolvedValueOnce({ reservationGeneration: -250_001, executorNonce: 32n });
    const prepared = {
      transactionId: `0x${recoveryTransactionHash}`,
      proofOwner: '0x2000000000000000000000000000000000000002',
      abiEncodedRequest: '0x1234',
    } as const;
    const submitted = {
      ...prepared,
      requestTransactionHash: `0x${'D'.repeat(64)}` as const,
      requestBlockNumber: 50n,
      votingRoundId: 9n,
    };
    const boundaries = fakeBoundaries();
    vi.mocked(boundaries.fdc.prepareRequest).mockResolvedValue({
      status: 'READY',
      value: prepared,
    });
    vi.mocked(boundaries.fdc.submitRequest).mockResolvedValue({
      status: 'READY',
      value: submitted,
    });
    vi.mocked(boundaries.fdc.pollProof).mockResolvedValue({
      status: 'READY',
      value: recoveryProof as never,
    });
    vi.mocked(boundaries.flare.finalize)
      .mockResolvedValueOnce({
        status: 'READY',
        transactionHash: `0x${'E'.repeat(64)}`,
        receipt: {} as never,
        evidence: { stage: 'marker' } as never,
      })
      .mockResolvedValueOnce({
        status: 'READY',
        transactionHash: `0x${'F'.repeat(64)}`,
        receipt: {} as never,
        evidence: { stage: 'original' } as never,
      });
    const handler = new ExecutorHandlers(store, boundaries, KEY);

    await expect(
      handler.handle({
        id: 'recovery-fdc-job',
        attemptId: snapshot.id,
        jobType: 'REQUEST_RECOVERY_FDC',
        generation: 2,
      }),
    ).resolves.toEqual({ status: 'COMPLETE' });

    expect(store.saveRecoveryFdcPrepared).toHaveBeenCalledWith('recovery-1', prepared);
    expect(store.saveRecoveryFdcSubmitted).toHaveBeenCalledWith('recovery-1', submitted);
    expect(store.saveRecoveryFdcReady).toHaveBeenCalledWith('recovery-1', recoveryProof);
    expect(boundaries.flare.finalize).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        purpose: 'RECOVERY_MARKER',
        transactionId: `0x${recoveryTransactionHash}`,
        originalTransactionId: `0x${TX_HASH}`,
        expectedNetMintUBA: 1_000_000n,
        executorNonce: 31n,
        data: '0x',
      }),
      expect.any(Function),
    );
    expect(boundaries.flare.finalize).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        purpose: 'RECOVERY_ORIGINAL',
        transactionId: `0x${TX_HASH}`,
        executorNonce: 32n,
        nonce: 7n,
      }),
      expect.any(Function),
    );
    expect(store.saveRecoveryExecutionResult).toHaveBeenCalledTimes(2);
    expect(store.markAttemptRecovered).toHaveBeenCalledOnce();
    const recoveredSnapshot = vi.mocked(store.markAttemptRecovered).mock.calls[0]?.[0];
    expect(recoveredSnapshot?.request.id).toBe('recovery-1');
  });
});

function attempt(
  overrides: Partial<AttemptSnapshot> & { userOpDataEnc?: string } = {},
): AttemptSnapshot {
  const userOpDataEnc =
    overrides.userOpDataEnc ??
    encryptSensitive(Buffer.from('1234', 'hex'), { key: KEY, aad: 'quote:quote-1' });
  return {
    id: 'attempt-1',
    status: 'XRPL_SIGNED',
    paymentId: PAYMENT_ID,
    payerXrplAccount: PAYER,
    personalAccount: PERSONAL_ACCOUNT,
    xrplTxHash: TX_HASH,
    xrplLastLedgerSequence: 120n,
    quote: {
      id: 'quote-1',
      payerXrplAccount: PAYER,
      personalAccount: PERSONAL_ACCOUNT,
      personalAccountNonce: '7',
      xrplPaymentDrops: '1200000',
      memoHex: MEMO,
      userOpDataEnc,
      directMintAddress: DESTINATION,
      assetManagerAddress: '0x3000000000000000000000000000000000000003',
      fxrpAddress: '0x4000000000000000000000000000000000000004',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      settlementDeadline: new Date('2030-01-01T00:15:00.000Z'),
      route: 'FXRP',
    },
    ...overrides,
  };
}

function fakeStore(snapshot: AttemptSnapshot): ExecutorStore {
  return {
    claim: vi.fn(),
    complete: vi.fn(),
    retry: vi.fn(),
    loadAttempt: vi.fn().mockResolvedValue(snapshot),
    transition: vi.fn(),
    ensureJob: vi.fn(),
    recordXrplValidated: vi.fn(),
    loadRecoveryRequest: vi.fn().mockResolvedValue(null),
    recordRecoveryXrplValidated: vi.fn(),
    saveRecoveryValidationFailure: vi.fn(),
    loadRecoveryExecution: vi.fn().mockResolvedValue(null),
    saveRecoveryFdcPrepared: vi.fn(),
    saveRecoveryFdcSubmitted: vi.fn(),
    saveRecoveryFdcPending: vi.fn(),
    saveRecoveryFdcReady: vi.fn(),
    saveRecoveryFdcFailure: vi.fn(),
    reserveRecoveryExecution: vi.fn(),
    recordRecoveryBroadcast: vi.fn(),
    saveRecoveryExecutionResult: vi.fn(),
    saveRecoveryExecutionFailure: vi.fn(),
    markAttemptRecovered: vi.fn(),
    saveFdcPrepared: vi.fn(),
    saveFdcSubmitted: vi.fn(),
    saveFdcPending: vi.fn(),
    saveFdcReady: vi.fn(),
    saveFdcFailure: vi.fn(),
    reserveExecutorNonce: vi.fn().mockResolvedValue(21n),
    recordFlareBroadcast: vi.fn(),
    saveFlareFinalization: vi.fn(),
    saveAttemptFailure: vi.fn(),
    settleFromPaymentEvent: vi.fn(),
  };
}

function fakeBoundaries(): ExecutorBoundaries {
  return {
    xrpl: {
      getTransaction: vi.fn(),
      getValidatedLedgerIndex: vi.fn(),
    },
    fdc: {
      prepareRequest: vi.fn(),
      submitRequest: vi.fn(),
      pollProof: vi.fn(),
    },
    flare: {
      executorAddress: '0x2000000000000000000000000000000000000002',
      getPendingNonce: vi.fn().mockResolvedValue(21n),
      finalize: vi.fn(),
      resume: vi.fn(),
    },
  };
}

function validatedPayment(): unknown {
  return {
    result: {
      validated: true,
      hash: TX_HASH,
      ledger_index: 100,
      close_time_iso: '2029-12-31T23:59:00.000Z',
      tx_json: {
        TransactionType: 'Payment',
        Account: PAYER,
        Destination: DESTINATION,
        DeliverMax: '1200000',
        LastLedgerSequence: 120,
        Sequence: 5,
        Fee: '12',
        Flags: 0,
        Memos: [{ Memo: { MemoData: MEMO } }],
      },
      meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1200000' },
    },
  };
}

function recoveryRequestJson(memoHex: string): unknown {
  return {
    version: 1,
    network: 'XRPL_TESTNET',
    desiredNetMintUBA: '1000000',
    coston2BlockNumber: '33296723',
    xamanRequest: {
      txjson: {
        TransactionType: 'Payment',
        Destination: DESTINATION,
        Amount: '1200000',
        LastLedgerSequence: 120,
        Memos: [{ Memo: { MemoData: memoHex } }],
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

function validatedRecoveryPayment(memoHex: string): unknown {
  return {
    result: {
      validated: true,
      hash: TX_HASH,
      ledger_index: 100,
      close_time_iso: '2029-12-31T23:59:00.000Z',
      tx_json: {
        TransactionType: 'Payment',
        Account: PAYER,
        Destination: DESTINATION,
        DeliverMax: '1200000',
        LastLedgerSequence: 120,
        Sequence: 6,
        Fee: '12',
        Flags: 0,
        Memos: [{ Memo: { MemoData: memoHex } }],
      },
      meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1200000' },
    },
  };
}
