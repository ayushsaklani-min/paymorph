import { AttemptStatus, db, JobType, PayloadKind, PayloadStatus, Prisma } from '@paymorph/db';
import { decryptSensitive, DomainError } from '@paymorph/shared';
import { getPayerRuntimeConfig } from '../payer-session/config.js';
import { hashPayerSessionToken } from '../payer-session/cookie.js';
import { getConfiguredFlareProvider, resolveConfiguredNetwork } from '../network.js';
import { buildXamanPaymentPayload, xamanCustomIdentifier } from '../xaman/payloads.js';
import type { XamanAuthoritativePayload, XamanCreatedPayload } from '../xaman/types.js';
import { XamanGateway } from '../xaman/gateway.js';
import { getCurrentXrplLedgerIndex } from '../xrpl-ledger.js';

const PAYMENT_PAYLOAD_TTL_MS = 5 * 60 * 1_000;
const XRPL_LEDGER_SECONDS = 4;
const MINIMUM_LEDGER_WINDOW = 10;
const MAXIMUM_LEDGER_WINDOW = 240;
const PAYMENT_NOTIFICATION_TRANSACTION_RETRIES = 3;

interface PaymentGateway {
  createPayload(request: ReturnType<typeof buildXamanPaymentPayload>): Promise<XamanCreatedPayload>;
  getAuthoritativePayload(
    expected: Parameters<XamanGateway['getAuthoritativePayload']>[0],
  ): Promise<XamanAuthoritativePayload>;
}

interface ServiceOptions {
  gateway?: PaymentGateway;
  now?: Date;
  currentLedgerIndex?: number;
}

async function runPaymentNotificationTransaction<T>(
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let retry = 0; retry < PAYMENT_NOTIFICATION_TRANSACTION_RETRIES; retry += 1) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (retry + 1 < PAYMENT_NOTIFICATION_TRANSACTION_RETRIES && isTransactionConflict(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unable to reconcile Xaman payment notification');
}

function isTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

let cachedGateway: XamanGateway | undefined;

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
    pushedToXaman: boolean;
    expiresAt: Date;
  },
  attemptId: string,
) {
  if (!payload.qrPngUrl || !payload.deeplinkUrl || !payload.websocketUrl) {
    throw new DomainError('INTERNAL_ERROR', 'Stored Xaman payment links are incomplete');
  }
  return {
    attemptId,
    payloadUuid: payload.payloadUuid,
    qrPngUrl: payload.qrPngUrl,
    deeplinkUrl: payload.deeplinkUrl,
    websocketUrl: payload.websocketUrl,
    delivery: payload.pushedToXaman ? ('PUSH' as const) : ('MANUAL' as const),
    expiresAt: payload.expiresAt.toISOString(),
  };
}

function calculateLastLedgerSequence(current: number, quoteExpiresAt: Date, now: Date): number {
  const remainingSeconds = Math.floor((quoteExpiresAt.getTime() - now.getTime()) / 1_000);
  const ledgerWindow = Math.min(
    MAXIMUM_LEDGER_WINDOW,
    Math.floor(remainingSeconds / XRPL_LEDGER_SECONDS),
  );
  if (ledgerWindow < MINIMUM_LEDGER_WINDOW) {
    throw new DomainError('QUOTE_EXPIRED', 'Quote is too close to expiry to sign safely');
  }
  const result = current + ledgerWindow;
  if (!Number.isSafeInteger(result) || result > 4_294_967_295) {
    throw new DomainError('INTERNAL_ERROR', 'XRPL ledger deadline exceeds UInt32');
  }
  return result;
}

