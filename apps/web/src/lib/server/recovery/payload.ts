import {
  AttemptStatus,
  db,
  PayloadKind,
  PayloadStatus,
  Prisma,
  RecoveryRequestStatus,
} from '@paymorph/db';
import { decryptSensitive, DomainError, type DirectMintFeeSettings } from '@paymorph/shared';
import { isAddressEqual, type Address } from 'viem';
import { getConfiguredFlareProvider } from '../network.js';
import { getPayerRuntimeConfig } from '../payer-session/config.js';
import { hashPayerSessionToken } from '../payer-session/cookie.js';
import { getCurrentXrplLedgerIndex } from '../xrpl-ledger.js';
import { XamanGateway } from '../xaman/gateway.js';
import { buildXamanRecoveryPayload } from '../xaman/payloads.js';
import type { XamanCreatedPayload, XamanPayloadRequest } from '../xaman/types.js';
import { diagnoseAttemptRecovery, type RecoveryDiagnosisResponse } from './diagnosis.js';
import { buildRecoveryTransactionPlan } from './plan.js';

const RECOVERY_PAYLOAD_TTL_MS = 5 * 60 * 1_000;

export const RECOVERY_WARNING =
  'Recovery signs a separate XRPL Testnet payment. It mints test FXRP to your Coston2 personal account, does not return XRP, and does not settle this invoice. Testnet tokens have no real value.';

interface RecoveryGateway {
  createPayload(request: XamanPayloadRequest): Promise<XamanCreatedPayload>;
}

interface RecoveryRuntime {
  readonly blockNumber: bigint;
  readonly directMintingPaymentAddress: string;
  readonly directMintSettings: DirectMintFeeSettings;
  readonly personalAccount: Address;
}

interface RecoveryPayloadOptions {
  readonly gateway?: RecoveryGateway;
  readonly diagnose?: typeof diagnoseAttemptRecovery;
  readonly loadRuntime?: (payerXrplAccount: string) => Promise<RecoveryRuntime>;
  readonly currentLedgerIndex?: number;
  readonly now?: Date;
}

let cachedGateway: XamanGateway | undefined;

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getGateway(): XamanGateway {
  const config = getPayerRuntimeConfig();
  cachedGateway ??= new XamanGateway({
    apiKey: config.xamanApiKey,
    apiSecret: config.xamanApiSecret,
  });
  return cachedGateway;
}

function publicPayload(
  payload: {
    payloadUuid: string;
    qrPngUrl: string | null;
    deeplinkUrl: string | null;
    websocketUrl: string | null;
    expiresAt: Date;
  },
  attemptId: string,
) {
  if (!payload.qrPngUrl || !payload.deeplinkUrl || !payload.websocketUrl) {
    throw new DomainError('IDEMPOTENCY_CONFLICT', 'Recovery payload creation is unresolved');
  }
  return {
    attemptId,
    payloadUuid: payload.payloadUuid,
    qrPngUrl: payload.qrPngUrl,
    deeplinkUrl: payload.deeplinkUrl,
    websocketUrl: payload.websocketUrl,
    expiresAt: payload.expiresAt.toISOString(),
    recoveryAsset: 'FXRP' as const,
    warning: RECOVERY_WARNING,
  };
}

async function defaultLoadRuntime(payerXrplAccount: string): Promise<RecoveryRuntime> {
  const provider = getConfiguredFlareProvider();
  const contracts = await provider.resolveContracts();
  const [fassets, personalAccountState, latestBlock] = await Promise.all([
    provider.readFAssetsState(contracts),
    provider.readPersonalAccount(payerXrplAccount, contracts),
    provider.client.getBlock({ blockTag: 'latest' }),
  ]);
  return {
    blockNumber: latestBlock.number,
    directMintingPaymentAddress: fassets.directMintingPaymentAddress,
    directMintSettings: fassets.directMintSettings,
    personalAccount: personalAccountState.personalAccount,
  };
}

async function recordRejectedDiagnosis(
  input: {
    merchantId: string;
    payerSessionId: string;
    attemptId: string;
  },
  diagnosis: RecoveryDiagnosisResponse,
): Promise<void> {
  await db.auditLog.create({
    data: {
      merchantId: input.merchantId,
      actorType: 'PAYER',
      actorId: input.payerSessionId,
      action: 'RECOVERY_DIAGNOSED',
      entityType: 'PaymentAttempt',
      entityId: input.attemptId,
      metadata: diagnosis,
    },
  });
}

