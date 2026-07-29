import type { XrpPaymentProof } from '../fdc/types.js';
import type { Account, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem';

export type FlareExecutionPublicClient = Pick<
  PublicClient,
  | 'getBytecode'
  | 'getTransactionCount'
  | 'readContract'
  | 'simulateContract'
  | 'waitForTransactionReceipt'
>;

export type FlareExecutionWalletClient = Pick<WalletClient, 'writeContract'>;

interface BaseFinalizeRequest {
  readonly proof: XrpPaymentProof;
  readonly data: Hex;
  readonly transactionId: Hex;
  readonly personalAccount: Address;
  readonly executorNonce: bigint;
}

export interface SettlementFinalizeRequest extends BaseFinalizeRequest {
  readonly purpose: 'SETTLEMENT';
  readonly declaredTotalCallValue: bigint;
  readonly nonce: bigint;
  readonly paymentId: Hex;
}

export interface RecoveryMarkerFinalizeRequest extends BaseFinalizeRequest {
  readonly purpose: 'RECOVERY_MARKER';
  readonly originalTransactionId: Hex;
  readonly expectedNetMintUBA: bigint;
}

export interface RecoveryOriginalFinalizeRequest extends BaseFinalizeRequest {
  readonly purpose: 'RECOVERY_ORIGINAL';
  readonly declaredTotalCallValue: bigint;
  readonly nonce: bigint;
}

export type DirectMintFinalizeRequest =
  SettlementFinalizeRequest | RecoveryMarkerFinalizeRequest | RecoveryOriginalFinalizeRequest;

export interface FlareDirectMintFinalizerConfig {
  readonly publicClient: FlareExecutionPublicClient;
  readonly walletClient: FlareExecutionWalletClient;
  readonly executorAccount: Account;
  readonly assetManagerAddress: Address;
  readonly masterAccountControllerAddress: Address;
  readonly payMorphRouterAddress: Address;
}

export interface SmartAccountMintEvidence {
  readonly logIndex: number;
  readonly transactionId: Hex;
  readonly sourceAddress: string;
  readonly executor: Address;
  readonly mintedAmountUBA: bigint;
  readonly mintingFeeUBA: bigint;
  readonly memoData: Hex;
}

export interface MasterAccountMintEvidence {
  readonly logIndex: number;
  readonly personalAccount: Address;
  readonly transactionId: Hex;
  readonly sourceAddress: string;
  readonly amountUBA: bigint;
  readonly executorFeeUBA: bigint;
  readonly executor: Address;
}

export interface UserOperationEvidence {
  readonly logIndex: number;
  readonly personalAccount: Address;
  readonly nonce: bigint;
}

export interface PaymentSettledEvidence {
  readonly logIndex: number;
  readonly paymentId: Hex;
  readonly payerPersonalAccount: Address;
  readonly asset: number;
  readonly invoiceAmount: bigint;
  readonly serviceFee: bigint;
  readonly inputFxrpUsed: bigint;
  readonly refundTo: Address;
  readonly refundFxrp: bigint;
}

export interface RecipientPaidEvidence {
  readonly logIndex: number;
  readonly paymentId: Hex;
  readonly recipient: Address;
  readonly token: Address;
  readonly amount: bigint;
  readonly bps: number;
}

export interface IgnoreMemoEvidence {
  readonly logIndex: number;
  readonly personalAccount: Address;
  readonly targetTransactionId: Hex;
}

export interface DirectMintReceiptEvidence {
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly smartAccountMint: SmartAccountMintEvidence;
  readonly masterAccountMint: MasterAccountMintEvidence;
  readonly userOperation?: UserOperationEvidence;
  readonly paymentSettled?: PaymentSettledEvidence;
  readonly recipientsPaid: readonly RecipientPaidEvidence[];
  readonly ignoreMemo?: IgnoreMemoEvidence;
}

export type DirectMintFinalization =
  | {
      readonly status: 'PENDING';
      readonly reason: 'DIRECT_MINT_DELAYED' | 'LARGE_DIRECT_MINT_DELAYED';
      readonly transactionHash: Hex;
      readonly executionAllowedAt: bigint;
      readonly amountUBA: bigint;
      readonly detail: string;
    }
  | {
      readonly status: 'READY';
      readonly transactionHash: Hex;
      readonly receipt: TransactionReceipt;
      readonly evidence: DirectMintReceiptEvidence;
    }
  | {
      readonly status: 'FAILED';
      readonly code:
        | 'INVALID_INPUT'
        | 'PROOF_OWNER_MISMATCH'
        | 'TOTAL_CALL_VALUE_MISMATCH'
        | 'SIMULATION_FAILED'
        | 'SUBMISSION_FAILED'
        | 'TRANSACTION_REVERTED'
        | 'EVIDENCE_MISMATCH';
      readonly retryable: boolean;
      readonly detail: string;
      readonly transactionHash?: Hex;
    };

export interface RecoveryDiagnosis {
  readonly status: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  readonly reason: 'TRANSACTION_UNUSED' | 'TRANSACTION_ALREADY_USED';
  readonly targetTransactionId: Hex;
  readonly personalAccount: Address;
  readonly currentNonce: bigint;
  readonly pinnedExecutor: Address;
  readonly requiresPositiveRecoveryNetMint: true;
}
