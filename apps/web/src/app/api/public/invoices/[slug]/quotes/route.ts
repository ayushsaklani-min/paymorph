import { z } from 'zod';
import { DomainError } from '@paymorph/shared';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { readPayerSessionToken, requireActivePayerSessionId } from '@/lib/server/payer-session';
import { createQuote } from '@/lib/server/quotes/service';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z.strictObject({
  slippageBps: z.number().int().min(0).max(1_000).default(150),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    assertMutationOrigin(request);
    const sessionToken = readPayerSessionToken(request);
    if (!sessionToken) {
      throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    }
    const { slug } = await context.params;
    const input = requestSchema.parse(await readJson(request));
    const payerSessionId = await requireActivePayerSessionId(sessionToken);
    await enforceRateLimit(
      request,
      { name: 'payer-quote', maxRequests: 12, windowSeconds: 60 },
      payerSessionId,
    );
    const result = await executeIdempotentMutation({
      request,
      scope: `payer-session:${payerSessionId}:invoice:${slug}:quotes:create`,
      requestInput: { invoiceSlug: slug, ...input },
      successStatus: 201,
      releaseOnDomainError: true,
      execute: () =>
        createQuote({
          invoiceSlug: slug,
          payerSessionToken: sessionToken,
          slippageBps: input.slippageBps,
        }),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
