import { createHash } from 'node:crypto';
import { db } from '@paymorph/db';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { z } from 'zod';
import { createMerchantAuthMessage } from '@/lib/server/auth/message';
import { createMerchantSession } from '@/lib/server/auth/session';
import { getServerConfig } from '@/lib/server/config';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { DomainError } from '@paymorph/shared';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z.strictObject({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  nonceId: z.uuid(),
  nonce: z.string().min(20).max(128),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const body = requestSchema.parse(await readJson(request));
    const walletAddress = getAddress(body.walletAddress);
    const config = getServerConfig();
    await enforceRateLimit(
      request,
      { name: 'merchant-auth-verify', maxRequests: 10, windowSeconds: 60 },
      walletAddress,
    );

    const merchant = await db.$transaction(async (transaction) => {
      const nonce = await transaction.authNonce.findUnique({ where: { id: body.nonceId } });
      const nonceHash = createHash('sha256').update(body.nonce).digest('hex');
      if (
        !nonce ||
        nonce.usedAt ||
        nonce.expiresAt <= new Date() ||
        nonce.walletAddress !== walletAddress ||
        nonce.nonceHash !== nonceHash
      ) {
        throw new DomainError('UNAUTHENTICATED', 'Authentication challenge is invalid or expired');
      }
      const message = createMerchantAuthMessage({
        domain: config.APP_URL,
        walletAddress,
        nonce: body.nonce,
        issuedAt: nonce.createdAt,
        expiration: nonce.expiresAt,
        chainId: config.COSTON2_CHAIN_ID,
      });
      const valid = await verifyMessage({
        address: walletAddress,
        message,
        signature: body.signature as `0x${string}`,
      });
      if (!valid) throw new DomainError('UNAUTHENTICATED', 'Wallet signature is invalid');

      await transaction.authNonce.update({
        where: { id: nonce.id },
        data: { usedAt: new Date() },
      });
      return transaction.merchant.upsert({
        where: { walletAddress },
        update: {},
        create: {
          walletAddress,
          displayName: `Merchant ${walletAddress.slice(0, 6)}`,
        },
      });
    });

    await createMerchantSession(merchant.id);
    return jsonSuccess(request, {
      id: merchant.id,
      walletAddress: merchant.walletAddress,
      displayName: merchant.displayName,
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
