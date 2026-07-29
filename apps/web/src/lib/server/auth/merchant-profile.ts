import type { Merchant } from '@paymorph/db';

export type MerchantProfile = Pick<
  Merchant,
  | 'id'
  | 'walletAddress'
  | 'displayName'
  | 'logoUrl'
  | 'defaultAsset'
  | 'webhookUrl'
  | 'createdAt'
  | 'updatedAt'
>;

export function serializeMerchantProfile(merchant: MerchantProfile): MerchantProfile {
  return {
    id: merchant.id,
    walletAddress: merchant.walletAddress,
    displayName: merchant.displayName,
    logoUrl: merchant.logoUrl,
    defaultAsset: merchant.defaultAsset,
    webhookUrl: merchant.webhookUrl,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
  };
}
