import { coston2, createCoston2PublicClient } from '@paymorph/shared';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Client } from 'xrpl';
import { FdcXrpPaymentClient, resolveRequiredFlareContract } from '../adapters/fdc/index.js';
import { FlareDirectMintFinalizer } from '../adapters/flare/index.js';
import { XrplTestnetTransactionReader } from '../adapters/xrpl/index.js';
import type { ExecutorConfig } from './config.js';
import type { ExecutorBoundaries } from './types.js';

export interface BuiltBoundaries {
  readonly boundaries: ExecutorBoundaries;
  close(): Promise<void>;
}

export async function buildExecutorBoundaries(config: ExecutorConfig): Promise<BuiltBoundaries> {
  const account = privateKeyToAccount(config.privateKey);
  const publicClient = createCoston2PublicClient(config.coston2RpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== 114) throw new Error(`Executor requires Coston2 chain 114, received ${chainId}`);
  const walletClient = createWalletClient({
    account,
    chain: coston2,
    transport: http(config.coston2RpcUrl),
  });
  const [assetManagerAddress, masterAccountControllerAddress] = await Promise.all([
    resolveRequiredFlareContract(publicClient, config.registryAddress, 'AssetManagerFXRP'),
    resolveRequiredFlareContract(publicClient, config.registryAddress, 'MasterAccountController'),
  ]);
  const routerCode = await publicClient.getBytecode({ address: config.routerAddress });
  if (routerCode === undefined || routerCode === '0x') {
    throw new Error(`PayMorphRouter has no bytecode at ${config.routerAddress}`);
  }

  const xrplClient = new Client(config.xrplWsUrl);
  const xrpl = new XrplTestnetTransactionReader(xrplClient);
  const fdc = new FdcXrpPaymentClient({
    publicClient,
    walletClient,
    executorAccount: account,
    registryAddress: config.registryAddress,
    verifierBaseUrl: config.fdcVerifierUrl,
    daLayerBaseUrl: config.fdcDaLayerUrl,
    ...(config.fdcVerifierApiKey === undefined ? {} : { verifierApiKey: config.fdcVerifierApiKey }),
    sourceId: config.fdcSourceId,
    retryAfterMs: config.fdcRetryAfterMs,
  });
  const flare = new FlareDirectMintFinalizer({
    publicClient,
    walletClient,
    executorAccount: account,
    assetManagerAddress,
    masterAccountControllerAddress,
    payMorphRouterAddress: config.routerAddress,
  });
  return {
    boundaries: { xrpl, fdc, flare },
    close: () => xrpl.close(),
  };
}
