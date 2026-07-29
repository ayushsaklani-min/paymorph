import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  padHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { ceilBps } from '../amounts/index.js';

const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as const;
const UINT8_MAX = 255;
const UINT64_MAX = (1n << 64n) - 1n;
const TOTAL_BPS = 10_000;

const packedUserOperationTuple = {
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

const personalAccountAbi = [
  {
    type: 'function',
    name: 'executeUserOp',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const payMorphRouterAbi = [
  {
    type: 'function',
    name: 'settleFxrp',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'invoiceFxrpAmount', type: 'uint256' },
      {
        name: 'recipients',
        type: 'tuple[]',
        components: [
          { name: 'account', type: 'address' },
          { name: 'bps', type: 'uint16' },
        ],
      },
      { name: 'feeBpsSnapshot', type: 'uint16' },
      { name: 'deadline', type: 'uint256' },
      { name: 'refundTo', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleUsdt0ExactOut',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'maxFxrpInput', type: 'uint256' },
      { name: 'invoiceUsdt0Out', type: 'uint256' },
      {
        name: 'recipients',
        type: 'tuple[]',
        components: [
          { name: 'account', type: 'address' },
          { name: 'bps', type: 'uint16' },
        ],
      },
      { name: 'feeBpsSnapshot', type: 'uint16' },
      { name: 'poolFee', type: 'uint24' },
      { name: 'deadline', type: 'uint256' },
      { name: 'refundTo', type: 'address' },
    ],
    outputs: [],
  },
] as const;

export interface SmartAccountCall {
  target: Address;
  value: bigint;
  data: Hex;
}

export interface SettlementRecipient {
  account: Address;
  bps: number;
}

export interface EncodedSmartAccountOperation {
  calls: readonly SmartAccountCall[];
  packedUserOpData: Hex;
  userOpHash: Hex;
  memoHex: Hex;
  totalCallValue: bigint;
}

export function buildFxrpSettlementCalls(input: {
  fxrpAddress: Address;
  routerAddress: Address;
  paymentId: Hex;
  invoiceFxrpAmount: bigint;
  recipients: readonly SettlementRecipient[];
  feeBps: number;
  deadline: bigint;
  personalAccount: Address;
}): readonly SmartAccountCall[] {
  validateSettlementInput(input);
  const serviceFee = ceilBps(input.invoiceFxrpAmount, input.feeBps);
  const grossFxrpAmount = input.invoiceFxrpAmount + serviceFee;
  const recipients = input.recipients.map((recipient) => ({
    account: getAddress(recipient.account),
    bps: recipient.bps,
  }));
  return [
    {
      target: getAddress(input.fxrpAddress),
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [getAddress(input.routerAddress), grossFxrpAmount],
      }),
    },
    {
      target: getAddress(input.routerAddress),
      value: 0n,
      data: encodeFunctionData({
        abi: payMorphRouterAbi,
        functionName: 'settleFxrp',
        args: [
          padHex(input.paymentId, { size: 32 }),
          input.invoiceFxrpAmount,
          recipients,
          input.feeBps,
          input.deadline,
          getAddress(input.personalAccount),
        ],
      }),
    },
  ];
}

export function buildUsdt0SettlementCalls(input: {
  fxrpAddress: Address;
  routerAddress: Address;
  paymentId: Hex;
  maxFxrpInput: bigint;
  invoiceUsdt0Out: bigint;
  recipients: readonly SettlementRecipient[];
  feeBps: number;
  poolFee: number;
  deadline: bigint;
  personalAccount: Address;
}): readonly SmartAccountCall[] {
  validateSettlementInput({
    ...input,
    invoiceFxrpAmount: input.invoiceUsdt0Out,
  });
  if (input.maxFxrpInput <= 0n) throw new RangeError('Maximum FXRP input must be positive');
  if (!Number.isSafeInteger(input.poolFee) || input.poolFee < 0 || input.poolFee > 0xff_ffff) {
    throw new RangeError('Pool fee must fit uint24');
  }
  const recipients = input.recipients.map((recipient) => ({
    account: getAddress(recipient.account),
    bps: recipient.bps,
  }));
  return [
    {
      target: getAddress(input.fxrpAddress),
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [getAddress(input.routerAddress), input.maxFxrpInput],
      }),
    },
    {
      target: getAddress(input.routerAddress),
      value: 0n,
      data: encodeFunctionData({
        abi: payMorphRouterAbi,
        functionName: 'settleUsdt0ExactOut',
        args: [
          padHex(input.paymentId, { size: 32 }),
          input.maxFxrpInput,
          input.invoiceUsdt0Out,
          recipients,
          input.feeBps,
          input.poolFee,
          input.deadline,
          getAddress(input.personalAccount),
        ],
      }),
    },
  ];
}

