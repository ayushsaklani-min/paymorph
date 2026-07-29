import { getAddress } from 'viem';

export interface MerchantAuthChallenge {
  domain: string;
  walletAddress: string;
  nonce: string;
  issuedAt: Date;
  expiration: Date;
  chainId: number;
}

export function createMerchantAuthMessage(challenge: MerchantAuthChallenge): string {
  const host = new URL(challenge.domain).host;
  return [
    `${host} wants you to sign in to PayMorph:`,
    getAddress(challenge.walletAddress),
    '',
    'Authorize this wallet for the PayMorph merchant dashboard.',
    '',
    `URI: ${challenge.domain}`,
    `Version: 1`,
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt.toISOString()}`,
    `Expiration Time: ${challenge.expiration.toISOString()}`,
  ].join('\n');
}
