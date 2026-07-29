import { z } from 'zod';
import { DomainError } from '@paymorph/shared';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { readPayerSessionToken, requireActivePayerSessionId } from '@/lib/server/payer-session';
import { createPaymentPayload } from '@/lib/server/payments';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const idSchema = z.string().uuid();
const requestSchema = z.strictObject({});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  try {
    assertMutationOrigin(request);
    const token = readPayerSessionToken(request);
    if (!token) throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    const { quoteId: rawQuoteId } = await context.params;
    const quoteId = idSchema.parse(rawQuoteId);
    const input = requestSchema.parse(await readJson(request));
    const payerSessionId = await requireActivePayerSessionId(token);
    await enforceRateLimit(
      request,
      { name: 'xaman-payment-payload', maxRequests: 5, windowSeconds: 60 },
      payerSessionId,
    );
    const result = await executeIdempotentMutation({
      request,
      scope: `payer-session:${payerSessionId}:quote:${quoteId}:payment-payload:create`,
      requestInput: { quoteId, ...input },
      successStatus: 201,
      // An unknown Xaman outcome must retain the in-flight claim. A new call
      // could otherwise create a second external payload after a lost response.
      execute: () => createPaymentPayload(quoteId, token),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
