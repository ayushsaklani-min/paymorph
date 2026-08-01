import { iFdcHubAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFdcHub';
import { iFdcRequestFeeConfigurationsAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFdcRequestFeeConfigurations';
import { iFdcVerificationAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFdcVerification';
import { iFlareSystemsManagerAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFlareSystemsManager';
import { iRelayAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IRelay';
import { ixrpPaymentVerificationAbi } from '@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IXRPPaymentVerification';
import {
  decodeAbiParameters,
  getAddress,
  isAddressEqual,
  isHex,
  padHex,
  toHex,
  type AbiParameter,
  type Address,
  type Hex,
} from 'viem';
import { FetchFdcHttpClient } from './http.js';
import { resolveRequiredFlareContract } from './registry.js';
import type {
  FdcFailureCode,
  FdcHttpClient,
  FdcProgress,
  FdcXrpPaymentClientConfig,
  PreparedXrpPaymentRequest,
  SubmittedXrpPaymentRequest,
  XrpPaymentProof,
  XrpPaymentResponse,
} from './types.js';

const DEFAULT_SOURCE_ID = 'testXRP';
const ATTESTATION_TYPE = 'XRPPayment';
const DEFAULT_RETRY_AFTER_MS = 10_000;
const TX_ID = /^(?:0x)?[0-9a-fA-F]{64}$/;
const DA_ATTESTATION_NOT_FOUND = 'attestation request not found';
export const XRPL_FDC_CONFIRMATIONS = 3;

const xrpPaymentResponseAbiParameter = (
  ixrpPaymentVerificationAbi.find(
    (item) => item.type === 'function' && item.name === 'verifyXRPPayment',
  ) as { inputs: readonly { components?: readonly AbiParameter[] }[] } | undefined
)?.inputs[0]?.components?.[1];

export class FdcXrpPaymentClient {
  readonly #config: Required<Pick<FdcXrpPaymentClientConfig, 'sourceId' | 'retryAfterMs'>> &
    Omit<FdcXrpPaymentClientConfig, 'sourceId' | 'retryAfterMs' | 'httpClient'> & {
      readonly httpClient: FdcHttpClient;
    };

  constructor(config: FdcXrpPaymentClientConfig) {
    if (config.verifierBaseUrl.length === 0 || config.daLayerBaseUrl.length === 0) {
      throw new TypeError('FDC verifier and DA-layer base URLs are required');
    }
    const retryAfterMs = config.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 1) {
      throw new RangeError('FDC retry interval must be a positive integer');
    }
    this.#config = {
      ...config,
      registryAddress: getAddress(config.registryAddress),
      sourceId: config.sourceId ?? DEFAULT_SOURCE_ID,
      retryAfterMs,
      httpClient: config.httpClient ?? new FetchFdcHttpClient(),
    };
  }

  async prepareRequest(input: {
    transactionId: string;
    proofOwner?: Address;
  }): Promise<FdcProgress<PreparedXrpPaymentRequest>> {
    let transactionId: Hex;
    try {
      transactionId = normalizeTransactionId(input.transactionId);
    } catch (error) {
      return failed('INVALID_INPUT', false, errorMessage(error));
    }

    const executorAddress = getAddress(this.#config.executorAccount.address);
    if (
      input.proofOwner !== undefined &&
      !isAddressEqual(getAddress(input.proofOwner), executorAddress)
    ) {
      return failed(
        'PROOF_OWNER_MISMATCH',
        false,
        `XRPPayment proofOwner must equal executor ${executorAddress}`,
      );
    }

    const verifierUrl = `${trimTrailingSlash(
      this.#config.verifierBaseUrl,
    )}/verifier/xrp/XRPPayment/prepareRequest`;
    const headers =
      this.#config.verifierApiKey === undefined || this.#config.verifierApiKey.length === 0
        ? {}
        : { 'X-API-KEY': this.#config.verifierApiKey };

    let response;
    try {
      response = await this.#config.httpClient.postJson(
        verifierUrl,
        {
          attestationType: toHex(ATTESTATION_TYPE, { size: 32 }),
          sourceId: toHex(this.#config.sourceId, { size: 32 }),
          requestBody: {
            transactionId,
            proofOwner: executorAddress,
          },
        },
        headers,
      );
    } catch (error) {
      return pending(
        'VERIFIER_UNAVAILABLE',
        this.#config.retryAfterMs,
        `FDC verifier request failed: ${errorMessage(error)}`,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      return pending(
        'VERIFIER_UNAVAILABLE',
        this.#config.retryAfterMs,
        `FDC verifier returned HTTP ${response.status}`,
      );
    }
    if (response.status !== 200) {
      return failed(
        'VERIFIER_REJECTED',
        false,
        `FDC verifier returned HTTP ${response.status}: ${response.rawBody}`,
      );
    }
    if (!isRecord(response.body)) {
      return failed('INVALID_VERIFIER_RESPONSE', false, 'Verifier response must be JSON object');
    }
    const verifierStatus = response.body.status;
    if (
      typeof verifierStatus === 'string' &&
      verifierStatus !== 'VALID' &&
      !verifierStatus.startsWith('OK')
    ) {
      return failed(
        'VERIFIER_REJECTED',
        false,
        `FDC verifier rejected XRPPayment: ${verifierStatus}`,
      );
    }
    const abiEncodedRequest = response.body.abiEncodedRequest;
    if (
      typeof abiEncodedRequest !== 'string' ||
      !isHex(abiEncodedRequest) ||
      abiEncodedRequest === '0x'
    ) {
      return failed(
        'INVALID_VERIFIER_RESPONSE',
        false,
        'Verifier response is missing a nonempty abiEncodedRequest',
      );
    }

    return ready({
      transactionId,
      proofOwner: executorAddress,
      abiEncodedRequest,
    });
  }

  async submitRequest(
    prepared: PreparedXrpPaymentRequest,
  ): Promise<FdcProgress<SubmittedXrpPaymentRequest>> {
    const executorAddress = getAddress(this.#config.executorAccount.address);
    if (!isAddressEqual(prepared.proofOwner, executorAddress)) {
      return failed(
        'PROOF_OWNER_MISMATCH',
        false,
        `Prepared proofOwner ${prepared.proofOwner} does not match executor ${executorAddress}`,
      );
    }

    try {
      const [fdcHub, flareSystemsManager] = await Promise.all([
        resolveRequiredFlareContract(
          this.#config.publicClient,
          this.#config.registryAddress,
          'FdcHub',
        ),
        resolveRequiredFlareContract(
          this.#config.publicClient,
          this.#config.registryAddress,
          'FlareSystemsManager',
        ),
      ]);
      const feeConfiguration = await this.#config.publicClient.readContract({
        address: fdcHub,
        abi: iFdcHubAbi,
        functionName: 'fdcRequestFeeConfigurations',
      });
      const feeConfigurationCode = await this.#config.publicClient.getBytecode({
        address: feeConfiguration,
      });
      if (feeConfigurationCode === undefined || feeConfigurationCode === '0x') {
        throw new Error('FDC request-fee configuration has no deployed bytecode');
      }
      const requestFee = await this.#config.publicClient.readContract({
        address: feeConfiguration,
        abi: iFdcRequestFeeConfigurationsAbi,
        functionName: 'getRequestFee',
        args: [prepared.abiEncodedRequest],
      });

      const requestTransactionHash = await this.#config.walletClient.writeContract({
        account: this.#config.executorAccount,
        address: fdcHub,
        abi: iFdcHubAbi,
        functionName: 'requestAttestation',
        args: [prepared.abiEncodedRequest],
        value: requestFee,
        chain: undefined,
      });
      const receipt = await this.#config.publicClient.waitForTransactionReceipt({
        hash: requestTransactionHash,
      });
      if (receipt.status !== 'success') {
        return failed(
          'ONCHAIN_REQUEST_FAILED',
          false,
          `FdcHub request transaction ${requestTransactionHash} reverted`,
        );
      }
      const [block, firstVotingRoundStartTs, votingEpochDurationSeconds] = await Promise.all([
        this.#config.publicClient.getBlock({ blockNumber: receipt.blockNumber }),
        this.#config.publicClient.readContract({
          address: flareSystemsManager,
          abi: iFlareSystemsManagerAbi,
          functionName: 'firstVotingRoundStartTs',
        }),
        this.#config.publicClient.readContract({
          address: flareSystemsManager,
          abi: iFlareSystemsManagerAbi,
          functionName: 'votingEpochDurationSeconds',
        }),
      ]);
      if (votingEpochDurationSeconds === 0n || block.timestamp < firstVotingRoundStartTs) {
        return failed(
          'INVALID_ROUND_CONFIGURATION',
          false,
          'FDC voting-round timing is invalid for the request block',
        );
      }
      const votingRoundId =
        (block.timestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds;

      return ready({
        ...prepared,
        requestTransactionHash,
        requestBlockNumber: receipt.blockNumber,
        votingRoundId,
      });
    } catch (error) {
      return failed(
        'ONCHAIN_REQUEST_FAILED',
        true,
        `Unable to submit FDC attestation request: ${errorMessage(error)}`,
      );
    }
  }

  async pollProof(submission: SubmittedXrpPaymentRequest): Promise<FdcProgress<XrpPaymentProof>> {
    try {
      const [relay, fdcVerification] = await Promise.all([
        resolveRequiredFlareContract(
          this.#config.publicClient,
          this.#config.registryAddress,
          'Relay',
        ),
        resolveRequiredFlareContract(
          this.#config.publicClient,
          this.#config.registryAddress,
          'FdcVerification',
        ),
      ]);
      const protocolId = await this.#config.publicClient.readContract({
        address: fdcVerification,
        abi: iFdcVerificationAbi,
        functionName: 'fdcProtocolId',
      });
      const finalized = await this.#config.publicClient.readContract({
        address: relay,
        abi: iRelayAbi,
        functionName: 'isFinalized',
        args: [BigInt(protocolId), submission.votingRoundId],
      });
      if (!finalized) {
        return pending(
          'ROUND_NOT_FINALIZED',
          this.#config.retryAfterMs,
          `FDC voting round ${submission.votingRoundId} is not finalized`,
        );
      }
    } catch (error) {
      return pending(
        'DA_SERVICE_UNAVAILABLE',
        this.#config.retryAfterMs,
        `Unable to read FDC finality: ${errorMessage(error)}`,
      );
    }

    if (submission.votingRoundId > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failed(
        'INVALID_DA_RESPONSE',
        false,
        'Voting round exceeds the DA API safe integer range',
      );
    }

    let response;
    try {
      response = await this.#config.httpClient.postJson(
        `${trimTrailingSlash(this.#config.daLayerBaseUrl)}/api/v1/fdc/proof-by-request-round-raw`,
        {
          votingRoundId: Number(submission.votingRoundId),
          requestBytes: submission.abiEncodedRequest,
        },
      );
    } catch (error) {
      return pending(
        'DA_SERVICE_UNAVAILABLE',
        this.#config.retryAfterMs,
        `FDC DA request failed: ${errorMessage(error)}`,
      );
    }

    if (
      response.status === 404 ||
      response.status === 202 ||
      isAttestationPropagationResponse(response.status, response.body)
    ) {
      return pending(
        'DA_PROOF_NOT_AVAILABLE',
        this.#config.retryAfterMs,
        `FDC DA proof for round ${submission.votingRoundId} is not available`,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      return pending(
        'DA_SERVICE_UNAVAILABLE',
        this.#config.retryAfterMs,
        `FDC DA layer returned HTTP ${response.status}`,
      );
    }
    if (response.status !== 200 || !isRecord(response.body)) {
      return failed(
        'INVALID_DA_RESPONSE',
        false,
        `FDC DA layer returned HTTP ${response.status}: ${response.rawBody}`,
      );
    }

    const responseHex = response.body.response_hex;
    const rawProof = response.body.proof;
    if (
      typeof responseHex !== 'string' ||
      !isHex(responseHex) ||
      !Array.isArray(rawProof) ||
      !rawProof.every(isBytes32)
    ) {
      return failed(
        'INVALID_DA_RESPONSE',
        false,
        'FDC DA response must contain response_hex and a bytes32 proof array',
      );
    }

    let data: XrpPaymentResponse;
    try {
      if (xrpPaymentResponseAbiParameter === undefined) {
        throw new Error('IXRPPayment.Response ABI was not found');
      }
      const [decoded] = decodeAbiParameters([xrpPaymentResponseAbiParameter], responseHex);
      data = decoded as XrpPaymentResponse;
    } catch (error) {
      return failed(
        'INVALID_DA_RESPONSE',
        false,
        `Unable to decode IXRPPayment response: ${errorMessage(error)}`,
      );
    }

    if (
      !isAddressEqual(data.requestBody.proofOwner, submission.proofOwner) ||
      data.requestBody.transactionId.toLowerCase() !== submission.transactionId.toLowerCase() ||
      data.votingRound !== submission.votingRoundId
    ) {
      return failed(
        'PROOF_MISMATCH',
        false,
        'Decoded FDC proof does not match transactionId, proofOwner, or voting round',
      );
    }

    return ready({
      merkleProof: rawProof,
      data,
    });
  }
}

