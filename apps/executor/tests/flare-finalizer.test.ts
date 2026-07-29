import { encodeSmartAccountOperation } from '@paymorph/shared';
import { iDirectMintingAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IDirectMinting';
import { iMasterAccountControllerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IMasterAccountController';
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Address,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { XrpPaymentProof } from '../src/adapters/fdc/index.js';
import {
  assertPositiveRecoveryNetMint,
  decodeDirectMintReceipt,
  diagnoseDirectMintRecovery,
  FlareDirectMintFinalizer,
  payMorphRouterEventsAbi,
  type FlareExecutionPublicClient,
  type FlareExecutionWalletClient,
  type RecoveryMarkerFinalizeRequest,
  type RecoveryOriginalFinalizeRequest,
  type SettlementFinalizeRequest,
} from '../src/adapters/flare/index.js';

const EXECUTOR = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const ASSET_MANAGER = getAddress('0x3000000000000000000000000000000000000001');
const MASTER_ACCOUNT_CONTROLLER = getAddress('0x3000000000000000000000000000000000000002');
const ROUTER = getAddress('0x3000000000000000000000000000000000000003');
const PERSONAL_ACCOUNT = getAddress('0x3000000000000000000000000000000000000004');
const RECIPIENT = getAddress('0x3000000000000000000000000000000000000005');
const FXRP = getAddress('0x3000000000000000000000000000000000000006');
const TX_ID: Hex = `0x${'33'.repeat(32)}`;
const RECOVERY_TX_ID: Hex = `0x${'34'.repeat(32)}`;
const PAYMENT_ID: Hex = `0x${'44'.repeat(32)}`;
const FLARE_TX_HASH: Hex = `0x${'55'.repeat(32)}`;
const BLOCK_HASH: Hex = `0x${'77'.repeat(32)}`;
const NONCE = 9n;

describe('Flare direct-mint finalization', () => {
  it('simulates, submits, and returns authoritative settlement evidence', async () => {
    const request = settlementRequest(1n);
    const receipt = successReceipt(request);
    const publicClient = {
      simulateContract: vi.fn(() =>
        Promise.resolve({
          request: {
            account: EXECUTOR,
            address: ASSET_MANAGER,
            abi: iDirectMintingAbi,
            functionName: 'executeDirectMintingWithData',
            args: [request.proof, request.data],
            value: 1n,
          },
        }),
      ),
      waitForTransactionReceipt: vi.fn(() => Promise.resolve(receipt)),
    } as unknown as FlareExecutionPublicClient;
    const walletClient = {
      writeContract: vi.fn(() => Promise.resolve(FLARE_TX_HASH)),
    } as unknown as FlareExecutionWalletClient;
    const finalizer = new FlareDirectMintFinalizer({
      publicClient,
      walletClient,
      executorAccount: EXECUTOR,
      assetManagerAddress: ASSET_MANAGER,
      masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
      payMorphRouterAddress: ROUTER,
    });
    const onSubmitted = vi.fn(() => Promise.resolve());

    const result = await finalizer.finalize(request, onSubmitted);

    expect(result).toMatchObject({
      status: 'READY',
      transactionHash: FLARE_TX_HASH,
      evidence: {
        smartAccountMint: {
          transactionId: TX_ID,
          executor: EXECUTOR.address,
        },
        masterAccountMint: {
          personalAccount: PERSONAL_ACCOUNT,
          transactionId: TX_ID,
        },
        userOperation: {
          personalAccount: PERSONAL_ACCOUNT,
          nonce: NONCE,
        },
        paymentSettled: {
          paymentId: PAYMENT_ID,
          payerPersonalAccount: PERSONAL_ACCOUNT,
          invoiceAmount: 1_000_000n,
        },
        recipientsPaid: [
          {
            paymentId: PAYMENT_ID,
            recipient: RECIPIENT,
            token: FXRP,
            amount: 1_000_000n,
            bps: 10_000,
          },
        ],
      },
    });
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'executeDirectMintingWithData',
        value: 1n,
        nonce: 17,
      }),
    );
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
    expect(onSubmitted).toHaveBeenCalledWith(FLARE_TX_HASH);
  });

  it('fails before simulation when declared call value differs from committed calls', async () => {
    const request = settlementRequest(0n);
    const publicClient = {
      simulateContract: vi.fn(),
      getTransactionCount: vi.fn(),
    } as unknown as FlareExecutionPublicClient;
    const finalizer = new FlareDirectMintFinalizer({
      publicClient,
      walletClient: { writeContract: vi.fn() },
      executorAccount: EXECUTOR,
      assetManagerAddress: ASSET_MANAGER,
      masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
      payMorphRouterAddress: ROUTER,
    });

    await expect(finalizer.finalize(request)).resolves.toMatchObject({
      status: 'FAILED',
      code: 'TOTAL_CALL_VALUE_MISMATCH',
      retryable: false,
    });
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('returns PENDING with retry semantics for a delayed mint', () => {
    const request = settlementRequest(1n);
    const receipt = receiptWithLogs([
      log(
        ASSET_MANAGER,
        encodeEventTopics({
          abi: iDirectMintingAbi,
          eventName: 'DirectMintingDelayed',
        }),
        encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }],
          [TX_ID, 1_200_000n, 9_999n],
        ),
        0,
      ),
    ]);

    expect(
      decodeDirectMintReceipt(receipt, request, {
        assetManagerAddress: ASSET_MANAGER,
        masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
        payMorphRouterAddress: ROUTER,
      }),
    ).toMatchObject({
      status: 'PENDING',
      reason: 'DIRECT_MINT_DELAYED',
      executionAllowedAt: 9_999n,
      amountUBA: 1_200_000n,
    });
  });
});

