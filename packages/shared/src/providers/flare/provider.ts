import { ftsoV2InterfaceAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/FtsoV2Interface';
import { iAssetManagerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IAssetManager';
import { iDirectMintingSettingsAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IDirectMintingSettings';
import { iFlareContractRegistryAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFlareContractRegistry';
import { iierc20WithMetadataAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IIERC20WithMetadata';
import { iMasterAccountControllerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IMasterAccountController';
import { getAddress, isAddressEqual, zeroAddress, type Address, type Hex } from 'viem';
import { solveDirectMintGrossAmount } from '../../amounts/direct-mint.js';
import { COSTON2_CHAIN_ID, FXRP_DECIMALS, XRP_USD_FEED_ID } from '../../constants/network.js';
import {
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
  uniswapV3QuoterV2Abi,
  uniswapV3RouterIdentityAbi,
} from './abis.js';
import {
  COSTON2_USDT0_ADDRESS,
  DOCUMENTED_COSTON2_SPARKDEX_ROUTER_ADDRESS,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  FLARE_REGISTRY_NAMES,
} from './config.js';
import { ftsoValueAsRational } from './ftso.js';
import {
  FlareNetworkError,
  type FAssetsNetworkState,
  type FlareProviderConfig,
  type FlareReadClient,
  type FtsoFeed,
  type PersonalAccountState,
  type ResolvedCoston2Network,
  type ResolvedFlareContracts,
  type SettlementCapabilities,
  type TokenMetadata,
  type Usdt0Capability,
  type Usdt0CapabilityReason,
  type VerifiedUsdt0Capability,
} from './types.js';

interface NormalizedFlareProviderConfig {
  readonly registryAddress: Address;
  readonly usdt0Address: Address;
  readonly sparkDexRouterAddress: Address;
  readonly sparkDexFactoryAddress?: Address;
  readonly sparkDexQuoterAddress?: Address;
  readonly sparkDexPoolFee: number;
}

const NO_CODE = '0x';

export class FlareNetworkProvider {
  readonly config: NormalizedFlareProviderConfig;

  constructor(
    readonly client: FlareReadClient,
    config: FlareProviderConfig = {},
  ) {
    const poolFee = config.sparkDexPoolFee ?? 500;
    if (!Number.isSafeInteger(poolFee) || poolFee < 0 || poolFee > 0xff_ffff) {
      throw new RangeError('SparkDEX pool fee must be a uint24 integer');
    }

    this.config = {
      registryAddress: getAddress(config.registryAddress ?? FLARE_CONTRACT_REGISTRY_ADDRESS),
      usdt0Address: getAddress(config.usdt0Address ?? COSTON2_USDT0_ADDRESS),
      sparkDexRouterAddress: getAddress(
        config.sparkDexRouterAddress ?? DOCUMENTED_COSTON2_SPARKDEX_ROUTER_ADDRESS,
      ),
      ...(config.sparkDexFactoryAddress === undefined
        ? {}
        : { sparkDexFactoryAddress: getAddress(config.sparkDexFactoryAddress) }),
      ...(config.sparkDexQuoterAddress === undefined
        ? {}
        : { sparkDexQuoterAddress: getAddress(config.sparkDexQuoterAddress) }),
      sparkDexPoolFee: poolFee,
    };
  }

  async assertCoston2(): Promise<void> {
    const chainId = await this.client.getChainId();
    if (chainId !== COSTON2_CHAIN_ID) {
      throw new FlareNetworkError(
        'CHAIN_ID_MISMATCH',
        `Expected Coston2 chain ID ${COSTON2_CHAIN_ID}, received ${chainId}`,
      );
    }
    await this.requireCode(this.config.registryAddress, 'Flare Contract Registry');
  }

  async resolveContracts(): Promise<ResolvedFlareContracts> {
    await this.assertCoston2();

    const [assetManagerFXRP, masterAccountController, ftsoV2] = await Promise.all([
      this.resolveRegistryAddress(FLARE_REGISTRY_NAMES.assetManagerFXRP),
      this.resolveRegistryAddress(FLARE_REGISTRY_NAMES.masterAccountController),
      this.resolveRegistryAddress(FLARE_REGISTRY_NAMES.ftsoV2),
    ]);

    await Promise.all([
      this.requireCode(assetManagerFXRP, FLARE_REGISTRY_NAMES.assetManagerFXRP),
      this.requireCode(masterAccountController, FLARE_REGISTRY_NAMES.masterAccountController),
      this.requireCode(ftsoV2, FLARE_REGISTRY_NAMES.ftsoV2),
    ]);

    return {
      registry: this.config.registryAddress,
      assetManagerFXRP,
      masterAccountController,
      ftsoV2,
    };
  }

  async readFAssetsState(contracts?: ResolvedFlareContracts): Promise<FAssetsNetworkState> {
    const resolvedContracts = contracts ?? (await this.resolveContracts());
    const [fxrpAddress, directMintingPaymentAddress, feeBIPS, minimumFeeUBA, executorFeeUBA] =
      await Promise.all([
        this.client.readContract({
          address: resolvedContracts.assetManagerFXRP,
          abi: iAssetManagerAbi,
          functionName: 'fAsset',
        }),
        this.client.readContract({
          address: resolvedContracts.assetManagerFXRP,
          abi: iAssetManagerAbi,
          functionName: 'directMintingPaymentAddress',
        }),
        this.client.readContract({
          address: resolvedContracts.assetManagerFXRP,
          abi: iDirectMintingSettingsAbi,
          functionName: 'getDirectMintingFeeBIPS',
        }),
        this.client.readContract({
          address: resolvedContracts.assetManagerFXRP,
          abi: iDirectMintingSettingsAbi,
          functionName: 'getDirectMintingMinimumFeeUBA',
        }),
        this.client.readContract({
          address: resolvedContracts.assetManagerFXRP,
          abi: iDirectMintingSettingsAbi,
          functionName: 'getDirectMintingExecutorFeeUBA',
        }),
      ]);

    await this.requireCode(fxrpAddress, 'FXRP');
    const fxrp = await this.readTokenMetadata(fxrpAddress);
    if (fxrp.decimals !== FXRP_DECIMALS) {
      throw new FlareNetworkError(
        'FXRP_DECIMALS_MISMATCH',
        `Expected FXRP to use ${FXRP_DECIMALS} decimals, received ${fxrp.decimals}`,
      );
    }
    if (directMintingPaymentAddress.length === 0) {
      throw new FlareNetworkError(
        'INVALID_DIRECT_MINT_SETTINGS',
        'AssetManager returned an empty direct-mint payment address',
      );
    }

    try {
      solveDirectMintGrossAmount(0n, {
        feeBIPS,
        minimumFeeUBA,
        executorFeeUBA,
      });
    } catch (error) {
      throw new FlareNetworkError(
        'INVALID_DIRECT_MINT_SETTINGS',
        `AssetManager returned invalid direct-mint settings: ${errorMessage(error)}`,
      );
    }

    return {
      contracts: resolvedContracts,
      fxrp,
      directMintingPaymentAddress,
      directMintSettings: {
        feeBIPS,
        minimumFeeUBA,
        executorFeeUBA,
      },
    };
  }

  async readPersonalAccount(
    xrplAccount: string,
    contracts?: ResolvedFlareContracts,
  ): Promise<PersonalAccountState> {
    if (xrplAccount.length === 0) {
      throw new TypeError('XRPL account is required');
    }

    const resolvedContracts = contracts ?? (await this.resolveContracts());
    const personalAccount = await this.client.readContract({
      address: resolvedContracts.masterAccountController,
      abi: iMasterAccountControllerAbi,
      functionName: 'getPersonalAccount',
      args: [xrplAccount],
    });
    const [nonce, code] = await Promise.all([
      this.client.readContract({
        address: resolvedContracts.masterAccountController,
        abi: iMasterAccountControllerAbi,
        functionName: 'getNonce',
        args: [personalAccount],
      }),
      this.client.getBytecode({ address: personalAccount }),
    ]);

    return {
      xrplAccount,
      personalAccount,
      nonce,
      deployed: hasCode(code),
    };
  }

  async readXrpUsdFeed(
    maxAgeSeconds: number,
    contracts?: ResolvedFlareContracts,
  ): Promise<FtsoFeed> {
    if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
      throw new RangeError('FTSO maximum age must be a non-negative integer');
    }

    const resolvedContracts = contracts ?? (await this.resolveContracts());
    const [feedSimulation, latestBlock] = await Promise.all([
      this.client.simulateContract({
        address: resolvedContracts.ftsoV2,
        abi: ftsoV2InterfaceAbi,
        functionName: 'getFeedById',
        args: [XRP_USD_FEED_ID],
        value: 0n,
      }),
      this.client.getBlock({ blockTag: 'latest' }),
    ]);
    const [value, decimals, timestamp] = feedSimulation.result;

    if (timestamp > latestBlock.timestamp) {
      throw new FlareNetworkError('INVALID_FTSO_FEED', 'FTSO returned a future timestamp');
    }

    let exactValue;
    try {
      exactValue = ftsoValueAsRational(value, decimals);
    } catch (error) {
      throw new FlareNetworkError(
        'INVALID_FTSO_FEED',
        `FTSO returned an invalid value or decimal exponent: ${errorMessage(error)}`,
      );
    }

    const ageSeconds = latestBlock.timestamp - timestamp;
    return {
      feedId: XRP_USD_FEED_ID,
      value,
      decimals,
      exactValue,
      timestamp,
      ageSeconds,
      fresh: ageSeconds <= BigInt(maxAgeSeconds),
    };
  }

  async readSettlementCapabilities(fassets?: FAssetsNetworkState): Promise<SettlementCapabilities> {
    const resolvedFassets = fassets ?? (await this.readFAssetsState());
    const USDT0 = await this.readUsdt0Capability(resolvedFassets.fxrp.address);
    return {
      FXRP: {
        available: true,
        token: resolvedFassets.fxrp.address,
      },
      USDT0,
    };
  }

  /**
   * Simulates the configured QuoterV2 for one FXRP -> USDT0 exact-output hop.
   * It deliberately returns no fallback price: callers may construct a
   * settlement only from this current, route-specific answer.
   */
  async quoteUsdt0ExactOutput(input: {
    fxrpAddress: Address;
    capability: VerifiedUsdt0Capability;
    amountOut: bigint;
  }): Promise<bigint> {
    if (input.amountOut <= 0n) {
      throw new FlareNetworkError(
        'INVALID_USDT0_EXACT_OUTPUT_QUOTE',
        'USDT0 exact-output amount must be positive',
      );
    }

    try {
      const simulation = await this.client.simulateContract({
        address: input.capability.quoter,
        abi: uniswapV3QuoterV2Abi,
        functionName: 'quoteExactOutputSingle',
        args: [
          {
            tokenIn: input.fxrpAddress,
            tokenOut: input.capability.token,
            amount: input.amountOut,
            fee: input.capability.poolFee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const result = simulation.result;
      if (!Array.isArray(result) || typeof result[0] !== 'bigint' || result[0] <= 0n) {
        throw new Error('Quoter returned an invalid exact-output input amount');
      }
      return result[0];
    } catch (error) {
      if (error instanceof FlareNetworkError) throw error;
      throw new FlareNetworkError(
        'INVALID_USDT0_EXACT_OUTPUT_QUOTE',
        `USDT0 exact-output quote simulation failed: ${errorMessage(error)}`,
      );
    }
  }

  async resolveNetwork(maxFtsoAgeSeconds = 120): Promise<ResolvedCoston2Network> {
    const contracts = await this.resolveContracts();
    const fassets = await this.readFAssetsState(contracts);
    const [chainId, latestBlock, xrpUsd, capabilities] = await Promise.all([
      this.client.getChainId(),
      this.client.getBlock({ blockTag: 'latest' }),
      this.readXrpUsdFeed(maxFtsoAgeSeconds, contracts),
      this.readSettlementCapabilities(fassets),
    ]);

    return {
      chainId,
      blockNumber: latestBlock.number,
      ...fassets,
      xrpUsd,
      capabilities,
    };
  }

  private async resolveRegistryAddress(name: string): Promise<Address> {
    const address = await this.client.readContract({
      address: this.config.registryAddress,
      abi: iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: [name],
    });
    if (isAddressEqual(address, zeroAddress)) {
      throw new FlareNetworkError(
        'REGISTRY_ZERO_ADDRESS',
        `Flare Contract Registry returned zero address for ${name}`,
      );
    }
    return getAddress(address);
  }

  private async readTokenMetadata(address: Address): Promise<TokenMetadata> {
    const [name, symbol, decimals] = await Promise.all([
      this.client.readContract({
        address,
        abi: iierc20WithMetadataAbi,
        functionName: 'name',
      }),
      this.client.readContract({
        address,
        abi: iierc20WithMetadataAbi,
        functionName: 'symbol',
      }),
      this.client.readContract({
        address,
        abi: iierc20WithMetadataAbi,
        functionName: 'decimals',
      }),
    ]);
    return { address, name, symbol, decimals };
  }

  private async readUsdt0Capability(fxrpAddress: Address): Promise<Usdt0Capability> {
    const token = this.config.usdt0Address;
    const router = this.config.sparkDexRouterAddress;
    const unavailable = (reason: Usdt0CapabilityReason): Usdt0Capability => ({
      available: false,
      reason,
      token,
      router,
    });

    if (!(await this.addressHasCode(token))) {
      return unavailable('USDT0_TOKEN_NO_CODE');
    }
    const usdt0 = await this.readTokenMetadata(token);
    if (usdt0.decimals !== 6) {
      return unavailable('USDT0_DECIMALS_MISMATCH');
    }

    // Check the documented router before optional route configuration so a
    // stale documented deployment is reported precisely.
    if (!(await this.addressHasCode(router))) {
      return unavailable('SWAP_ROUTER_NO_CODE');
    }

    const factory = this.config.sparkDexFactoryAddress;
    if (factory === undefined) {
      return unavailable('SWAP_FACTORY_NOT_CONFIGURED');
    }
    if (!(await this.addressHasCode(factory))) {
      return unavailable('SWAP_FACTORY_NO_CODE');
    }

    const routerFactory = await this.client.readContract({
      address: router,
      abi: uniswapV3RouterIdentityAbi,
      functionName: 'factory',
    });
    if (!isAddressEqual(routerFactory, factory)) {
      return unavailable('SWAP_ROUTER_FACTORY_MISMATCH');
    }

    const quoter = this.config.sparkDexQuoterAddress;
    if (quoter === undefined) {
      return unavailable('SWAP_QUOTER_NOT_CONFIGURED');
    }
    if (!(await this.addressHasCode(quoter))) {
      return unavailable('SWAP_QUOTER_NO_CODE');
    }

    const pool = await this.client.readContract({
      address: factory,
      abi: uniswapV3FactoryAbi,
      functionName: 'getPool',
      args: [fxrpAddress, token, this.config.sparkDexPoolFee],
    });
    if (isAddressEqual(pool, zeroAddress)) {
      return unavailable('SWAP_POOL_NOT_FOUND');
    }
    if (!(await this.addressHasCode(pool))) {
      return unavailable('SWAP_POOL_NO_CODE');
    }

    const liquidity = await this.client.readContract({
      address: pool,
      abi: uniswapV3PoolAbi,
      functionName: 'liquidity',
    });
    if (liquidity === 0n) {
      return unavailable('SWAP_POOL_NO_LIQUIDITY');
    }

    return {
      available: true,
      token,
      router,
      factory,
      quoter,
      pool,
      poolFee: this.config.sparkDexPoolFee,
      liquidity,
    };
  }

  private async addressHasCode(address: Address): Promise<boolean> {
    return hasCode(await this.client.getBytecode({ address }));
  }

  private async requireCode(address: Address, label: string): Promise<void> {
    if (!(await this.addressHasCode(address))) {
      throw new FlareNetworkError(
        'CONTRACT_NO_CODE',
        `${label} has no deployed bytecode at ${address}`,
      );
    }
  }
}

function hasCode(code: Hex | undefined): boolean {
  return code !== undefined && code !== NO_CODE;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
