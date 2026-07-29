import {
  AttemptStatus,
  db,
  JobType,
  PayloadKind,
  PayloadStatus,
  Prisma,
  RecoveryRequestStatus,
} from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { getPayerRuntimeConfig } from '../payer-session/config.js';
import { XamanGateway } from '../xaman/gateway.js';
import type { XamanAuthoritativePayload, XamanResolvedExpectation } from '../xaman/types.js';

const transactionSchema = z
  .object({
    TransactionType: z.literal('Payment'),
    Destination: z.string(),
    Amount: z.string().regex(/^[1-9][0-9]*$/),
    LastLedgerSequence: z.number().int().positive().max(4_294_967_295),
    Memos: z.tuple([
      z
        .object({
          Memo: z
            .object({
              MemoData: z.string().regex(/^E0[A-F0-9]{82}$/),
            })
            .strict(),
        })
        .strict(),
    ]),
  })
  .strict();

const recoveryRequestSnapshotSchema = z
  .object({
    version: z.literal(1),
    network: z.literal('XRPL_TESTNET'),
    desiredNetMintUBA: z.string().regex(/^[1-9][0-9]*$/),
    coston2BlockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/),
    xamanRequest: z
      .object({
        txjson: transactionSchema,
        options: z
          .object({
            submit: z.literal(true),
            force_network: z.literal('TESTNET'),
            expire: z.number().int().positive(),
            return_url: z
              .object({
                app: z.url(),
                web: z.url(),
              })
              .strict(),
          })
          .strict(),
        custom_meta: z
          .object({
            identifier: z.string(),
            instruction: z.string(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type RecoveryRequestSnapshot = z.infer<typeof recoveryRequestSnapshotSchema>;

interface RecoveryGateway {
  getAuthoritativePayload(expected: XamanResolvedExpectation): Promise<XamanAuthoritativePayload>;
}

interface RecoveryNotificationOptions {
  readonly gateway?: RecoveryGateway;
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

export function parseRecoveryRequestSnapshot(value: unknown): RecoveryRequestSnapshot {
  const parsed = recoveryRequestSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'Persisted recovery request snapshot is invalid',
      parsed.error.issues,
    );
  }
  return parsed.data;
}

export function assertAuthoritativeRecoveryRequest(
  authoritative: XamanAuthoritativePayload,
  snapshot: RecoveryRequestSnapshot,
  attemptId: string,
): void {
  if (
    authoritative.kind !== 'PAYMENT' ||
    authoritative.forceNetwork !== 'TESTNET' ||
    authoritative.customIdentifier !== `recovery:${attemptId}`
  ) {
    throw new DomainError(
      'XAMAN_REJECTED',
      'Authoritative recovery payload identity does not match',
    );
  }
  if (snapshot.xamanRequest.custom_meta.identifier !== `recovery:${attemptId}`) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'Persisted recovery custom identifier does not match',
    );
  }

  const actual = transactionSchema.safeParse(authoritative.request);
  if (!actual.success) {
    throw new DomainError(
      'XAMAN_REJECTED',
      'Authoritative recovery transaction contains unexpected fields',
      actual.error.issues,
    );
  }
  if (JSON.stringify(actual.data) !== JSON.stringify(snapshot.xamanRequest.txjson)) {
    throw new DomainError(
      'XAMAN_REJECTED',
      'Authoritative recovery transaction differs from the persisted request',
    );
  }
}

export async function processXamanRecoveryNotification(
  payloadUuid: string,
  options: RecoveryNotificationOptions = {},
): Promise<{ known: boolean; attemptId?: string; signed?: boolean }> {
  const persisted = await db.xamanPayload.findUnique({
    where: { payloadUuid },
    include: {
      attempt: {
        include: {
          payerSession: true,
          recoveryRequests: {
            where: { providerPayloadUuid: payloadUuid },
            take: 1,
          },
        },
      },
    },
  });
  if (persisted === null || persisted.kind !== PayloadKind.RECOVERY || persisted.attempt === null) {
    return { known: false };
  }
  const attempt = persisted.attempt;
  const recoveryRequest = attempt.recoveryRequests[0];
  if (recoveryRequest === undefined) {
    throw new DomainError(
      'RECOVERY_NOT_ELIGIBLE',
      'Recovery payload is missing its durable request snapshot',
    );
  }
  const snapshot = parseRecoveryRequestSnapshot(recoveryRequest.requestJson);
  const authoritative = await (options.gateway ?? getGateway()).getAuthoritativePayload({
    uuid: payloadUuid,
    applicationId: getPayerRuntimeConfig().xamanApiKey,
    kind: 'PAYMENT',
    customIdentifier: `recovery:${attempt.id}`,
    requireSigned: false,
  });
  assertAuthoritativeRecoveryRequest(authoritative, snapshot, attempt.id);

  if (!authoritative.resolved) {
    return { known: true, attemptId: attempt.id, signed: false };
  }
  if (
    !authoritative.signed ||
    authoritative.cancelled ||
    authoritative.expired ||
    authoritative.transactionHash === null
  ) {
    await db.$transaction([
      db.xamanPayload.update({
        where: { payloadUuid },
        data: {
          status: authoritative.expired ? PayloadStatus.EXPIRED : PayloadStatus.REJECTED,
        },
      }),
      db.recoveryRequest.update({
        where: { id: recoveryRequest.id },
        data: { status: RecoveryRequestStatus.FAILED },
      }),
    ]);
    return { known: true, attemptId: attempt.id, signed: false };
  }
  if (
    authoritative.account !== attempt.payerXrplAccount ||
    authoritative.account !== attempt.payerSession.xrplAccount
  ) {
    throw new DomainError('XAMAN_REJECTED', 'Recovery was signed by a different XRP account');
  }

  const recoveryTxHash = authoritative.transactionHash.toUpperCase();
  await db.$transaction(
    async (transaction) => {
      await transaction.xamanPayload.update({
        where: { payloadUuid },
        data: {
          status: PayloadStatus.SIGNED,
          txId: recoveryTxHash,
        },
      });
      const signedRequest = await transaction.recoveryRequest.updateMany({
        where: {
          id: recoveryRequest.id,
          status: RecoveryRequestStatus.SUBMITTED,
          OR: [{ xrplTxHash: null }, { xrplTxHash: recoveryTxHash }],
        },
        data: {
          status: RecoveryRequestStatus.XRPL_SIGNED,
          xrplTxHash: recoveryTxHash,
        },
      });
      const claimed = await transaction.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: AttemptStatus.RECOVERY_REQUIRED,
          recoveryTxHash: null,
        },
        data: {
          recoveryTxHash,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        const current = await transaction.paymentAttempt.findUnique({
          where: { id: attempt.id },
          select: { status: true, recoveryTxHash: true },
        });
        if (
          current === null ||
          current.recoveryTxHash !== recoveryTxHash ||
          (current.status !== AttemptStatus.RECOVERY_REQUIRED &&
            current.status !== AttemptStatus.RECOVERED)
        ) {
          throw new DomainError(
            'XAMAN_REJECTED',
            'Attempt already references a different recovery transaction',
          );
        }
      }
      if (signedRequest.count !== 1) {
        const current = await transaction.recoveryRequest.findUnique({
          where: { id: recoveryRequest.id },
          select: { status: true, xrplTxHash: true },
        });
        if (
          current === null ||
          current.xrplTxHash !== recoveryTxHash ||
          (current.status !== RecoveryRequestStatus.XRPL_SIGNED &&
            current.status !== RecoveryRequestStatus.XRPL_VALIDATED &&
            current.status !== RecoveryRequestStatus.FAILED)
        ) {
          throw new DomainError(
            'XAMAN_REJECTED',
            'Recovery request already references a different transaction',
          );
        }
      }
      if (signedRequest.count !== 1) {
        return;
      }
      await transaction.executorJob.upsert({
        where: {
          attemptId_jobType_generation: {
            attemptId: attempt.id,
            jobType: JobType.VALIDATE_RECOVERY_XRPL,
            generation: recoveryRequest.generation,
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
          jobType: JobType.VALIDATE_RECOVERY_XRPL,
          generation: recoveryRequest.generation,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { known: true, attemptId: attempt.id, signed: true };
}
