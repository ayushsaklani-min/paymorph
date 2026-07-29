import { parseAbi } from 'viem';

// Exact event declarations from packages/contracts/src/PayMorphRouter.sol.
export const payMorphRouterEventsAbi = parseAbi([
  'event PaymentSettled(bytes32 indexed paymentId, address indexed payerPersonalAccount, uint8 asset, uint256 invoiceAmount, uint256 serviceFee, uint256 inputFxrpUsed, address refundTo, uint256 refundFxrp)',
  'event RecipientPaid(bytes32 indexed paymentId, address indexed recipient, address indexed token, uint256 amount, uint16 bps)',
]);

export const packedUserOperationParameter = {
  type: 'tuple',
  components: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
  ],
} as const;
