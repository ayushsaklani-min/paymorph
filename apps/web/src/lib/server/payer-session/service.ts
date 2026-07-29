import { randomUUID } from 'node:crypto';
import { db, InvoiceStatus, PayloadKind, PayloadStatus } from '@paymorph/db';
import { DomainError, encryptSensitive } from '@paymorph/shared';
import { buildXamanSignInPayload } from '../xaman/payloads.js';
import type { XamanAuthoritativePayload, XamanCreatedPayload } from '../xaman/types.js';
import { XamanGateway } from '../xaman/gateway.js';
import { createPayerSessionToken, hashPayerSessionToken } from './cookie.js';
import { getPayerRuntimeConfig } from './config.js';

const PAYER_SESSION_TTL_MS = 30 * 60 * 1_000;
const SIGN_IN_PAYLOAD_TTL_MS = 5 * 60 * 1_000;
export const PAYER_NETWORK = 'XRPL_TESTNET' as const;

export type PayerSignInStatus = 'CREATED' | 'SIGNED' | 'REJECTED' | 'EXPIRED';

export interface StartPayerSignInResult {
  payerSessionId: string;
  payloadUuid: string;
  qrPngUrl: string;
  deeplinkUrl: string;
  websocketUrl: string;
  expiresAt: Date;
  sessionExpiresAt: Date;
  sessionToken: string;
}

export interface ResolvePayerSignInResult {
  status: PayerSignInStatus;
  xrplAccount: string | null;
  network: typeof PAYER_NETWORK;
}

export async function requireActivePayerSessionId(
  sessionToken: string,
  now = new Date(),
): Promise<string> {
  const session = await db.payerSession.findUnique({
    where: { sessionTokenHash: hashPayerSessionToken(sessionToken) },
    select: { id: true, expiresAt: true },
  });
  if (session === null || session.expiresAt <= now) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
  }
  return session.id;
}

interface SignInGateway {
  createPayload(request: ReturnType<typeof buildXamanSignInPayload>): Promise<XamanCreatedPayload>;
  getAuthoritativePayload(
    expected: Parameters<XamanGateway['getAuthoritativePayload']>[0],
  ): Promise<XamanAuthoritativePayload>;
}