export async function createRecoveryPayload(
  attemptId: string,
  payerSessionToken: string,
  options: RecoveryPayloadOptions = {},
) {
  const now = options.now ?? new Date();
  const attempt = await db.paymentAttempt.findFirst({
    where: {
      id: attemptId,
      payerSession: {
        sessionTokenHash: hashPayerSessionToken(payerSessionToken),
        expiresAt: { gt: now },
        network: 'XRPL_TESTNET',
      },
    },
    include: {
      invoice: { select: { merchantId: true, publicSlug: true } },
      payerSession: true,
      payloads: {
        where: {
          kind: PayloadKind.RECOVERY,
          status: { in: [PayloadStatus.CREATED, PayloadStatus.OPENED, PayloadStatus.SIGNED] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      recoveryRequests: {
        orderBy: { generation: 'desc' },
        take: 1,
      },
    },
  });
  if (attempt === null) {
    throw new DomainError('FORBIDDEN', 'Attempt is not bound to this active payer session');
  }
  if (
    attempt.payerSession.xrplAccount !== attempt.payerXrplAccount ||
    attempt.payerSessionId !== attempt.payerSession.id
  ) {
    throw new DomainError('FORBIDDEN', 'Payer session account does not own this attempt');
  }

  const existingPayload = attempt.payloads[0];
  if (
    existingPayload !== undefined &&
    (existingPayload.status === PayloadStatus.SIGNED || existingPayload.expiresAt > now)
  ) {
    return publicPayload(existingPayload, attempt.id);
  }
  const latestRequest = attempt.recoveryRequests[0];
  if (latestRequest?.status === RecoveryRequestStatus.PREPARED) {
    throw new DomainError(
      'IDEMPOTENCY_CONFLICT',
      'A recovery provider request has an unresolved outcome',
    );
  }
  if (attempt.status !== AttemptStatus.RECOVERY_REQUIRED) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      `Attempt is ${attempt.status}, not RECOVERY_REQUIRED`,
    );
  }

  if (
    existingPayload !== undefined &&
    existingPayload.status !== PayloadStatus.SIGNED &&
    existingPayload.expiresAt <= now
  ) {
    await db.xamanPayload.updateMany({
      where: {
        id: existingPayload.id,
        status: { not: PayloadStatus.SIGNED },
      },
      data: { status: PayloadStatus.EXPIRED },
    });
  }

  const [runtime, currentLedgerIndex] = await Promise.all([
    (options.loadRuntime ?? defaultLoadRuntime)(attempt.payerXrplAccount),
    options.currentLedgerIndex ?? getCurrentXrplLedgerIndex(),
  ]);
  if (!isAddressEqual(runtime.personalAccount, attempt.personalAccount as Address)) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'Current personal account does not match the original payer binding',
    );
  }

  // This authoritative read is intentionally the last eligibility operation
  // before reserving and creating the external recovery payload.
  const diagnosis = await (options.diagnose ?? diagnoseAttemptRecovery)(attempt.id);
  if (!diagnosis.eligible) {
    await recordRejectedDiagnosis(
      {
        merchantId: attempt.invoice.merchantId,
        payerSessionId: attempt.payerSession.id,
        attemptId: attempt.id,
      },
      diagnosis,
    );
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      `Recovery diagnosis rejected this attempt: ${diagnosis.reason}`,
      diagnosis,
    );
  }

  const plan = buildRecoveryTransactionPlan({
    originalXrplTransactionId: diagnosis.originalXrplTxHash,
    destination: runtime.directMintingPaymentAddress,
    directMintSettings: runtime.directMintSettings,
    currentLedgerIndex,
  });
  const config = getPayerRuntimeConfig();
  const returnUrl = `${config.appUrl}/pay/${encodeURIComponent(
    attempt.invoice.publicSlug,
  )}/status/${attempt.id}`;
  const request = buildXamanRecoveryPayload({
    attemptId: attempt.id,
    destination: plan.destination,
    amountDrops: plan.amountDrops,
    memoHex: plan.memoHex,
    lastLedgerSequence: plan.lastLedgerSequence,
    returnUrl,
  });
  const generation = (latestRequest?.generation ?? -1) + 1;
  const recoveryRequest = await db.$transaction(
    async (transaction) => {
      const claimed = await transaction.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: AttemptStatus.RECOVERY_REQUIRED,
          version: attempt.version,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Recovery payload creation started concurrently',
        );
      }
      const prepared = await transaction.recoveryRequest.create({
        data: {
          attemptId: attempt.id,
          generation,
          requestJson: toInputJson({
            version: 1,
            network: 'XRPL_TESTNET',
            desiredNetMintUBA: plan.desiredNetMintUBA,
            coston2BlockNumber: runtime.blockNumber.toString(10),
            xamanRequest: request,
          }),
          diagnosisJson: diagnosis,
        },
      });
      await transaction.auditLog.create({
        data: {
          merchantId: attempt.invoice.merchantId,
          actorType: 'PAYER',
          actorId: attempt.payerSession.id,
          action: 'RECOVERY_DIAGNOSED',
          entityType: 'PaymentAttempt',
          entityId: attempt.id,
          metadata: {
            ...diagnosis,
            coston2BlockNumber: runtime.blockNumber.toString(10),
            recoveryGeneration: generation,
          },
        },
      });
      return prepared;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const userToken = attempt.payerSession.xamanUserTokenEnc
    ? decryptSensitive(attempt.payerSession.xamanUserTokenEnc, {
        key: config.encryptionKey,
        aad: `payer-session:${attempt.payerSession.id}`,
      }).toString('utf8')
    : undefined;
  const externalRequest = userToken === undefined ? request : { ...request, user_token: userToken };
  const created = await (options.gateway ?? getGateway()).createPayload(externalRequest);
  const expiresAt = new Date(now.getTime() + RECOVERY_PAYLOAD_TTL_MS);

  await db.$transaction(
    [
      db.xamanPayload.create({
        data: {
          attemptId: attempt.id,
          payerSessionId: attempt.payerSession.id,
          kind: PayloadKind.RECOVERY,
          payloadUuid: created.uuid,
          status: PayloadStatus.CREATED,
          qrPngUrl: created.qrPngUrl,
          deeplinkUrl: created.nextUrl,
          websocketUrl: created.websocketUrl,
          expiresAt,
        },
      }),
      db.recoveryRequest.update({
        where: { id: recoveryRequest.id },
        data: {
          status: RecoveryRequestStatus.SUBMITTED,
          providerPayloadUuid: created.uuid,
          expiresAt,
        },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return publicPayload(
    {
      payloadUuid: created.uuid,
      qrPngUrl: created.qrPngUrl,
      deeplinkUrl: created.nextUrl,
      websocketUrl: created.websocketUrl,
      expiresAt,
    },
    attempt.id,
  );
}