export function encodeSmartAccountOperation(input: {
  calls: readonly SmartAccountCall[];
  sender: Address;
  nonce: bigint;
  walletId: number;
  executorFeeUBA: bigint;
}): EncodedSmartAccountOperation {
  if (input.calls.length === 0) throw new RangeError('User operation must contain calls');
  if (input.nonce < 0n) throw new RangeError('Nonce cannot be negative');
  if (!Number.isSafeInteger(input.walletId) || input.walletId < 0 || input.walletId > UINT8_MAX) {
    throw new RangeError('Wallet ID must fit uint8');
  }
  if (input.executorFeeUBA < 0n || input.executorFeeUBA > UINT64_MAX) {
    throw new RangeError('Executor fee must fit uint64');
  }
  const sender = getAddress(input.sender);
  const calls = input.calls.map((call) => ({
    target: getAddress(call.target),
    value: call.value,
    data: call.data,
  }));
  if (calls.some((call) => call.value < 0n)) {
    throw new RangeError('Call value cannot be negative');
  }
  const callData = encodeFunctionData({
    abi: personalAccountAbi,
    functionName: 'executeUserOp',
    args: [calls],
  });
  const packedUserOpData = encodeAbiParameters(
    [packedUserOperationTuple],
    [
      {
        sender,
        nonce: input.nonce,
        initCode: '0x',
        callData,
        accountGasLimits: ZERO_BYTES32,
        preVerificationGas: 0n,
        gasFees: ZERO_BYTES32,
        paymasterAndData: '0x',
        signature: '0x',
      },
    ],
  );
  const userOpHash = keccak256(packedUserOpData);
  const memoHex = concatHex([
    '0xFE',
    toHex(input.walletId, { size: 1 }),
    toHex(input.executorFeeUBA, { size: 8 }),
    userOpHash,
  ]);
  const totalCallValue = calls.reduce((sum, call) => sum + call.value, 0n);

  return {
    calls: Object.freeze(calls),
    packedUserOpData,
    userOpHash,
    memoHex,
    totalCallValue,
  };
}

export function encodeSkipMemo(input: {
  originalXrplTransactionId: Hex;
  walletId: number;
  executorFeeUBA: bigint;
}): Hex {
  if (!Number.isSafeInteger(input.walletId) || input.walletId < 0 || input.walletId > UINT8_MAX) {
    throw new RangeError('Wallet ID must fit uint8');
  }
  if (input.executorFeeUBA < 0n || input.executorFeeUBA > UINT64_MAX) {
    throw new RangeError('Executor fee must fit uint64');
  }
  return concatHex([
    '0xE0',
    toHex(input.walletId, { size: 1 }),
    toHex(input.executorFeeUBA, { size: 8 }),
    padHex(input.originalXrplTransactionId, { size: 32 }),
  ]);
}

function validateSettlementInput(input: {
  paymentId: Hex;
  invoiceFxrpAmount: bigint;
  recipients: readonly SettlementRecipient[];
  feeBps: number;
  deadline: bigint;
  personalAccount: Address;
}): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.paymentId) || /^0x0{64}$/.test(input.paymentId)) {
    throw new TypeError('Payment ID must be a nonzero bytes32 value');
  }
  if (input.invoiceFxrpAmount <= 0n) throw new RangeError('Invoice amount must be positive');
  if (!Number.isSafeInteger(input.feeBps) || input.feeBps < 0 || input.feeBps > 300) {
    throw new RangeError('Service fee must be an integer from 0 to 300 bps');
  }
  if (input.deadline <= 0n) throw new RangeError('Deadline must be positive');
  if (!isAddress(input.personalAccount)) throw new TypeError('Invalid personal account');
  if (input.recipients.length < 1 || input.recipients.length > 10) {
    throw new RangeError('Settlement requires one to ten recipients');
  }
  const addresses = input.recipients.map((recipient) => {
    if (!isAddress(recipient.account)) throw new TypeError('Invalid recipient address');
    if (!Number.isSafeInteger(recipient.bps) || recipient.bps <= 0) {
      throw new RangeError('Recipient basis points must be a positive integer');
    }
    return recipient.account.toLowerCase();
  });
  if (new Set(addresses).size !== addresses.length) {
    throw new RangeError('Recipient addresses must be unique');
  }
  if (input.recipients.reduce((sum, recipient) => sum + recipient.bps, 0) !== TOTAL_BPS) {
    throw new RangeError('Recipient basis points must total exactly 10,000');
  }
}