describe('0xE0 recovery diagnostics', () => {
  it('uses MasterAccountController transaction-used state for eligibility', async () => {
    const publicClient = {
      readContract: vi.fn((request: { functionName: string }) => {
        if (request.functionName === 'isTransactionIdUsed') return Promise.resolve(false);
        if (request.functionName === 'getNonce') return Promise.resolve(9n);
        if (request.functionName === 'getExecutor') return Promise.resolve(EXECUTOR.address);
        throw new Error(`Unexpected ${request.functionName}`);
      }),
    } as unknown as FlareExecutionPublicClient;

    await expect(
      diagnoseDirectMintRecovery({
        publicClient,
        masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
        personalAccount: PERSONAL_ACCOUNT,
        originalTransactionId: TX_ID,
      }),
    ).resolves.toEqual({
      status: 'ELIGIBLE',
      reason: 'TRANSACTION_UNUSED',
      targetTransactionId: TX_ID,
      personalAccount: PERSONAL_ACCOUNT,
      currentNonce: 9n,
      pinnedExecutor: EXECUTOR.address,
      requiresPositiveRecoveryNetMint: true,
    });
  });

  it('requires a positive net mint on the recovery payment', () => {
    expect(() => assertPositiveRecoveryNetMint(0n)).toThrow(/positive net FXRP/);
    expect(() => assertPositiveRecoveryNetMint(1n)).not.toThrow();
  });

  it('requires marker evidence and skips the original user operation during recovery', () => {
    const marker = recoveryMarkerRequest();
    const markerResult = decodeDirectMintReceipt(recoveryMarkerReceipt(marker), marker, {
      assetManagerAddress: ASSET_MANAGER,
      masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
      payMorphRouterAddress: ROUTER,
    });
    expect(markerResult).toMatchObject({
      status: 'READY',
      evidence: {
        masterAccountMint: {
          transactionId: RECOVERY_TX_ID,
          personalAccount: PERSONAL_ACCOUNT,
          amountUBA: 1_000_000n,
        },
        ignoreMemo: {
          personalAccount: PERSONAL_ACCOUNT,
          targetTransactionId: TX_ID,
        },
      },
    });

    const original = recoveryOriginalRequest();
    const originalResult = decodeDirectMintReceipt(
      recoveryOriginalReceipt(original, false),
      original,
      {
        assetManagerAddress: ASSET_MANAGER,
        masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
        payMorphRouterAddress: ROUTER,
      },
    );
    expect(originalResult).toMatchObject({
      status: 'READY',
      evidence: {
        masterAccountMint: {
          transactionId: TX_ID,
          personalAccount: PERSONAL_ACCOUNT,
          amountUBA: 1_000_000n,
        },
      },
    });
    if (originalResult.status === 'READY') {
      expect(originalResult.evidence.userOperation).toBeUndefined();
      expect(originalResult.evidence.paymentSettled).toBeUndefined();
    }

    expect(
      decodeDirectMintReceipt(recoveryOriginalReceipt(original, true), original, {
        assetManagerAddress: ASSET_MANAGER,
        masterAccountControllerAddress: MASTER_ACCOUNT_CONTROLLER,
        payMorphRouterAddress: ROUTER,
      }),
    ).toMatchObject({
      status: 'FAILED',
      code: 'EVIDENCE_MISMATCH',
    });
  });
});

