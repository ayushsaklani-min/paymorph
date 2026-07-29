import { ixrpPaymentVerificationAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IXRPPaymentVerification';
import {
  encodeAbiParameters,
  getAddress,
  toHex,
  type AbiParameter,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import {
  FdcXrpPaymentClient,
  checkXrplFdcConfirmations,
  type FdcHttpClient,
  type FdcPublicClient,
  type FdcWalletClient,
  type PreparedXrpPaymentRequest,
  type SubmittedXrpPaymentRequest,
} from '../src/adapters/fdc/index.js';

const EXECUTOR = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const REGISTRY = getAddress('0x2000000000000000000000000000000000000001');
const FDC_HUB = getAddress('0x2000000000000000000000000000000000000002');
const FEE_CONFIG = getAddress('0x2000000000000000000000000000000000000003');
const SYSTEMS_MANAGER = getAddress('0x2000000000000000000000000000000000000004');
const RELAY = getAddress('0x2000000000000000000000000000000000000005');
const FDC_VERIFICATION = getAddress('0x2000000000000000000000000000000000000006');
const REQUEST_HASH: Hex = `0x${'ab'.repeat(32)}`;
const XRPL_TRANSACTION_ID: Hex = `0x${'cd'.repeat(32)}`;
const ABI_REQUEST: Hex = '0x1234';
const MERKLE_NODE: Hex = `0x${'ef'.repeat(32)}`;
const CONTRACT_CODE: Hex = '0x6000';

describe('FdcXrpPaymentClient', () => {
  it('requires the official three XRPL ledger confirmations before preparation', () => {
    expect(
      checkXrplFdcConfirmations({
        transactionLedgerIndex: 100,
        validatedLedgerIndex: 101,
      }),
    ).toMatchObject({
      status: 'PENDING',
      reason: 'XRPL_CONFIRMATIONS_PENDING',
    });
    expect(
      checkXrplFdcConfirmations({
        transactionLedgerIndex: 100,
        validatedLedgerIndex: 102,
      }),
    ).toEqual({
      status: 'READY',
      value: {
        confirmations: 3,
        transactionLedgerIndex: 100,
        validatedLedgerIndex: 102,
      },
    });
  });

  it('prepares the official XRPPayment request and binds proofOwner to the executor', async () => {
    const { httpClient, postJson } = mockHttp({
      status: 200,
      body: {
        status: 'VALID',
        abiEncodedRequest: ABI_REQUEST,
      },
      rawBody: '{}',
    });
    const client = createClient({ httpClient });

    const result = await client.prepareRequest({
      transactionId: XRPL_TRANSACTION_ID.slice(2),
    });

    expect(result).toEqual({
      status: 'READY',
      value: {
        transactionId: XRPL_TRANSACTION_ID,
        proofOwner: EXECUTOR.address,
        abiEncodedRequest: ABI_REQUEST,
      },
    });
    expect(postJson).toHaveBeenCalledWith(
      'https://verifier.example/verifier/xrp/XRPPayment/prepareRequest',
      {
        attestationType: toHex('XRPPayment', { size: 32 }),
        sourceId: toHex('testXRP', { size: 32 }),
        requestBody: {
          transactionId: XRPL_TRANSACTION_ID,
          proofOwner: EXECUTOR.address,
        },
      },
      { 'X-API-KEY': 'test-key' },
    );
  });

  it('rejects a proofOwner that is not the submitting executor', async () => {
    const { httpClient, postJson } = mockHttp({
      status: 200,
      body: {},
      rawBody: '{}',
    });
    const client = createClient({ httpClient });

    await expect(
      client.prepareRequest({
        transactionId: XRPL_TRANSACTION_ID,
        proofOwner: getAddress('0x2000000000000000000000000000000000000099'),
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      code: 'PROOF_OWNER_MISMATCH',
      retryable: false,
    });
    expect(postJson).not.toHaveBeenCalled();
  });

  it('submits the FdcHub request with the runtime fee and derives the voting round', async () => {
    const { publicClient, walletClient } = createChainClients({ finalized: false });
    const client = createClient({ publicClient, walletClient });
    const prepared = preparedRequest();

    const result = await client.submitRequest(prepared);

    expect(result).toEqual({
      status: 'READY',
      value: {
        ...prepared,
        requestTransactionHash: REQUEST_HASH,
        requestBlockNumber: 77n,
        votingRoundId: 10n,
      },
    });
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FDC_HUB,
        functionName: 'requestAttestation',
        args: [ABI_REQUEST],
        value: 42n,
      }),
    );
  });

  it('returns PENDING until Relay finalizes the FDC round', async () => {
    const { publicClient, walletClient } = createChainClients({ finalized: false });
    const { httpClient, postJson } = mockHttp({
      status: 500,
      body: undefined,
      rawBody: '',
    });
    const client = createClient({ publicClient, walletClient, httpClient });

    const result = await client.pollProof(submittedRequest());

    expect(result).toMatchObject({
      status: 'PENDING',
      reason: 'ROUND_NOT_FINALIZED',
      retryAfterMs: 1234,
    });
    expect(postJson).not.toHaveBeenCalled();
  });

  it('decodes and validates the finalized XRPPayment proof from the DA layer', async () => {
    const { publicClient, walletClient } = createChainClients({ finalized: true });
    const responseHex = encodeXrpPaymentResponse();
    const { httpClient } = mockHttp({
      status: 200,
      body: {
        response_hex: responseHex,
        proof: [MERKLE_NODE],
      },
      rawBody: '{}',
    });
    const client = createClient({ publicClient, walletClient, httpClient });

    const result = await client.pollProof(submittedRequest());

    expect(result).toMatchObject({
      status: 'READY',
      value: {
        merkleProof: [MERKLE_NODE],
        data: {
          votingRound: 10n,
          requestBody: {
            transactionId: XRPL_TRANSACTION_ID,
            proofOwner: EXECUTOR.address,
          },
        },
      },
    });
  });
});

