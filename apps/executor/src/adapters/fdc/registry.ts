import { iFlareContractRegistryAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFlareContractRegistry';
import { getAddress, isAddressEqual, zeroAddress, type Address } from 'viem';
import type { FdcPublicClient } from './types.js';

export async function resolveRequiredFlareContract(
  client: FdcPublicClient,
  registryAddress: Address,
  name: string,
): Promise<Address> {
  const address = await client.readContract({
    address: registryAddress,
    abi: iFlareContractRegistryAbi,
    functionName: 'getContractAddressByName',
    args: [name],
  });
  if (isAddressEqual(address, zeroAddress)) {
    throw new Error(`Flare Contract Registry returned zero address for ${name}`);
  }
  const normalized = getAddress(address);
  const code = await client.getBytecode({ address: normalized });
  if (code === undefined || code === '0x') {
    throw new Error(`${name} has no deployed bytecode at ${normalized}`);
  }
  return normalized;
}
