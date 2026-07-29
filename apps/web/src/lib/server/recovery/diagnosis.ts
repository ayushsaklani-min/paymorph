import { db } from '@paymorph/db';
import {
  diagnoseDirectMintRecovery,
  DomainError,
  type DirectMintRecoveryDiagnosis,
} from '@paymorph/shared';
import { getAddress, isAddressEqual, zeroAddress, type Address } from 'viem';
import { getConfiguredFlareProvider } from '../network.js';

const DIAGNOSABLE_STATUSES = new Set([
  'XRPL_VALIDATED',
  'USEROP_UPLOADED',
  'FDC_REQUESTED',
  'FDC_READY',
  'FLARE_SUBMITTED',
  'FLARE_CONFIRMED',
  'SETTLED',
  'EXECUTION_REVERTED',
  'RECOVERY_REQUIRED',
]);

export interface RecoveryAttemptEvidence {
  readonly id: string;
  readonly status: string;
  readonly xrplTxHash: string | null;
  readonly xrplLedgerIndex: bigint | null;
  readonly xrplValidatedAt: Date | null;
  readonly payerXrplAccount: string;
  readonly personalAccount: string;
  readonly quotePayerXrplAccount: string;
  readonly quotePersonalAccount: string;
  readonly paymentSettledFound: boolean;
  readonly successfulFinalizationFound: boolean;
  readonly fdcProofOwner?: string;
}

export interface RecoveryEvidenceStore {
  load(attemptId: string): Promise<RecoveryAttemptEvidence | null>;
}

export interface RecoveryChainBoundary {
  diagnose(input: {
    readonly personalAccount: Address;
    readonly originalTransactionId: string;
  }): Promise<DirectMintRecoveryDiagnosis>;
}

export type RecoveryDiagnosisResponse = {
  readonly attemptId: string;
  readonly eligible: boolean;
  readonly reason: string;
  readonly originalXrplTxHash: string;
  readonly transactionUsed: boolean;
  readonly settlementFound: boolean;
  readonly diagnosedAt: string;
} & Readonly<Record<string, string | boolean>>;

export async function diagnoseAttemptRecovery(
  attemptId: string,
  dependencies: {
    readonly store?: RecoveryEvidenceStore;
    readonly chain?: RecoveryChainBoundary;
    readonly now?: () => Date;
  } = {},
): Promise<RecoveryDiagnosisResponse> {
  const store = dependencies.store ?? prismaRecoveryEvidenceStore;
  const chain = dependencies.chain ?? new Coston2RecoveryChainBoundary();
  const evidence = await store.load(attemptId);
  if (!evidence) {
    throw new DomainError('RECOVERY_NOT_ELIGIBLE', 'Attempt is not diagnosable');
  }
  assertDatabaseEvidence(evidence);

  const onchain = await chain.diagnose({
    personalAccount: getAddress(evidence.personalAccount),
    originalTransactionId: evidence.xrplTxHash!,
  });
  if (!isAddressEqual(onchain.personalAccount, getAddress(evidence.personalAccount))) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'On-chain personal-account evidence is inconsistent',
    );
  }

  const proofOwnerMismatch =
    evidence.fdcProofOwner !== undefined &&
    !isAddressEqual(onchain.pinnedExecutor, zeroAddress) &&
    !isAddressEqual(getAddress(evidence.fdcProofOwner), onchain.pinnedExecutor);
  const transactionUsed = onchain.status === 'NOT_ELIGIBLE';
  const settlementFound = evidence.paymentSettledFound;
  const eligible =
    !transactionUsed &&
    !evidence.paymentSettledFound &&
    !evidence.successfulFinalizationFound &&
    !proofOwnerMismatch;
  const reason = transactionUsed
    ? 'TRANSACTION_ALREADY_USED'
    : evidence.paymentSettledFound
      ? 'SETTLEMENT_FOUND'
      : evidence.successfulFinalizationFound
        ? 'DIRECT_MINT_FINALIZED'
        : proofOwnerMismatch
          ? 'EXECUTOR_BINDING_MISMATCH'
          : 'TRANSACTION_UNUSED';

  return {
    attemptId: evidence.id,
    eligible,
    reason,
    originalXrplTxHash: evidence.xrplTxHash!,
    transactionUsed,
    settlementFound,
    diagnosedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
  };
}

const prismaRecoveryEvidenceStore: RecoveryEvidenceStore = {
  async load(attemptId) {
    const attempt = await db.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        xrplTxHash: true,
        xrplLedgerIndex: true,
        xrplValidatedAt: true,
        payerXrplAccount: true,
        personalAccount: true,
        quote: { select: { payerXrplAccount: true, personalAccount: true } },
        fdcRequest: { select: { verifierRequest: true } },
        chainEvents: {
          where: { chainId: '114', eventName: 'PaymentSettled' },
          select: { id: true },
          take: 1,
        },
        flareSubmissions: { select: { receiptJson: true } },
      },
    });
    if (!attempt) return null;
    return {
      id: attempt.id,
      status: attempt.status,
      xrplTxHash: attempt.xrplTxHash,
      xrplLedgerIndex: attempt.xrplLedgerIndex,
      xrplValidatedAt: attempt.xrplValidatedAt,
      payerXrplAccount: attempt.payerXrplAccount,
      personalAccount: attempt.personalAccount,
      quotePayerXrplAccount: attempt.quote.payerXrplAccount,
      quotePersonalAccount: attempt.quote.personalAccount,
      paymentSettledFound: attempt.chainEvents.length > 0,
      successfulFinalizationFound: attempt.flareSubmissions.some(({ receiptJson }) =>
        isReadyReceipt(receiptJson),
      ),
      ...fdcProofOwner(attempt.fdcRequest?.verifierRequest),
    };
  },
};

class Coston2RecoveryChainBoundary implements RecoveryChainBoundary {
  async diagnose(input: {
    readonly personalAccount: Address;
    readonly originalTransactionId: string;
  }): Promise<DirectMintRecoveryDiagnosis> {
    const provider = getConfiguredFlareProvider();
    const contracts = await provider.resolveContracts();
    return diagnoseDirectMintRecovery({
      publicClient: provider.client,
      masterAccountControllerAddress: contracts.masterAccountController,
      personalAccount: input.personalAccount,
      originalTransactionId: input.originalTransactionId,
    });
  }
}

function assertDatabaseEvidence(evidence: RecoveryAttemptEvidence): void {
  if (
    !DIAGNOSABLE_STATUSES.has(evidence.status) ||
    !evidence.xrplTxHash ||
    evidence.xrplLedgerIndex === null ||
    evidence.xrplValidatedAt === null
  ) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'A validated exact XRPL payment is required for diagnosis',
    );
  }
  if (
    evidence.payerXrplAccount !== evidence.quotePayerXrplAccount ||
    !isAddressEqual(getAddress(evidence.personalAccount), getAddress(evidence.quotePersonalAccount))
  ) {
    throw new DomainError('RECOVERY_NOT_ELIGIBLE', 'Stored payer bindings are inconsistent');
  }
  if (evidence.status === 'SETTLED' && !evidence.paymentSettledFound) {
    throw new DomainError('RECOVERY_NOT_ELIGIBLE', 'Settled attempt lacks chain-event evidence');
  }
}

function isReadyReceipt(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).outcome === 'READY'
  );
}

function fdcProofOwner(value: unknown): { fdcProofOwner?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const proofOwner = (value as Record<string, unknown>).proofOwner;
  return typeof proofOwner === 'string' ? { fdcProofOwner: proofOwner } : {};
}
