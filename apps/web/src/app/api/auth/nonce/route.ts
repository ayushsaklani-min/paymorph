import { createHash, randomBytes } from 'node:crypto';
import { db } from '@paymorph/db';
import { getAddress, isAddress } from 'viem';
import { z } from 'zod';
import { getServerConfig } from '@/lib/server/config';
import { createMerchantAuthMessage } from '@/lib/server/auth/message';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z.strictObject({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
});

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const body = requestSchema.parse(await readJson(request));
    const config = getServerConfig();
    const walletAddress = getAddress(body.walletAddress);
    await enforceRateLimit(
      request,
      { name: 'merchant-auth-challenge', maxRequests: 10, windowSeconds: 60 },
      walletAddress,
    );
    const nonce = randomBytes(24).toString('base64url');
    const issuedAt = new Date();
    const expiration = new Date(issuedAt.getTime() + 5 * 60 * 1_000);
    const record = await db.authNonce.create({
      data: {
        walletAddress,
        nonceHash: createHash('sha256').update(nonce).digest('hex'),
        expiresAt: expiration,
        createdAt: issuedAt,
      },
    });
    const message = createMerchantAuthMessage({
      domain: config.APP_URL,
      walletAddress,
      nonce,
      issuedAt,
      expiration,
      chainId: config.COSTON2_CHAIN_ID,
    });
    return jsonSuccess(request, { nonceId: record.id, nonce, message, expiration }, 201);
  } catch (error) {
    return jsonError(request, error);
  }
}
