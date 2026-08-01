import type { Address, Hex, PublicClient } from 'viem';
import type { DirectMintFeeSettings } from '../../amounts/direct-mint.js';
import type { FtsoRationalValue } from './ftso.js';

export type FlareReadClient = Pick<
  PublicClient,
  'getBlock' | 'getBytecode' | 'getChainId' | 'readContract' | 'simulateContract'
>;

export interface FlareProviderConfig {
  readonly registryAddress?: Address;
  readonly usdt0Address?: Address;
  readonly sparkDexRouterAddress?: Address;
  readonly sparkDexFactoryAddress?: Address;
  readonly sparkDexQuoterAddress?: Address;
  readonly sparkDexPoolFee?: number;
  readonly usdt0RouteKind?: Usdt0RouteKind;
}

export type Usdt0RouteKind = 'SPARKDEX_V3' | 'PAYMORPH_TESTNET';

export interface ResolvedFlareContracts {
  readonly registry: Address;
  readonly assetManagerFXRP: Address;
  readonly masterAccountController: Address;
  readonly ftsoV2: Address;
}

export interface TokenMetadata {
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface FAssetsNetworkState {
  readonly contracts: ResolvedFlareContracts;
  readonly fxrp: TokenMetadata;
  readonly directMintingPaymentAddress: string;
  readonly directMintSettings: DirectMintFeeSettings;
}

export interface PersonalAccountState {
  readonly xrplAccount: string;
  readonly personalAccount: Address;
  readonly nonce: bigint;
  readonly deployed: boolean;
}

export interface FtsoFeed {
  readonly feedId: Hex;
  readonly value: bigint;
  readonly decimals: number;
  readonly exactValue: FtsoRationalValue;
  readonly timestamp: bigint;
  readonly ageSeconds: bigint;
  readonly fresh: boolean;
}

export type Usdt0CapabilityReason =
  | 'USDT0_TOKEN_NO_CODE'
  | 'USDT0_DECIMALS_MISMATCH'
  | 'SWAP_ROUTER_NO_CODE'
  | 'SWAP_FACTORY_NOT_CONFIGURED'
  | 'SWAP_FACTORY_NO_CODE'
  | 'SWAP_ROUTER_FACTORY_MISMATCH'
  | 'SWAP_QUOTER_NOT_CONFIGURED'
  | 'SWAP_QUOTER_NO_CODE'
  | 'SWAP_POOL_NOT_FOUND'
  | 'SWAP_POOL_NO_CODE'
  | 'SWAP_POOL_NO_LIQUIDITY';

export type Usdt0Capability =
  | {
      readonly available: false;
      readonly reason: Usdt0CapabilityReason;
      readonly routeKind: Usdt0RouteKind;
      readonly token: Address;
      readonly router: Address;
    }
  | {
      readonly available: true;
      readonly routeKind: Usdt0RouteKind;
      readonly token: Address;
      readonly router: Address;
      readonly factory: Address;
      readonly quoter: Address;
      readonly pool: Address;
      readonly poolFee: number;
      readonly liquidity: bigint;
    };

export type VerifiedUsdt0Capability = Extract<Usdt0Capability, { readonly available: true }>;

export interface SettlementCapabilities {
  readonly FXRP: {
    readonly available: true;
    readonly token: Address;
  };
  readonly USDT0: Usdt0Capability;
}

export interface ResolvedCoston2Network extends FAssetsNetworkState {
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly xrpUsd: FtsoFeed;
  readonly capabilities: SettlementCapabilities;
}

export class FlareNetworkError extends Error {
  constructor(
    readonly code:
      | 'CHAIN_ID_MISMATCH'
      | 'CONTRACT_NO_CODE'
      | 'REGISTRY_ZERO_ADDRESS'
      | 'FXRP_DECIMALS_MISMATCH'
      | 'INVALID_DIRECT_MINT_SETTINGS'
      | 'INVALID_FTSO_FEED'
      | 'INVALID_USDT0_EXACT_OUTPUT_QUOTE',
    message: string,
  ) {
    super(message);
    this.name = 'FlareNetworkError';
  }
}
