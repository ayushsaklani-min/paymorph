import { iDirectMintingAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IDirectMinting';
import { iMasterAccountControllerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IMasterAccountController';
import { iPersonalAccountAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IPersonalAccount';
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { payMorphRouterEventsAbi, packedUserOperationParameter } from './abis.js';
import type {
  DirectMintFinalization,
  DirectMintFinalizeRequest,
  DirectMintReceiptEvidence,
  FlareDirectMintFinalizerConfig,
  MasterAccountMintEvidence,
  PaymentSettledEvidence,
  RecipientPaidEvidence,
  SmartAccountMintEvidence,
} from './types.js';

export class FlareDirectMintFinalizer {
  readonly #config: FlareDirectMintFinalizerConfig;

  constructor(config: FlareDirectMintFinalizerConfig) {
    this.#config = {
      ...config,
      assetManagerAddress: getAddress(config.assetManagerAddress),
      masterAccountControllerAddress: getAddress(config.masterAccountControllerAddress),
      payMorphRouterAddress: getAddress(config.payMorphRouterAddress),
    };
  }

  get executorAddress(): Address {
    return getAddress(this.#config.executorAccount.address);
  }

  async getPendingNonce(): Promise<bigint> {
    const nonce = await this.#config.publicClient.getTransactionCount({
      address: this.executorAddress,
      blockTag: 'pending',
    });
    return BigInt(nonce);
  }

  async finalize(
    request: DirectMintFinalizeRequest,
    onSubmitted?: (transactionHash: Hex) => Promise<void>,
  ): Promise<DirectMintFinalization> {
    const validationFailure = validateFinalizeRequest(
      request,
      this.#config.executorAccount.address,
    );
    if (validationFailure !== undefined) return validationFailure;

    const value = request.purpose === 'SETTLEMENT' ? request.declaredTotalCallValue : 0n;
    const executorNonce = toTransactionNonce(request.executorNonce);

    let simulation;
    try {
      simulation = await this.#config.publicClient.simulateContract({
        account: this.#config.executorAccount,
        address: this.#config.assetManagerAddress,
        abi: iDirectMintingAbi,
        functionName: 'executeDirectMintingWithData',
        args: [request.proof, request.data],
        value,
        nonce: executorNonce,
      });
    } catch (error) {
      return failed(
        'SIMULATION_FAILED',
        true,
        `executeDirectMintingWithData simulation failed: ${errorMessage(error)}`,
      );
    }

    let transactionHash: Hex;
    try {
      transactionHash = await this.#config.walletClient.writeContract(simulation.request);
    } catch (error) {
      return failed(
        'SUBMISSION_FAILED',
        true,
        `executeDirectMintingWithData submission failed: ${errorMessage(error)}`,
      );
    }
    if (onSubmitted) {
      try {
        await onSubmitted(transactionHash);
      } catch (error) {
        return failed(
          'SUBMISSION_FAILED',
          true,
          `Unable to checkpoint submitted Coston2 transaction ${transactionHash}: ${errorMessage(error)}`,
          transactionHash,
        );
      }
    }

    return this.resume(request, transactionHash);
  }

  async resume(
    request: DirectMintFinalizeRequest,
    transactionHash: Hex,
  ): Promise<DirectMintFinalization> {
    const validationFailure = validateFinalizeRequest(
      request,
      this.#config.executorAccount.address,
    );
    if (validationFailure !== undefined) return validationFailure;

    let receipt: TransactionReceipt;
    try {
      receipt = await this.#config.publicClient.waitForTransactionReceipt({
        hash: transactionHash,
      });
    } catch (error) {
      return failed(
        'SUBMISSION_FAILED',
        true,
        `Unable to obtain Coston2 receipt for ${transactionHash}: ${errorMessage(error)}`,
        transactionHash,
      );
    }
    if (receipt.status !== 'success') {
      return failed(
        'TRANSACTION_REVERTED',
        false,
        `executeDirectMintingWithData reverted in ${transactionHash}`,
        transactionHash,
      );
    }

    return decodeDirectMintReceipt(receipt, request, this.#config);
  }
}