function settlementRequest(declaredTotalCallValue: bigint): SettlementFinalizeRequest {
  const operation = encodeSmartAccountOperation({
    calls: [
      {
        target: ROUTER,
        value: 1n,
        data: '0x',
      },
    ],
    sender: PERSONAL_ACCOUNT,
    nonce: NONCE,
    walletId: 0,
    executorFeeUBA: 100_000n,
  });
  return {
    purpose: 'SETTLEMENT',
    executorNonce: 17n,
    proof: proof(operation.memoHex),
    data: operation.packedUserOpData,
    transactionId: TX_ID,
    personalAccount: PERSONAL_ACCOUNT,
    declaredTotalCallValue,
    nonce: NONCE,
    paymentId: PAYMENT_ID,
  };
}

function proof(memoData: Hex): XrpPaymentProof {
  return proofFor(TX_ID, memoData);
}

function proofFor(transactionId: Hex, memoData: Hex): XrpPaymentProof {
  return {
    merkleProof: [`0x${'66'.repeat(32)}`],
    data: {
      attestationType: `0x${'00'.repeat(32)}`,
      sourceId: `0x${'00'.repeat(32)}`,
      votingRound: 1n,
      lowestUsedTimestamp: 1n,
      requestBody: {
        transactionId,
        proofOwner: EXECUTOR.address,
      },
      responseBody: {
        blockNumber: 1n,
        blockTimestamp: 1n,
        sourceAddress: 'rPayer',
        sourceAddressHash: `0x${'01'.repeat(32)}`,
        receivingAddressHash: `0x${'02'.repeat(32)}`,
        intendedReceivingAddressHash: `0x${'02'.repeat(32)}`,
        spentAmount: 1_200_000n,
        intendedSpentAmount: 1_200_000n,
        receivedAmount: 1_200_000n,
        intendedReceivedAmount: 1_200_000n,
        hasMemoData: true,
        firstMemoData: memoData,
        hasDestinationTag: false,
        destinationTag: 0n,
        status: 0,
      },
    },
  };
}

function recoveryMarkerRequest(): RecoveryMarkerFinalizeRequest {
  const memoData = `0xe000${'00'.repeat(8)}${TX_ID.slice(2)}` as Hex;
  return {
    purpose: 'RECOVERY_MARKER',
    executorNonce: 18n,
    proof: proofFor(RECOVERY_TX_ID, memoData),
    data: '0x',
    transactionId: RECOVERY_TX_ID,
    personalAccount: PERSONAL_ACCOUNT,
    originalTransactionId: TX_ID,
    expectedNetMintUBA: 1_000_000n,
  };
}

function recoveryOriginalRequest(): RecoveryOriginalFinalizeRequest {
  const settlement = settlementRequest(1n);
  return {
    purpose: 'RECOVERY_ORIGINAL',
    executorNonce: 19n,
    proof: settlement.proof,
    data: settlement.data,
    transactionId: settlement.transactionId,
    personalAccount: settlement.personalAccount,
    declaredTotalCallValue: settlement.declaredTotalCallValue,
    nonce: settlement.nonce,
  };
}

function directMintEvidenceLogs(
  transactionId: Hex,
  memoData: Hex,
  amountUBA: bigint,
): Log[] {
  return [
    log(
      ASSET_MANAGER,
      encodeEventTopics({
        abi: iDirectMintingAbi,
        eventName: 'DirectMintingExecutedToSmartAccount',
      }),
      encodeAbiParameters(
        [
          { type: 'bytes32' },
          { type: 'string' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'bytes' },
        ],
        [transactionId, 'rPayer', EXECUTOR.address, amountUBA + 100_000n, 100_000n, memoData],
      ),
      0,
    ),
    log(
      MASTER_ACCOUNT_CONTROLLER,
      encodeEventTopics({
        abi: iMasterAccountControllerAbi,
        eventName: 'DirectMintingExecuted',
        args: {
          personalAccount: PERSONAL_ACCOUNT,
          transactionId,
        },
      }),
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
        ['rPayer', amountUBA, 100_000n, EXECUTOR.address],
      ),
      1,
    ),
  ];
}

