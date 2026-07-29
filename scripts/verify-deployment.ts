import { readFile } from 'node:fs/promises';
import {
  COSTON2_CHAIN_ID,
  createCoston2PublicClient,
  FlareNetworkProvider,
} from '../packages/shared/src/index.js';
import { getAddress, isAddress, isAddressEqual, type Address } from 'viem';

interface DeploymentManifest {
  network: string;
  chainId: number;
  routerAddress: string;
  adapterAddress: string;
  assetManagerAddress: string;
  fxrpAddress: string;
  serviceFeeBps: number;
  feeRecipient: string;
}

const routerAbi = [
  {
    type: 'function',
    name: 'serviceFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'feeRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

const manifestPath =
  process.argv[2] ??
  process.env.DEPLOYMENT_MANIFEST ??
  'packages/contracts/deployments/coston2.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DeploymentManifest;
if (manifest.network !== 'coston2' || manifest.chainId !== COSTON2_CHAIN_ID) {
  throw new Error('Deployment manifest must target Coston2 chain 114');
}
for (const [field, value] of Object.entries({
  routerAddress: manifest.routerAddress,
  adapterAddress: manifest.adapterAddress,
  assetManagerAddress: manifest.assetManagerAddress,
  fxrpAddress: manifest.fxrpAddress,
  feeRecipient: manifest.feeRecipient,
})) {
  if (!isAddress(value)) throw new Error(`${field} is not an EVM address`);
}

const client = createCoston2PublicClient(process.env.COSTON2_RPC_URL);
const provider = new FlareNetworkProvider(client, {
  ...(process.env.FLARE_CONTRACT_REGISTRY
    ? { registryAddress: getAddress(process.env.FLARE_CONTRACT_REGISTRY) }
    : {}),
});
const network = await provider.resolveNetwork(
  Number.parseInt(process.env.MAX_FTSO_AGE_SECONDS ?? '120', 10),
);
const deployedAddresses = [
  manifest.routerAddress,
  manifest.assetManagerAddress,
  manifest.fxrpAddress,
] as Address[];
if (getAddress(manifest.adapterAddress) !== '0x0000000000000000000000000000000000000000') {
  deployedAddresses.push(getAddress(manifest.adapterAddress));
}
const code = await Promise.all(
  deployedAddresses.map((address) => client.getBytecode({ address: getAddress(address) })),
);
if (code.some((value) => !value || value === '0x')) {
  throw new Error('One or more manifest contracts have no deployed bytecode');
}
if (
  !isAddressEqual(getAddress(manifest.assetManagerAddress), network.contracts.assetManagerFXRP) ||
  !isAddressEqual(getAddress(manifest.fxrpAddress), network.fxrp.address)
) {
  throw new Error('Manifest AssetManager/FXRP does not match live registry resolution');
}
const [serviceFeeBps, feeRecipient] = await Promise.all([
  client.readContract({
    address: getAddress(manifest.routerAddress),
    abi: routerAbi,
    functionName: 'serviceFeeBps',
  }),
  client.readContract({
    address: getAddress(manifest.routerAddress),
    abi: routerAbi,
    functionName: 'feeRecipient',
  }),
]);
if (
  serviceFeeBps !== manifest.serviceFeeBps ||
  !isAddressEqual(feeRecipient, getAddress(manifest.feeRecipient))
) {
  throw new Error('Manifest router configuration does not match live contract state');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      manifestPath,
      chainId: network.chainId,
      blockNumber: network.blockNumber.toString(),
      routerAddress: getAddress(manifest.routerAddress),
      assetManagerAddress: network.contracts.assetManagerFXRP,
      fxrpAddress: network.fxrp.address,
      serviceFeeBps,
      feeRecipient,
    },
    null,
    2,
  ),
);
