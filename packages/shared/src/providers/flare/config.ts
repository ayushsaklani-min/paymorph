import { defineChain, type Address } from 'viem';

export const COSTON2_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';
export const FLARE_CONTRACT_REGISTRY_ADDRESS =
  '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019' as Address;
export const COSTON2_USDT0_ADDRESS = '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F' as Address;
export const DOCUMENTED_COSTON2_SPARKDEX_ROUTER_ADDRESS =
  '0x8a1E35F5c98C4E85B36B7B253222eE17773b2781' as Address;

export const FLARE_REGISTRY_NAMES = {
  assetManagerFXRP: 'AssetManagerFXRP',
  masterAccountController: 'MasterAccountController',
  ftsoV2: 'FtsoV2',
} as const;

export const coston2 = defineChain({
  id: 114,
  name: 'Coston2',
  nativeCurrency: {
    name: 'Coston2 Flare',
    symbol: 'C2FLR',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [COSTON2_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'Coston2 Explorer',
      url: 'https://coston2-explorer.flare.network',
    },
  },
  testnet: true,
});
