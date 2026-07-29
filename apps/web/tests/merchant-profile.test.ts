import { SettlementAsset, type Merchant } from '@paymorph/db';
import { describe, expect, it } from 'vitest';
import { serializeMerchantProfile } from '../src/lib/server/auth/merchant-profile.js';

describe('merchant API profile', () => {
  it('returns only explicitly public merchant fields', () => {
    const merchant: Merchant = {
      id: '11111111-1111-4111-8111-111111111111',
      walletAddress: '0x1111111111111111111111111111111111111111',
      displayName: 'PayMorph Store',
      logoUrl: 'https://example.com/logo.png',
      defaultAsset: SettlementAsset.FXRP,
      webhookUrl: 'https://example.com/hooks/paymorph',
      webhookSecretEnc: 'must-never-leave-the-server',
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
      updatedAt: new Date('2026-07-27T00:01:00.000Z'),
    };

    expect(serializeMerchantProfile(merchant)).toEqual({
      id: merchant.id,
      walletAddress: merchant.walletAddress,
      displayName: merchant.displayName,
      logoUrl: merchant.logoUrl,
      defaultAsset: merchant.defaultAsset,
      webhookUrl: merchant.webhookUrl,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    });
    expect(serializeMerchantProfile(merchant)).not.toHaveProperty('webhookSecretEnc');
  });
});
