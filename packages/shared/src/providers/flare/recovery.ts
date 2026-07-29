import { iMasterAccountControllerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IMasterAccountController';
import { getAddress, padHex, type Address, type Hex } from 'viem';
import type { FlareReadClient } from './types.js';

export interface DirectMintRecoveryDiagnosis {
  readonly status: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  readonly reason: 'TRANSACTION_UNUSED' | 'TRANSACTION_ALREADY_USED';
  readonly targetTransactionId: Hex;
  readonly personalAccount: Address;
  readonly currentNonce: bigint;
  readonly pinnedExecutor: Address;
  readonly requiresPositiveRecoveryNetMint: true;
}

export async function diagnoseDirectMintRecovery(input: {
  readonly publicClient: Pick<FlareReadClient, 'readContract'>;
  readonly masterAccountControllerAddress: Address;
  readonly personalAccount: Address;
  readonly originalTransactionId: string;
}): Promise<DirectMintRecoveryDiagnosis> {
  const masterAccountControllerAddress = getAddress(input.masterAccountControllerAddress);
  const personalAccount = getAddress(input.personalAccount);
  const targetTransactionId = normalizeTransactionId(input.originalTransactionId);
  const [transactionIdUsed, currentNonce, pinnedExecutor] = await Promise.all([
    input.publicClient.readContract({
      address: masterAccountControllerAddress,
      abi: iMasterAccountControllerAbi,
      functionName: 'isTransactionIdUsed',
      args: [targetTransactionId],
    }),
    input.publicClient.readContract({
      address: masterAccountControllerAddress,
      abi: iMasterAccountControllerAbi,
      functionName: 'getNonce',
      args: [personalAccount],
    }),
    input.publicClient.readContract({
      address: masterAccountControllerAddress,
      abi: iMasterAccountControllerAbi,
      functionName: 'getExecutor',
      args: [personalAccount],
    }),
  ]);

  return {
    status: transactionIdUsed ? 'NOT_ELIGIBLE' : 'ELIGIBLE',
    reason: transactionIdUsed ? 'TRANSACTION_ALREADY_USED' : 'TRANSACTION_UNUSED',
    targetTransactionId,
    personalAccount,
    currentNonce,
    pinnedExecutor,
    requiresPositiveRecoveryNetMint: true,
  };
}

export function assertPositiveRecoveryNetMint(netMintUBA: bigint): void {
  if (netMintUBA <= 0n) {
    throw new RangeError('A 0xE0 recovery payment must mint a positive net FXRP amount after fees');
  }
}

export function recoveryExecutionData(input: {
  readonly stage: 'RECOVERY_MARKER' | 'RECOVERY_ORIGINAL';
  readonly originalPackedUserOperationData?: Hex;
}): Hex {
  if (input.stage === 'RECOVERY_MARKER') return '0x';
  if (!input.originalPackedUserOperationData || input.originalPackedUserOperationData === '0x') {
    throw new TypeError('Original recovery execution requires committed user-operation bytes');
  }
  return input.originalPackedUserOperationData;
}

function normalizeTransactionId(value: string): Hex {
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) {
    throw new TypeError('XRPL transaction ID must be exactly 32 bytes');
  }
  return padHex((value.startsWith('0x') ? value : `0x${value}`) as Hex, { size: 32 });
}