export async function createPaymentPayload(
  quoteId: string,
  payerSessionToken: string,
  options: ServiceOptions = {},
) {
  const now = options.now ?? new Date();
  const attempt = await db.paymentAttempt.findFirst({
    where: {
      quoteId,
      payerSession: {
        sessionTokenHash: hashPayerSessionToken(payerSessionToken),
        expiresAt: { gt: now },
      },
    },
    include: {
      quote: true,
      invoice: { select: { publicSlug: true } },
      payerSession: true,
      payloads: {
        where: {
          kind: PayloadKind.PAYMENT,
          status: { in: [PayloadStatus.CREATED, PayloadStatus.OPENED, PayloadStatus.SIGNED] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!attempt || !attempt.payerSession.xrplAccount) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'Quote is not bound to this payer session');
  }
  const existing = attempt.payloads[0];
  if (existing && existing.expiresAt > now) {
    return publicPayload(existing, attempt.id);
  }
  if (attempt.quote.expiresAt <= now) {
    await db.paymentAttempt.updateMany({
      where: { id: attempt.id, status: AttemptStatus.QUOTED },
      data: { status: AttemptStatus.QUOTE_EXPIRED, version: { increment: 1 } },
    });
    throw new DomainError('QUOTE_EXPIRED', 'Quote has expired');
  }
  if (attempt.status !== AttemptStatus.QUOTED) {
    throw new DomainError('IDEMPOTENCY_CONFLICT', `Attempt is already ${attempt.status}`);
  }

  const [network, currentLedgerIndex] = await Promise.all([
    resolveConfiguredNetwork(),
    options.currentLedgerIndex ?? getCurrentXrplLedgerIndex(),
  ]);
  const personalAccountState = await getConfiguredFlareProvider().readPersonalAccount(
    attempt.payerXrplAccount,
    network.contracts,
  );
  if (
    personalAccountState.personalAccount.toLowerCase() !==
      attempt.quote.personalAccount.toLowerCase() ||
    personalAccountState.nonce !== BigInt(attempt.quote.personalAccountNonce.toFixed(0))
  ) {
    throw new DomainError(
      'NONCE_CHANGED',
      'Smart Account nonce changed after quoting; create a fresh quote',
    );
  }

  const lastLedgerSequence = calculateLastLedgerSequence(
    currentLedgerIndex,
    attempt.quote.expiresAt,
    now,
  );
  const config = getPayerRuntimeConfig();
  const userToken = attempt.payerSession.xamanUserTokenEnc
    ? decryptSensitive(attempt.payerSession.xamanUserTokenEnc, {
        key: config.encryptionKey,
        aad: `payer-session:${attempt.payerSession.id}`,
      }).toString('utf8')
    : undefined;
  const gateway = options.gateway ?? getGateway();
  const created = await gateway.createPayload(
    buildXamanPaymentPayload({
      attemptId: attempt.id,
      destination: attempt.quote.directMintAddress,
      amountDrops: attempt.quote.xrplPaymentDrops.toFixed(0),
      memoHex: attempt.quote.memoHex,
      lastLedgerSequence,
      returnUrl: `${config.appUrl}/pay/${encodeURIComponent(attempt.invoice.publicSlug)}/status/${attempt.id}`,
      ...(userToken ? { userToken } : {}),
    }),
  );
  const payloadExpiresAt = new Date(
    Math.min(now.getTime() + PAYMENT_PAYLOAD_TTL_MS, attempt.quote.expiresAt.getTime()),
  );

  try {
    await db.$transaction(
      async (transaction) => {
        const claimed = await transaction.paymentAttempt.updateMany({
          where: { id: attempt.id, status: AttemptStatus.QUOTED, version: attempt.version },
          data: {
            status: AttemptStatus.XAMAN_CREATED,
            version: { increment: 1 },
            xamanPayloadUuid: created.uuid,
            xrplLastLedgerSequence: BigInt(lastLedgerSequence),
          },
        });
        if (claimed.count !== 1) {
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'Payment request was created concurrently');
        }
        await transaction.xamanPayload.create({
          data: {
            attemptId: attempt.id,
            payerSessionId: attempt.payerSession.id,
            kind: PayloadKind.PAYMENT,
            payloadUuid: created.uuid,
            status: PayloadStatus.CREATED,
            qrPngUrl: created.qrPngUrl,
            deeplinkUrl: created.nextUrl,
            websocketUrl: created.websocketUrl,
            pushedToXaman: created.pushed,
            expiresAt: payloadExpiresAt,
          },
        });
        await transaction.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: AttemptStatus.AWAITING_SIGNATURE, version: { increment: 1 } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw error;
  }

  return publicPayload(
    {
      payloadUuid: created.uuid,
      qrPngUrl: created.qrPngUrl,
      deeplinkUrl: created.nextUrl,
      websocketUrl: created.websocketUrl,
      pushedToXaman: created.pushed,
      expiresAt: payloadExpiresAt,
    },
    attempt.id,
  );
}

export async function processXamanPaymentNotification(
  payloadUuid: string,
  options: ServiceOptions = {},
): Promise<{ known: boolean; attemptId?: string; signed?: boolean }> {
  const persisted = await db.xamanPayload.findUnique({
    where: { payloadUuid },
    include: {
      attempt: {
        include: { payerSession: true },
      },
    },
  });
  if (!persisted || persisted.kind !== PayloadKind.PAYMENT || !persisted.attempt) {
    return { known: false };
  }
  const attempt = persisted.attempt;
  const authoritative = await (options.gateway ?? getGateway()).getAuthoritativePayload({
    uuid: payloadUuid,
    applicationId: getPayerRuntimeConfig().xamanApiKey,
    kind: 'PAYMENT',
    customIdentifier: xamanCustomIdentifier('PAYMENT', attempt.id),
    requireSigned: false,
  });

  if (!authoritative.resolved) {
    return { known: true, attemptId: attempt.id, signed: false };
  }
  if (
    !authoritative.signed ||
    authoritative.cancelled ||
    authoritative.expired ||
    !authoritative.transactionHash
  ) {
    await runPaymentNotificationTransaction(async (transaction) => {
      await transaction.xamanPayload.update({
        where: { payloadUuid },
        data: {
          status: authoritative.expired ? PayloadStatus.EXPIRED : PayloadStatus.REJECTED,
        },
      });
      await transaction.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: { in: [AttemptStatus.XAMAN_CREATED, AttemptStatus.AWAITING_SIGNATURE] },
        },
        data: {
          status: authoritative.expired ? AttemptStatus.QUOTE_EXPIRED : AttemptStatus.REJECTED,
          failureCode: authoritative.expired ? 'QUOTE_EXPIRED' : 'XAMAN_REJECTED',
          version: { increment: 1 },
        },
      });
    });
    return { known: true, attemptId: attempt.id, signed: false };
  }
  if (authoritative.account !== attempt.payerXrplAccount) {
    throw new DomainError('XAMAN_REJECTED', 'Payment was signed by a different XRP account');
  }

  await runPaymentNotificationTransaction(async (transaction) => {
    await transaction.xamanPayload.update({
      where: { payloadUuid },
      data: {
        status: PayloadStatus.SIGNED,
        txId: authoritative.transactionHash!.toUpperCase(),
      },
    });
    const updated = await transaction.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: { in: [AttemptStatus.XAMAN_CREATED, AttemptStatus.AWAITING_SIGNATURE] },
      },
      data: {
        status: AttemptStatus.XRPL_SIGNED,
        xrplTxHash: authoritative.transactionHash!.toUpperCase(),
        failureCode: null,
        failureMessage: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 1 || attempt.status === AttemptStatus.XRPL_SIGNED) {
      await transaction.executorJob.upsert({
        where: {
          attemptId_jobType_generation: {
            attemptId: attempt.id,
            jobType: JobType.VALIDATE_XRPL,
            generation: 0,
          },
        },
        update: {
          status: 'READY',
          nextRunAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
        },
        create: {
          attemptId: attempt.id,
          jobType: JobType.VALIDATE_XRPL,
          generation: 0,
        },
      });
    }
  });
  return { known: true, attemptId: attempt.id, signed: true };
}