interface ServiceOptions {
  gateway?: SignInGateway;
  now?: Date;
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

function returnUrl(slug: string): string {
  return `${getPayerRuntimeConfig().appUrl}/pay/${encodeURIComponent(slug)}`;
}

function publicResult(
  session: {
    id: string;
    expiresAt: Date;
  },
  payload: {
    payloadUuid: string;
    qrPngUrl: string | null;
    deeplinkUrl: string | null;
    websocketUrl: string | null;
    expiresAt: Date;
  },
  sessionToken: string,
): StartPayerSignInResult | null {
  if (payload.qrPngUrl === null || payload.deeplinkUrl === null || payload.websocketUrl === null) {
    return null;
  }
  return {
    payerSessionId: session.id,
    payloadUuid: payload.payloadUuid,
    qrPngUrl: payload.qrPngUrl,
    deeplinkUrl: payload.deeplinkUrl,
    websocketUrl: payload.websocketUrl,
    expiresAt: payload.expiresAt,
    sessionExpiresAt: session.expiresAt,
    sessionToken,
  };
}

async function findReusableSession(
  invoiceId: string,
  sessionToken: string | null,
  now: Date,
): Promise<StartPayerSignInResult | null> {
  if (sessionToken === null) {
    return null;
  }

  const session = await db.payerSession.findUnique({
    where: { sessionTokenHash: hashPayerSessionToken(sessionToken) },
    include: {
      payloads: {
        where: {
          kind: PayloadKind.SIGN_IN,
          expiresAt: { gt: now },
          status: { in: [PayloadStatus.CREATED, PayloadStatus.OPENED, PayloadStatus.SIGNED] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (
    session === null ||
    session.invoiceId !== invoiceId ||
    session.network !== PAYER_NETWORK ||
    session.expiresAt <= now
  ) {
    return null;
  }

  const payload = session.payloads[0];
  return payload === undefined ? null : publicResult(session, payload, sessionToken);
}

export async function startPayerSignIn(
  invoiceSlug: string,
  currentSessionToken: string | null,
  options: ServiceOptions = {},
): Promise<StartPayerSignInResult> {
  const now = options.now ?? new Date();
  const invoice = await db.invoice.findUnique({
    where: { publicSlug: invoiceSlug },
    select: { id: true, publicSlug: true, status: true, expiresAt: true },
  });
  if (invoice === null || invoice.status !== InvoiceStatus.ACTIVE || invoice.expiresAt <= now) {
    throw new DomainError('INVOICE_NOT_ACTIVE', 'Invoice is not active');
  }

  const reusable = await findReusableSession(invoice.id, currentSessionToken, now);
  if (reusable !== null) {
    return reusable;
  }

  const sessionToken = createPayerSessionToken();
  const sessionExpiresAt = new Date(
    Math.min(invoice.expiresAt.getTime(), now.getTime() + PAYER_SESSION_TTL_MS),
  );
  const payerSession = await db.payerSession.create({
    data: {
      id: randomUUID(),
      invoiceId: invoice.id,
      network: PAYER_NETWORK,
      sessionTokenHash: hashPayerSessionToken(sessionToken),
      expiresAt: sessionExpiresAt,
    },
  });

  try {
    const gateway = options.gateway ?? getGateway();
    const created = await gateway.createPayload(
      buildXamanSignInPayload({
        payerSessionId: payerSession.id,
        returnUrl: returnUrl(invoice.publicSlug),
      }),
    );
    const payloadExpiresAt = new Date(now.getTime() + SIGN_IN_PAYLOAD_TTL_MS);

    await db.$transaction([
      db.xamanPayload.create({
        data: {
          payerSessionId: payerSession.id,
          kind: PayloadKind.SIGN_IN,
          payloadUuid: created.uuid,
          status: PayloadStatus.CREATED,
          qrPngUrl: created.qrPngUrl,
          deeplinkUrl: created.nextUrl,
          websocketUrl: created.websocketUrl,
          expiresAt: payloadExpiresAt,
        },
      }),
      db.payerSession.update({
        where: { id: payerSession.id },
        data: { signInPayloadId: created.uuid },
      }),
    ]);

    return {
      payerSessionId: payerSession.id,
      payloadUuid: created.uuid,
      qrPngUrl: created.qrPngUrl,
      deeplinkUrl: created.nextUrl,
      websocketUrl: created.websocketUrl,
      expiresAt: payloadExpiresAt,
      sessionExpiresAt,
      sessionToken,
    };
  } catch (error) {
    await db.payerSession.deleteMany({
      where: {
        id: payerSession.id,
        signInPayloadId: null,
      },
    });
    throw error;
  }
}

export function statusFromAuthoritativePayload(
  payload: XamanAuthoritativePayload,
  expiresAt: Date,
  now: Date,
): PayerSignInStatus {
  if (payload.resolved && payload.signed) {
    return 'SIGNED';
  }
  if (payload.cancelled || (payload.resolved && !payload.signed)) {
    return 'REJECTED';
  }
  if (payload.expired || expiresAt <= now) {
    return 'EXPIRED';
  }
  return 'CREATED';
}

async function persistAuthoritativeStatus(
  payerSessionId: string,
  payloadUuid: string,
  payloadExpiresAt: Date,
  authoritative: XamanAuthoritativePayload,
  now: Date,
): Promise<ResolvePayerSignInResult> {
  const status = statusFromAuthoritativePayload(authoritative, payloadExpiresAt, now);

  if (status === 'SIGNED') {
    if (authoritative.account === null) {
      throw new DomainError('XAMAN_REJECTED', 'Signed Xaman SignIn has no XRPL account');
    }

    const config = getPayerRuntimeConfig();
    const encryptedUserToken =
      authoritative.issuedUserToken === null
        ? undefined
        : encryptSensitive(Buffer.from(authoritative.issuedUserToken, 'utf8'), {
            key: config.encryptionKey,
            aad: `payer-session:${payerSessionId}`,
          });

    await db.$transaction(async (transaction) => {
      const claimed = await transaction.payerSession.updateMany({
        where: {
          id: payerSessionId,
          OR: [{ xrplAccount: null }, { xrplAccount: authoritative.account }],
        },
        data: {
          xrplAccount: authoritative.account,
          ...(encryptedUserToken === undefined ? {} : { xamanUserTokenEnc: encryptedUserToken }),
        },
      });
      if (claimed.count !== 1) {
        throw new DomainError(
          'XAMAN_REJECTED',
          'This payer session is already bound to another XRPL account',
        );
      }
      await transaction.xamanPayload.update({
        where: { payloadUuid },
        data: { status: PayloadStatus.SIGNED },
      });
    });

    return {
      status,
      xrplAccount: authoritative.account,
      network: PAYER_NETWORK,
    };
  }

  const databaseStatus =
    status === 'REJECTED'
      ? PayloadStatus.REJECTED
      : status === 'EXPIRED'
        ? PayloadStatus.EXPIRED
        : PayloadStatus.CREATED;
  await db.xamanPayload.updateMany({
    where: {
      payloadUuid,
      payerSessionId,
      status: { not: PayloadStatus.SIGNED },
    },
    data: { status: databaseStatus },
  });

  const session = await db.payerSession.findUnique({
    where: { id: payerSessionId },
    select: { xrplAccount: true },
  });
  if (session?.xrplAccount !== null && session?.xrplAccount !== undefined) {
    return {
      status: 'SIGNED',
      xrplAccount: session.xrplAccount,
      network: PAYER_NETWORK,
    };
  }

  return { status, xrplAccount: null, network: PAYER_NETWORK };
}

async function resolvePersistedPayload(
  persisted: {
    payloadUuid: string;
    expiresAt: Date;
    payerSession: {
      id: string;
      network: string;
      expiresAt: Date;
    } | null;
  },
  options: ServiceOptions,
  acceptExpiredSession = false,
): Promise<ResolvePayerSignInResult> {
  const now = options.now ?? new Date();
  if (persisted.payerSession === null || persisted.payerSession.network !== PAYER_NETWORK) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session is missing or expired');
  }
  const sessionExpired = persisted.payerSession.expiresAt <= now;
  if (sessionExpired && !acceptExpiredSession) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session is missing or expired');
  }

  const gateway = options.gateway ?? getGateway();
  const config = getPayerRuntimeConfig();
  const authoritative = await gateway.getAuthoritativePayload({
    uuid: persisted.payloadUuid,
    applicationId: config.xamanApiKey,
    kind: 'SIGN_IN',
    customIdentifier: `signin:${persisted.payerSession.id}`,
    requireSigned: false,
  });

  if (sessionExpired) {
    await db.xamanPayload.updateMany({
      where: {
        payloadUuid: persisted.payloadUuid,
        status: { not: PayloadStatus.SIGNED },
      },
      data: { status: PayloadStatus.EXPIRED },
    });
    return {
      status: 'EXPIRED',
      xrplAccount: null,
      network: PAYER_NETWORK,
    };
  }

  return persistAuthoritativeStatus(
    persisted.payerSession.id,
    persisted.payloadUuid,
    persisted.expiresAt,
    authoritative,
    now,
  );
}

export async function resolvePayerSignIn(
  payloadUuid: string,
  sessionToken: string,
  options: ServiceOptions = {},
): Promise<ResolvePayerSignInResult> {
  const persisted = await db.xamanPayload.findFirst({
    where: {
      payloadUuid,
      kind: PayloadKind.SIGN_IN,
      payerSession: {
        sessionTokenHash: hashPayerSessionToken(sessionToken),
      },
    },
    select: {
      payloadUuid: true,
      expiresAt: true,
      payerSession: {
        select: { id: true, network: true, expiresAt: true },
      },
    },
  });
  if (persisted === null) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'SignIn payload is not bound to this session');
  }

  return resolvePersistedPayload(persisted, options);
}

export async function processXamanSignInNotification(
  payloadUuid: string,
  options: ServiceOptions = {},
): Promise<{ known: boolean; result?: ResolvePayerSignInResult }> {
  const persisted = await db.xamanPayload.findUnique({
    where: { payloadUuid },
    select: {
      kind: true,
      payloadUuid: true,
      expiresAt: true,
      payerSession: {
        select: { id: true, network: true, expiresAt: true },
      },
    },
  });
  if (persisted === null || persisted.kind !== PayloadKind.SIGN_IN) {
    return { known: false };
  }

  return {
    known: true,
    result: await resolvePersistedPayload(persisted, options, true),
  };
}
