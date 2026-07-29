import type { ixrpPaymentVerificationAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IXRPPaymentVerification';
import type { Account, Address, ContractFunctionArgs, Hex, PublicClient, WalletClient } from 'viem';

export type XrpPaymentProof = ContractFunctionArgs<
  typeof ixrpPaymentVerificationAbi,
  'view',
  'verifyXRPPayment'
>[0];

export type XrpPaymentResponse = XrpPaymentProof['data'];

export type FdcPublicClient = Pick<
  PublicClient,
  'getBlock' | 'getBytecode' | 'readContract' | 'waitForTransactionReceipt'
>;

export type FdcWalletClient = Pick<WalletClient, 'writeContract'>;

export interface FdcHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly rawBody: string;
}

export interface FdcHttpClient {
  postJson(
    url: string,
    body: unknown,
    headers?: Readonly<Record<string, string>>,
  ): Promise<FdcHttpResponse>;
}

export interface PreparedXrpPaymentRequest {
  readonly transactionId: Hex;
  readonly proofOwner: Address;
  readonly abiEncodedRequest: Hex;
}

export interface SubmittedXrpPaymentRequest extends PreparedXrpPaymentRequest {
  readonly requestTransactionHash: Hex;
  readonly requestBlockNumber: bigint;
  readonly votingRoundId: bigint;
}

export type FdcPendingReason =
  | 'XRPL_CONFIRMATIONS_PENDING'
  | 'VERIFIER_UNAVAILABLE'
  | 'ROUND_NOT_FINALIZED'
  | 'DA_PROOF_NOT_AVAILABLE'
  | 'DA_SERVICE_UNAVAILABLE';

export type FdcFailureCode =
  | 'INVALID_INPUT'
  | 'PROOF_OWNER_MISMATCH'
  | 'VERIFIER_REJECTED'
  | 'INVALID_VERIFIER_RESPONSE'
  | 'ONCHAIN_REQUEST_FAILED'
  | 'INVALID_ROUND_CONFIGURATION'
  | 'INVALID_DA_RESPONSE'
  | 'PROOF_MISMATCH';

export type FdcProgress<T> =
  | {
      readonly status: 'PENDING';
      readonly reason: FdcPendingReason;
      readonly retryAfterMs: number;
      readonly detail: string;
    }
  | {
      readonly status: 'READY';
      readonly value: T;
    }
  | {
      readonly status: 'FAILED';
      readonly code: FdcFailureCode;
      readonly retryable: boolean;
      readonly detail: string;
    };

export interface FdcXrpPaymentClientConfig {
  readonly publicClient: FdcPublicClient;
  readonly walletClient: FdcWalletClient;
  readonly executorAccount: Account;
  readonly registryAddress: Address;
  readonly verifierBaseUrl: string;
  readonly daLayerBaseUrl: string;
  readonly verifierApiKey?: string;
  readonly sourceId?: string;
  readonly retryAfterMs?: number;
  readonly httpClient?: FdcHttpClient;
}
