import { db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';
import { hashPayerSessionToken, readPayerSessionToken } from '@/lib/server/payer-session';
import { processXamanPaymentNotification } from '@/lib/server/payments';

const idSchema = z.string().uuid();

/**
 * Reconciles the exact payload associated with this payer-bound attempt after
 * Xaman returns the user to PayMorph. The service fetches Xaman's
 * authoritative payload before persisting any signed/transaction state.
 */
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    assertMutationOrigin(request);
    const token = readPayerSessionToken(request);
    if (!token) throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    const { attemptId: rawAttemptId } = await context.params;
    const attempt = await db.paymentAttempt.findFirst({
      where: {
        id: idSchema.parse(rawAttemptId),
        payerSession: { sessionTokenHash: hashPayerSessionToken(token) },
      },
      select: { id: true, xamanPayloadUuid: true },
    });
    if (!attempt || !attempt.xamanPayloadUuid) {
      throw new DomainError('FORBIDDEN', 'Payment attempt is not bound to this payer session');
    }

    const result = await processXamanPaymentNotification(attempt.xamanPayloadUuid);
    return jsonSuccess(request, {
      attemptId: attempt.id,
      signed: result.known && result.signed === true,
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
