import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from 'viem';

export interface PaymentIdInput {
  chainDomain: string;
  invoiceId: string;
  quoteId: string;
  payerXrplAccount: string;
}

export function createPaymentId(input: PaymentIdInput): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, string, string, string'), [
      keccak256(stringToHex(input.chainDomain)),
      input.invoiceId,
      input.quoteId,
      input.payerXrplAccount,
    ]),
  );
}
