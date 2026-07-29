import { db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { hashPayerSessionToken, readPayerSessionToken } from '@/lib/server/payer-session';

const idSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const token = readPayerSessionToken(request);
    if (!token) throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    const { attemptId: rawAttemptId } = await context.params;
    const attempt = await db.paymentAttempt.findFirst({
      where: {
        id: idSchema.parse(rawAttemptId),
        payerSession: { sessionTokenHash: hashPayerSessionToken(token) },
      },
      select: {
        id: true,
        status: true,
        xrplTxHash: true,
        recoveryTxHash: true,
        flareTxHash: true,
        failureCode: true,
        failureMessage: true,
        settledAt: true,
        updatedAt: true,
        quote: { select: { expiresAt: true } },
      },
    });
    if (!attempt) throw new DomainError('FORBIDDEN', 'Attempt is not bound to this payer session');
    return jsonSuccess(request, {
      ...attempt,
      quoteExpiresAt: attempt.quote.expiresAt.toISOString(),
      settledAt: attempt.settledAt?.toISOString() ?? null,
      updatedAt: attempt.updatedAt.toISOString(),
      quote: undefined,
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