export function decodeDirectMintReceipt(
  receipt: TransactionReceipt,
  request: DirectMintFinalizeRequest,
  addresses: Pick<
    FlareDirectMintFinalizerConfig,
    'assetManagerAddress' | 'masterAccountControllerAddress' | 'payMorphRouterAddress'
  >,
): DirectMintFinalization {
  const transactionId = normalizeBytes32(request.transactionId);
  const assetManagerLogs = receipt.logs.filter((log) =>
    isAddressEqual(log.address, addresses.assetManagerAddress),
  );
  const delay = parseEventLogs({
    abi: iDirectMintingAbi,
    eventName: 'DirectMintingDelayed',
    logs: assetManagerLogs,
    strict: true,
  }).find((event) => sameHex(event.args.transactionId, transactionId));
  if (delay !== undefined) {
    return {
      status: 'PENDING',
      reason: 'DIRECT_MINT_DELAYED',
      transactionHash: receipt.transactionHash,
      executionAllowedAt: delay.args.executionAllowedAt,
      amountUBA: delay.args.amount,
      detail: 'Retry the same proof after executionAllowedAt; do not send another XRP payment',
    };
  }
  const largeDelay = parseEventLogs({
    abi: iDirectMintingAbi,
    eventName: 'LargeDirectMintingDelayed',
    logs: assetManagerLogs,
    strict: true,
  }).find((event) => sameHex(event.args.transactionId, transactionId));
  if (largeDelay !== undefined) {
    return {
      status: 'PENDING',
      reason: 'LARGE_DIRECT_MINT_DELAYED',
      transactionHash: receipt.transactionHash,
      executionAllowedAt: largeDelay.args.executionAllowedAt,
      amountUBA: largeDelay.args.amount,
      detail: 'Retry the same proof after executionAllowedAt; do not send another XRP payment',
    };
  }

  const smartMintLog = parseEventLogs({
    abi: iDirectMintingAbi,
    eventName: 'DirectMintingExecutedToSmartAccount',
    logs: assetManagerLogs,
    strict: true,
  }).find((event) => sameHex(event.args.transactionId, transactionId));
  if (smartMintLog === undefined) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      `DirectMintingExecutedToSmartAccount missing for ${transactionId}`,
      receipt.transactionHash,
    );
  }
  const smartAccountMint: SmartAccountMintEvidence = {
    logIndex: smartMintLog.logIndex,
    transactionId: smartMintLog.args.transactionId,
    sourceAddress: smartMintLog.args.sourceAddress,
    executor: smartMintLog.args.executor,
    mintedAmountUBA: smartMintLog.args.mintedAmountUBA,
    mintingFeeUBA: smartMintLog.args.mintingFeeUBA,
    memoData: smartMintLog.args.memoData,
  };
  if (
    !isAddressEqual(smartAccountMint.executor, request.proof.data.requestBody.proofOwner) ||
    !sameHex(smartAccountMint.memoData, request.proof.data.responseBody.firstMemoData)
  ) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      'AssetManager smart-account mint executor or memo does not match the FDC proof',
      receipt.transactionHash,
    );
  }

  const macLogs = receipt.logs.filter((log) =>
    isAddressEqual(log.address, addresses.masterAccountControllerAddress),
  );
  const masterMintLog = parseEventLogs({
    abi: iMasterAccountControllerAbi,
    eventName: 'DirectMintingExecuted',
    logs: macLogs,
    strict: true,
  }).find(
    (event) =>
      sameHex(event.args.transactionId, transactionId) &&
      isAddressEqual(event.args.personalAccount, request.personalAccount),
  );
  if (masterMintLog === undefined) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      `MasterAccountController DirectMintingExecuted missing for ${transactionId}`,
      receipt.transactionHash,
    );
  }
  const masterAccountMint: MasterAccountMintEvidence = {
    logIndex: masterMintLog.logIndex,
    personalAccount: masterMintLog.args.personalAccount,
    transactionId: masterMintLog.args.transactionId,
    sourceAddress: masterMintLog.args.sourceAddress,
    amountUBA: masterMintLog.args.amount,
    executorFeeUBA: masterMintLog.args.executorFee,
    executor: masterMintLog.args.executor,
  };
  if (!isAddressEqual(masterAccountMint.executor, request.proof.data.requestBody.proofOwner)) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      'MasterAccountController mint executor does not match the FDC proofOwner',
      receipt.transactionHash,
    );
  }

  const baseEvidence = {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    smartAccountMint,
    masterAccountMint,
    recipientsPaid: [],
  } satisfies DirectMintReceiptEvidence;

  if (request.purpose === 'RECOVERY_MARKER') {
    if (
      request.expectedNetMintUBA <= 0n ||
      masterAccountMint.amountUBA !== request.expectedNetMintUBA
    ) {
      return failed(
        'EVIDENCE_MISMATCH',
        false,
        'Recovery marker minted amount does not match the planned positive net mint',
        receipt.transactionHash,
      );
    }
    const ignoreMemoLog = parseEventLogs({
      abi: iMasterAccountControllerAbi,
      eventName: 'IgnoreMemoSet',
      logs: macLogs,
      strict: true,
    }).find(
      (event) =>
        isAddressEqual(event.args.personalAccount, request.personalAccount) &&
        sameHex(event.args.targetTxId, request.originalTransactionId),
    );
    if (ignoreMemoLog === undefined) {
      return failed(
        'EVIDENCE_MISMATCH',
        false,
        'IgnoreMemoSet missing for the original transaction',
        receipt.transactionHash,
      );
    }
    return {
      status: 'READY',
      transactionHash: receipt.transactionHash,
      receipt,
      evidence: {
        ...baseEvidence,
        ignoreMemo: {
          logIndex: ignoreMemoLog.logIndex,
          personalAccount: ignoreMemoLog.args.personalAccount,
          targetTransactionId: ignoreMemoLog.args.targetTxId,
        },
      },
    };
  }

  if (request.purpose === 'RECOVERY_ORIGINAL') {
    const unexpectedUserOperation = parseEventLogs({
      abi: iMasterAccountControllerAbi,
      eventName: 'UserOperationExecuted',
      logs: macLogs,
      strict: true,
    }).find((event) => isAddressEqual(event.args.personalAccount, request.personalAccount));
    const routerLogs = receipt.logs.filter((log) =>
      isAddressEqual(log.address, addresses.payMorphRouterAddress),
    );
    const unexpectedSettlement = parseEventLogs({
      abi: payMorphRouterEventsAbi,
      eventName: 'PaymentSettled',
      logs: routerLogs,
      strict: true,
    })[0];
    if (
      masterAccountMint.amountUBA <= 0n ||
      unexpectedUserOperation !== undefined ||
      unexpectedSettlement !== undefined
    ) {
      return failed(
        'EVIDENCE_MISMATCH',
        false,
        'Recovery original must mint positively while skipping user operation and settlement',
        receipt.transactionHash,
      );
    }
    return {
      status: 'READY',
      transactionHash: receipt.transactionHash,
      receipt,
      evidence: baseEvidence,
    };
  }

  const userOperationLog = parseEventLogs({
    abi: iMasterAccountControllerAbi,
    eventName: 'UserOperationExecuted',
    logs: macLogs,
    strict: true,
  }).find(
    (event) =>
      isAddressEqual(event.args.personalAccount, request.personalAccount) &&
      event.args.nonce === request.nonce,
  );
  if (userOperationLog === undefined) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      `UserOperationExecuted missing for nonce ${request.nonce}`,
      receipt.transactionHash,
    );
  }

  const routerLogs = receipt.logs.filter((log) =>
    isAddressEqual(log.address, addresses.payMorphRouterAddress),
  );
  const paymentSettledLog = parseEventLogs({
    abi: payMorphRouterEventsAbi,
    eventName: 'PaymentSettled',
    logs: routerLogs,
    strict: true,
  }).find(
    (event) =>
      sameHex(event.args.paymentId, request.paymentId) &&
      isAddressEqual(event.args.payerPersonalAccount, request.personalAccount),
  );
  if (paymentSettledLog === undefined) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      `PayMorphRouter.PaymentSettled missing for ${request.paymentId}`,
      receipt.transactionHash,
    );
  }
  const paymentSettled: PaymentSettledEvidence = {
    logIndex: paymentSettledLog.logIndex,
    paymentId: paymentSettledLog.args.paymentId,
    payerPersonalAccount: paymentSettledLog.args.payerPersonalAccount,
    asset: paymentSettledLog.args.asset,
    invoiceAmount: paymentSettledLog.args.invoiceAmount,
    serviceFee: paymentSettledLog.args.serviceFee,
    inputFxrpUsed: paymentSettledLog.args.inputFxrpUsed,
    refundTo: paymentSettledLog.args.refundTo,
    refundFxrp: paymentSettledLog.args.refundFxrp,
  };

  const recipientsPaid: RecipientPaidEvidence[] = parseEventLogs({
    abi: payMorphRouterEventsAbi,
    eventName: 'RecipientPaid',
    logs: routerLogs,
    strict: true,
  })
    .filter((event) => sameHex(event.args.paymentId, request.paymentId))
    .map((event) => ({
      logIndex: event.logIndex,
      paymentId: event.args.paymentId,
      recipient: event.args.recipient,
      token: event.args.token,
      amount: event.args.amount,
      bps: event.args.bps,
    }));
  if (recipientsPaid.length === 0) {
    return failed(
      'EVIDENCE_MISMATCH',
      false,
      `RecipientPaid events missing for ${request.paymentId}`,
      receipt.transactionHash,
    );
  }

  return {
    status: 'READY',
    transactionHash: receipt.transactionHash,
    receipt,
    evidence: {
      ...baseEvidence,
      userOperation: {
        logIndex: userOperationLog.logIndex,
        personalAccount: userOperationLog.args.personalAccount,
        nonce: userOperationLog.args.nonce,
      },
      paymentSettled,
      recipientsPaid,
    },
  };
}

