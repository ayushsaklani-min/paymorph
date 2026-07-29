/* eslint-disable @typescript-eslint/unbound-method -- Vitest verifies injected boundary spies. */
import type { DirectMintRecoveryDiagnosis } from '@paymorph/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  diagnoseAttemptRecovery,
  type RecoveryAttemptEvidence,
  type RecoveryChainBoundary,
  type RecoveryEvidenceStore,
} from '../src/lib/server/recovery/diagnosis.js';

const TX_HASH = 'ab'.repeat(32);
const PERSONAL_ACCOUNT = '0x1000000000000000000000000000000000000001';
const EXECUTOR = '0x2000000000000000000000000000000000000002';

describe('read-only recovery diagnosis', () => {
  it('returns eligible only from validated DB evidence and a fresh unused on-chain read', async () => {
    const store = fakeStore(evidence());
    const chain = fakeChain(onchain(false));

    await expect(
      diagnoseAttemptRecovery('attempt-1', {
        store,
        chain,
        now: () => new Date('2026-07-27T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      attemptId: 'attempt-1',
      eligible: true,
      reason: 'TRANSACTION_UNUSED',
      originalXrplTxHash: TX_HASH,
      transactionUsed: false,
      settlementFound: false,
      diagnosedAt: '2026-07-27T12:00:00.000Z',
    });
    expect(chain.diagnose).toHaveBeenCalledOnce();
  });

  it('reports settlement evidence as ineligible even if transaction-used state is false', async () => {
    await expect(
      diagnoseAttemptRecovery('attempt-1', {
        store: fakeStore(evidence({ paymentSettledFound: true })),
        chain: fakeChain(onchain(false)),
      }),
    ).resolves.toMatchObject({
      eligible: false,
      reason: 'SETTLEMENT_FOUND',
      transactionUsed: false,
      settlementFound: true,
    });
  });

  it('fails before provider access without validated XRPL evidence', async () => {
    const chain = fakeChain(onchain(false));
    await expect(
      diagnoseAttemptRecovery('attempt-1', {
        store: fakeStore(evidence({ xrplValidatedAt: null })),
        chain,
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_NOT_ELIGIBLE' });
    expect(chain.diagnose).not.toHaveBeenCalled();
  });

  it('fails closed when the Coston2 evidence read is unavailable', async () => {
    const chain: RecoveryChainBoundary = {
      diagnose: vi.fn().mockRejectedValue(new Error('Coston2 RPC unavailable')),
    };
    await expect(
      diagnoseAttemptRecovery('attempt-1', { store: fakeStore(evidence()), chain }),
    ).rejects.toThrow(/Coston2 RPC unavailable/);
  });

  it('rejects a proof-owner binding that differs from a nonzero pinned executor', async () => {
    await expect(
      diagnoseAttemptRecovery('attempt-1', {
        store: fakeStore(evidence({ fdcProofOwner: '0x3000000000000000000000000000000000000003' })),
        chain: fakeChain(onchain(false)),
      }),
    ).resolves.toMatchObject({
      eligible: false,
      reason: 'EXECUTOR_BINDING_MISMATCH',
    });
  });

  it('treats a zero pinned executor as unpinned, matching the official recovery flow', async () => {
    await expect(
      diagnoseAttemptRecovery('attempt-1', {
        store: fakeStore(evidence()),
        chain: fakeChain({ ...onchain(false), pinnedExecutor: `0x${'00'.repeat(20)}` }),
      }),
    ).resolves.toMatchObject({ eligible: true, reason: 'TRANSACTION_UNUSED' });
  });
});

function evidence(overrides: Partial<RecoveryAttemptEvidence> = {}): RecoveryAttemptEvidence {
  return {
    id: 'attempt-1',
    status: 'RECOVERY_REQUIRED',
    xrplTxHash: TX_HASH,
    xrplLedgerIndex: 100n,
    xrplValidatedAt: new Date('2026-07-27T11:00:00.000Z'),
    payerXrplAccount: 'rPayer',
    personalAccount: PERSONAL_ACCOUNT,
    quotePayerXrplAccount: 'rPayer',
    quotePersonalAccount: PERSONAL_ACCOUNT,
    paymentSettledFound: false,
    successfulFinalizationFound: false,
    fdcProofOwner: EXECUTOR,
    ...overrides,
  };
}

function onchain(used: boolean): DirectMintRecoveryDiagnosis {
  return {
    status: used ? 'NOT_ELIGIBLE' : 'ELIGIBLE',
    reason: used ? 'TRANSACTION_ALREADY_USED' : 'TRANSACTION_UNUSED',
    targetTransactionId: `0x${TX_HASH}`,
    personalAccount: PERSONAL_ACCOUNT,
    currentNonce: 9n,
    pinnedExecutor: EXECUTOR,
    requiresPositiveRecoveryNetMint: true,
  };
}

function fakeStore(value: RecoveryAttemptEvidence | null): RecoveryEvidenceStore {
  return { load: vi.fn().mockResolvedValue(value) };
}

function fakeChain(value: DirectMintRecoveryDiagnosis): RecoveryChainBoundary {
  return { diagnose: vi.fn().mockResolvedValue(value) };
}
