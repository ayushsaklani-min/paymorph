export const XAMAN_TESTNET = 'TESTNET' as const;

export type XamanPayloadKind = 'SIGN_IN' | 'PAYMENT';

export interface XamanCreatedPayload {
  uuid: string;
  nextUrl: string;
  qrPngUrl: string;
  websocketUrl: string;
  pushed: boolean;
}

export interface XamanAuthoritativePayload {
  uuid: string;
  applicationId: string;
  kind: XamanPayloadKind;
  customIdentifier: string;
  request: Readonly<Record<string, unknown>>;
  resolved: boolean;
  signed: boolean;
  cancelled: boolean;
  expired: boolean;
  forceNetwork: string | null;
  account: string | null;
  signedBlob: string | null;
  transactionHash: string | null;
  environmentNodeType: string | null;
  environmentNetworkId: number | null;
  dispatchedNodeType: string | null;
  dispatchedResult: string | null;
  issuedUserToken: string | null;
}

export interface XamanResolvedExpectation {
  uuid: string;
  applicationId: string;
  kind: XamanPayloadKind;
  customIdentifier: string;
  requireSigned?: boolean;
}

export interface XamanSignInPayloadInput {
  payerSessionId: string;
  returnUrl: string;
}

export interface XamanPaymentPayloadInput {
  attemptId: string;
  destination: string;
  amountDrops: string;
  memoHex: string;
  lastLedgerSequence: number;
  returnUrl: string;
  userToken?: string;
}

export interface XamanRecoveryPayloadInput {
  attemptId: string;
  destination: string;
  amountDrops: string;
  memoHex: string;
  lastLedgerSequence: number;
  returnUrl: string;
  userToken?: string;
}

export interface XamanPayloadRequest {
  txjson: Readonly<
    {
      TransactionType: 'SignIn' | 'Payment';
    } & Record<string, unknown>
  >;
  options: {
    submit: boolean;
    force_network: typeof XAMAN_TESTNET;
    expire: number;
    return_url: {
      app: string;
      web: string;
    };
  };
  custom_meta: {
    identifier: string;
    instruction: string;
  };
  user_token?: string;
}

export class XamanBoundaryError extends Error {
  readonly code:
    | 'INVALID_CONFIGURATION'
    | 'INVALID_PAYLOAD_INPUT'
    | 'INVALID_PROVIDER_RESPONSE'
    | 'PAYLOAD_MISMATCH'
    | 'WEBHOOK_REJECTED';

  constructor(code: XamanBoundaryError['code'], message: string) {
    super(message);
    this.name = 'XamanBoundaryError';
    this.code = code;
  }
}
