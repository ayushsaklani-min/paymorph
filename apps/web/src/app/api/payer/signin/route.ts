import { z } from 'zod';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import {
  readPayerSessionToken,
  setPayerSessionCookie,
  startPayerSignIn,
} from '@/lib/server/payer-session';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z
  .object({
    invoiceSlug: z.string().trim().min(1).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const input = requestSchema.parse(await readJson(request, 4 * 1_024));
    await enforceRateLimit(request, {
      name: 'payer-signin',
      maxRequests: 5,
      windowSeconds: 60,
    });
    const result = await startPayerSignIn(input.invoiceSlug, readPayerSessionToken(request));
    const response = jsonSuccess(
      request,
      {
        payerSessionId: result.payerSessionId,
        payloadUuid: result.payloadUuid,
        qrPngUrl: result.qrPngUrl,
        deeplinkUrl: result.deeplinkUrl,
        websocketUrl: result.websocketUrl,
        expiresAt: result.expiresAt.toISOString(),
      },
      201,
    );
    setPayerSessionCookie(response, result.sessionToken, result.sessionExpiresAt);
    return response;
  } catch (error) {
    return jsonError(request, error);
  }
}
