import { z } from 'zod';
import { db, SettlementAsset } from '@paymorph/db';
import { DomainError, encryptSensitive, parseEncryptionKey } from '@paymorph/shared';
import { serializeMerchantProfile } from '@/lib/server/auth/merchant-profile';
import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';

const patchSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80).optional(),
  logoUrl: z.url().nullable().optional(),
  defaultAsset: z.enum(['FXRP', 'USDT0']).optional(),
  webhookUrl: z.url().nullable().optional(),
  webhookSecret: z.string().min(16).max(512).optional(),
});

export async function GET(request: Request) {
  try {
    const merchant = await requireMerchant();
    return jsonSuccess(request, serializeMerchantProfile(merchant));
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const input = patchSchema.parse(await readJson(request));
    if (input.webhookSecret !== undefined && input.webhookUrl === null) {
      throw new DomainError('VALIDATION_ERROR', 'Webhook secret requires a webhook URL');
    }
    const webhookSecretEnc =
      input.webhookSecret === undefined
        ? undefined
        : encryptSensitive(Buffer.from(input.webhookSecret, 'utf8'), {
            key: parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_V1 ?? ''),
            aad: `merchant-webhook:${merchant.id}`,
          });
    const updated = await db.merchant.update({
      where: { id: merchant.id },
      data: {
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
        ...(input.defaultAsset === undefined
          ? {}
          : { defaultAsset: SettlementAsset[input.defaultAsset] }),
        ...(input.webhookUrl === undefined ? {} : { webhookUrl: input.webhookUrl }),
        ...(webhookSecretEnc === undefined ? {} : { webhookSecretEnc }),
      },
    });
    return jsonSuccess(request, serializeMerchantProfile(updated));
  } catch (error) {
    return jsonError(request, error);
  }
}
