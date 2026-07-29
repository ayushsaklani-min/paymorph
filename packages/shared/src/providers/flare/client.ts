import { createPublicClient, http, type PublicClient } from 'viem';
import { coston2, COSTON2_RPC_URL } from './config.js';

export function createCoston2PublicClient(rpcUrl = COSTON2_RPC_URL): PublicClient {
  return createPublicClient({
    chain: coston2,
    transport: http(rpcUrl, {
      retryCount: 3,
      timeout: 20_000,
    }),
  });
}