function validateFinalizeRequest(
  request: DirectMintFinalizeRequest,
  executorAddress: Address,
): Extract<DirectMintFinalization, { status: 'FAILED' }> | undefined {
  try {
    const expectedTransactionId = normalizeBytes32(request.transactionId);
    const proofTransactionId = normalizeBytes32(request.proof.data.requestBody.transactionId);
    if (!sameHex(expectedTransactionId, proofTransactionId)) {
      return failed('INVALID_INPUT', false, 'FDC proof transaction ID does not match request');
    }
    if (!isAddressEqual(request.proof.data.requestBody.proofOwner, getAddress(executorAddress))) {
      return failed(
        'PROOF_OWNER_MISMATCH',
        false,
        `FDC proofOwner must equal executor ${getAddress(executorAddress)}`,
      );
    }
    toTransactionNonce(request.executorNonce);
    if (request.purpose === 'RECOVERY_MARKER') {
      if (
        !request.proof.data.responseBody.hasMemoData ||
        request.proof.data.responseBody.hasDestinationTag ||
        request.proof.data.responseBody.firstMemoData.length !== 86 ||
        request.proof.data.responseBody.firstMemoData.slice(0, 4).toLowerCase() !== '0xe0' ||
        !sameHex(
          `0x${request.proof.data.responseBody.firstMemoData.slice(-64)}`,
          request.originalTransactionId,
        ) ||
        request.expectedNetMintUBA <= 0n
      ) {
        return failed(
          'INVALID_INPUT',
          false,
          'Recovery proof does not contain the expected 42-byte 0xE0 memo',
        );
      }
      return undefined;
    }
    if (request.declaredTotalCallValue < 0n) {
      return failed('INVALID_INPUT', false, 'Declared call value cannot be negative');
    }
    const memoData = request.proof.data.responseBody.firstMemoData;
    if (
      !request.proof.data.responseBody.hasMemoData ||
      request.proof.data.responseBody.hasDestinationTag ||
      memoData.length !== 86 ||
      memoData.slice(0, 4).toLowerCase() !== '0xfe' ||
      !sameHex(`0x${memoData.slice(-64)}`, keccak256(request.data))
    ) {
      return failed(
        'INVALID_INPUT',
        false,
        'FDC proof memo does not commit to the supplied PackedUserOperation',
      );
    }
    const [packedUserOperation] = decodeAbiParameters([packedUserOperationParameter], request.data);
    if (!isAddressEqual(packedUserOperation.sender, request.personalAccount)) {
      return failed('INVALID_INPUT', false, 'Packed user-operation sender mismatch');
    }
    if (packedUserOperation.nonce !== request.nonce) {
      return failed('INVALID_INPUT', false, 'Packed user-operation nonce mismatch');
    }
    const decodedCall = decodeFunctionData({
      abi: iPersonalAccountAbi,
      data: packedUserOperation.callData,
    });
    if (decodedCall.functionName !== 'executeUserOp') {
      return failed('INVALID_INPUT', false, 'PersonalAccount callData is not executeUserOp');
    }
    const calls = decodedCall.args[0];
    const actualTotalCallValue = calls.reduce((sum, call) => sum + call.value, 0n);
    if (actualTotalCallValue !== request.declaredTotalCallValue) {
      return failed(
        'TOTAL_CALL_VALUE_MISMATCH',
        false,
        `Committed calls require ${actualTotalCallValue}, declared ${request.declaredTotalCallValue}`,
      );
    }
  } catch (error) {
    return failed(
      'INVALID_INPUT',
      false,
      `Invalid direct-mint finalization input: ${errorMessage(error)}`,
    );
  }
  return undefined;
}

function toTransactionNonce(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Executor transaction nonce must be a nonnegative safe integer');
  }
  return Number(value);
}

function normalizeBytes32(value: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new TypeError('Expected bytes32 hex value');
  }
  return value.toLowerCase() as Hex;
}

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function failed(
  code: Extract<DirectMintFinalization, { status: 'FAILED' }>['code'],
  retryable: boolean,
  detail: string,
  transactionHash?: Hex,
): Extract<DirectMintFinalization, { status: 'FAILED' }> {
  return {
    status: 'FAILED',
    code,
    retryable,
    detail,
    ...(transactionHash === undefined ? {} : { transactionHash }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