export function normalizeTransactionId(value: string): Hex {
  if (!TX_ID.test(value)) {
    throw new TypeError('XRPL transaction ID must be exactly 32 bytes');
  }
  return padHex((value.startsWith('0x') ? value : `0x${value}`) as Hex, { size: 32 });
}

export function checkXrplFdcConfirmations(input: {
  readonly transactionLedgerIndex: number;
  readonly validatedLedgerIndex: number;
  readonly requiredConfirmations?: number;
  readonly retryAfterMs?: number;
}): FdcProgress<{
  readonly confirmations: number;
  readonly transactionLedgerIndex: number;
  readonly validatedLedgerIndex: number;
}> {
  const requiredConfirmations = input.requiredConfirmations ?? XRPL_FDC_CONFIRMATIONS;
  const retryAfterMs = input.retryAfterMs ?? 4_000;
  for (const [name, value] of [
    ['transactionLedgerIndex', input.transactionLedgerIndex],
    ['validatedLedgerIndex', input.validatedLedgerIndex],
    ['requiredConfirmations', requiredConfirmations],
    ['retryAfterMs', retryAfterMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      return failed('INVALID_INPUT', false, `${name} must be a positive integer`);
    }
  }
  const confirmations = Math.max(0, input.validatedLedgerIndex - input.transactionLedgerIndex + 1);
  if (confirmations < requiredConfirmations) {
    return pending(
      'XRPL_CONFIRMATIONS_PENDING',
      retryAfterMs,
      `XRPL transaction has ${confirmations}/${requiredConfirmations} confirmations`,
    );
  }
  return ready({
    confirmations,
    transactionLedgerIndex: input.transactionLedgerIndex,
    validatedLedgerIndex: input.validatedLedgerIndex,
  });
}

function ready<T>(value: T): FdcProgress<T> {
  return { status: 'READY', value };
}

function pending(
  reason: Extract<FdcProgress<never>, { status: 'PENDING' }>['reason'],
  retryAfterMs: number,
  detail: string,
): FdcProgress<never> {
  return { status: 'PENDING', reason, retryAfterMs, detail };
}

function failed(code: FdcFailureCode, retryable: boolean, detail: string): FdcProgress<never> {
  return { status: 'FAILED', code, retryable, detail };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttestationPropagationResponse(status: number, body: unknown): boolean {
  return (
    status === 400 &&
    isRecord(body) &&
    typeof body.error === 'string' &&
    body.error.trim().toLowerCase() === DA_ATTESTATION_NOT_FOUND
  );
}

function isBytes32(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
