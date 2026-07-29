import { z } from 'zod';
import { db, SettlementAsset } from '@paymorph/db';
import { serializeMerchantProfile } from '@/lib/server/auth/merchant-profile';
import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';

const patchSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80).optional(),
  logoUrl: z.url().nullable().optional(),
  defaultAsset: z.enum(['FXRP', 'USDT0']).optional(),
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
    const updated = await db.merchant.update({
      where: { id: merchant.id },
      data: {
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
        ...(input.defaultAsset === undefined
          ? {}
          : { defaultAsset: SettlementAsset[input.defaultAsset] }),
      },
    });
    return jsonSuccess(request, serializeMerchantProfile(updated));
  } catch (error) {
    return jsonError(request, error);
  }
}