function recoveryMarkerReceipt(request: RecoveryMarkerFinalizeRequest): TransactionReceipt {
  return receiptWithLogs([
    ...directMintEvidenceLogs(
      request.transactionId,
      request.proof.data.responseBody.firstMemoData,
      request.expectedNetMintUBA,
    ),
    log(
      MASTER_ACCOUNT_CONTROLLER,
      encodeEventTopics({
        abi: iMasterAccountControllerAbi,
        eventName: 'IgnoreMemoSet',
        args: {
          personalAccount: PERSONAL_ACCOUNT,
          targetTxId: request.originalTransactionId,
        },
      }),
      '0x',
      2,
    ),
  ]);
}

function recoveryOriginalReceipt(
  request: RecoveryOriginalFinalizeRequest,
  includeUnexpectedUserOperation: boolean,
): TransactionReceipt {
  const logs = directMintEvidenceLogs(
    request.transactionId,
    request.proof.data.responseBody.firstMemoData,
    1_000_000n,
  );
  if (includeUnexpectedUserOperation) {
    logs.push(
      log(
        MASTER_ACCOUNT_CONTROLLER,
        encodeEventTopics({
          abi: iMasterAccountControllerAbi,
          eventName: 'UserOperationExecuted',
          args: { personalAccount: PERSONAL_ACCOUNT },
        }),
        encodeAbiParameters([{ type: 'uint256' }], [NONCE]),
        2,
      ),
    );
  }
  return receiptWithLogs(logs);
}

function successReceipt(request: SettlementFinalizeRequest): TransactionReceipt {
  const memoData = request.proof.data.responseBody.firstMemoData;
  return receiptWithLogs([
    log(
      ASSET_MANAGER,
      encodeEventTopics({
        abi: iDirectMintingAbi,
        eventName: 'DirectMintingExecutedToSmartAccount',
      }),
      encodeAbiParameters(
        [
          { type: 'bytes32' },
          { type: 'string' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'bytes' },
        ],
        [TX_ID, 'rPayer', EXECUTOR.address, 1_100_000n, 100_000n, memoData],
      ),
      0,
    ),
    log(
      MASTER_ACCOUNT_CONTROLLER,
      encodeEventTopics({
        abi: iMasterAccountControllerAbi,
        eventName: 'DirectMintingExecuted',
        args: {
          personalAccount: PERSONAL_ACCOUNT,
          transactionId: TX_ID,
        },
      }),
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
        ['rPayer', 1_000_000n, 100_000n, EXECUTOR.address],
      ),
      1,
    ),
    log(
      MASTER_ACCOUNT_CONTROLLER,
      encodeEventTopics({
        abi: iMasterAccountControllerAbi,
        eventName: 'UserOperationExecuted',
        args: {
          personalAccount: PERSONAL_ACCOUNT,
        },
      }),
      encodeAbiParameters([{ type: 'uint256' }], [NONCE]),
      2,
    ),
    log(
      ROUTER,
      encodeEventTopics({
        abi: payMorphRouterEventsAbi,
        eventName: 'RecipientPaid',
        args: {
          paymentId: PAYMENT_ID,
          recipient: RECIPIENT,
          token: FXRP,
        },
      }),
      encodeAbiParameters([{ type: 'uint256' }, { type: 'uint16' }], [1_000_000n, 10_000]),
      3,
    ),
    log(
      ROUTER,
      encodeEventTopics({
        abi: payMorphRouterEventsAbi,
        eventName: 'PaymentSettled',
        args: {
          paymentId: PAYMENT_ID,
          payerPersonalAccount: PERSONAL_ACCOUNT,
        },
      }),
      encodeAbiParameters(
        [
          { type: 'uint8' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'address' },
          { type: 'uint256' },
        ],
        [0, 1_000_000n, 5_000n, 1_005_000n, PERSONAL_ACCOUNT, 0n],
      ),
      4,
    ),
  ]);
}

function log(
  address: Address,
  topics: ReturnType<typeof encodeEventTopics>,
  data: Hex,
  logIndex: number,
): Log {
  return {
    address,
    topics: topics as Log['topics'],
    data,
    blockNumber: 88n,
    blockHash: BLOCK_HASH,
    transactionHash: FLARE_TX_HASH,
    transactionIndex: 0,
    logIndex,
    removed: false,
  };
}

function receiptWithLogs(logs: readonly Log[]): TransactionReceipt {
  return {
    transactionHash: FLARE_TX_HASH,
    blockNumber: 88n,
    status: 'success',
    logs,
  } as unknown as TransactionReceipt;
}