function createClient(input: {
  publicClient?: FdcPublicClient;
  walletClient?: FdcWalletClient;
  httpClient?: FdcHttpClient;
}): FdcXrpPaymentClient {
  const chain = createChainClients({ finalized: false });
  return new FdcXrpPaymentClient({
    publicClient: input.publicClient ?? chain.publicClient,
    walletClient: input.walletClient ?? chain.walletClient,
    executorAccount: EXECUTOR,
    registryAddress: REGISTRY,
    verifierBaseUrl: 'https://verifier.example/',
    daLayerBaseUrl: 'https://da.example/',
    verifierApiKey: 'test-key',
    retryAfterMs: 1234,
    ...(input.httpClient === undefined ? {} : { httpClient: input.httpClient }),
  });
}

function createChainClients(input: { finalized: boolean }): {
  publicClient: FdcPublicClient;
  walletClient: FdcWalletClient;
} {
  const readContract = vi.fn((request: ReadRequest) => {
    if (request.functionName === 'getContractAddressByName') {
      const name = request.args?.[0];
      const addresses: Record<string, Address> = {
        FdcHub: FDC_HUB,
        FlareSystemsManager: SYSTEMS_MANAGER,
        Relay: RELAY,
        FdcVerification: FDC_VERIFICATION,
      };
      const address = typeof name === 'string' ? addresses[name] : undefined;
      if (address === undefined) throw new Error(`Unexpected registry name ${String(name)}`);
      return Promise.resolve(address);
    }
    if (request.functionName === 'fdcRequestFeeConfigurations') {
      return Promise.resolve(FEE_CONFIG);
    }
    if (request.functionName === 'getRequestFee') return Promise.resolve(42n);
    if (request.functionName === 'firstVotingRoundStartTs') return Promise.resolve(900n);
    if (request.functionName === 'votingEpochDurationSeconds') return Promise.resolve(10n);
    if (request.functionName === 'fdcProtocolId') return Promise.resolve(200);
    if (request.functionName === 'isFinalized') return Promise.resolve(input.finalized);
    throw new Error(`Unexpected read ${request.functionName}`);
  });
  const publicClient = {
    readContract,
    getBytecode: vi.fn(() => Promise.resolve(CONTRACT_CODE)),
    waitForTransactionReceipt: vi.fn(() =>
      Promise.resolve({
        status: 'success',
        blockNumber: 77n,
      }),
    ),
    getBlock: vi.fn(() =>
      Promise.resolve({
        timestamp: 1_000n,
      }),
    ),
  } as unknown as FdcPublicClient;
  const walletClient = {
    writeContract: vi.fn(() => Promise.resolve(REQUEST_HASH)),
  } as unknown as FdcWalletClient;
  return { publicClient, walletClient };
}

function preparedRequest(): PreparedXrpPaymentRequest {
  return {
    transactionId: XRPL_TRANSACTION_ID,
    proofOwner: EXECUTOR.address,
    abiEncodedRequest: ABI_REQUEST,
  };
}

function submittedRequest(): SubmittedXrpPaymentRequest {
  return {
    ...preparedRequest(),
    requestTransactionHash: REQUEST_HASH,
    requestBlockNumber: 77n,
    votingRoundId: 10n,
  };
}

function mockHttp(response: { status: number; body: unknown; rawBody: string }) {
  const postJson = vi.fn(() => Promise.resolve(response));
  return {
    httpClient: { postJson } satisfies FdcHttpClient,
    postJson,
  };
}

function encodeXrpPaymentResponse(): Hex {
  const responseParameter = (
    ixrpPaymentVerificationAbi.find(
      (item) => item.type === 'function' && item.name === 'verifyXRPPayment',
    ) as { inputs: readonly { components?: readonly AbiParameter[] }[] } | undefined
  )?.inputs[0]?.components?.[1];
  if (responseParameter === undefined) throw new Error('Missing response ABI');

  return encodeAbiParameters(
    [responseParameter],
    [
      {
        attestationType: toHex('XRPPayment', { size: 32 }),
        sourceId: toHex('testXRP', { size: 32 }),
        votingRound: 10n,
        lowestUsedTimestamp: 1n,
        requestBody: {
          transactionId: XRPL_TRANSACTION_ID,
          proofOwner: EXECUTOR.address,
        },
        responseBody: {
          blockNumber: 1n,
          blockTimestamp: 2n,
          sourceAddress: 'rPayer',
          sourceAddressHash: `0x${'01'.repeat(32)}`,
          receivingAddressHash: `0x${'02'.repeat(32)}`,
          intendedReceivingAddressHash: `0x${'02'.repeat(32)}`,
          spentAmount: 1_000_000n,
          intendedSpentAmount: 1_000_000n,
          receivedAmount: 1_000_000n,
          intendedReceivedAmount: 1_000_000n,
          hasMemoData: true,
          firstMemoData: '0xFE',
          hasDestinationTag: false,
          destinationTag: 0n,
          status: 0,
        },
      },
    ],
  );
}

interface ReadRequest {
  readonly functionName: string;
  readonly args?: readonly unknown[];
}
