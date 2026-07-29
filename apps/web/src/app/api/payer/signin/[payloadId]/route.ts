import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { readPayerSessionToken, resolvePayerSignIn } from '@/lib/server/payer-session';

const payloadIdSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ payloadId: string }> }) {
  try {
    const { payloadId: rawPayloadId } = await context.params;
    const payloadId = payloadIdSchema.parse(rawPayloadId);
    const sessionToken = readPayerSessionToken(request);
    if (sessionToken === null) {
      throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session cookie is required');
    }

    return jsonSuccess(request, await resolvePayerSignIn(payloadId, sessionToken));
  } catch (error) {
    return jsonError(request, error);
  }
}
