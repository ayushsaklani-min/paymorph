import { parseAbi } from 'viem';

export const uniswapV3RouterIdentityAbi = parseAbi([
  'function factory() external view returns (address)',
]);

export const uniswapV3FactoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
]);

export const uniswapV3PoolAbi = parseAbi(['function liquidity() external view returns (uint128)']);

// SparkDEX documents a QuoterV2 deployment. QuoterV2 quote functions are
// intentionally non-view so callers must use eth_call / simulation instead of
// a state-changing transaction. The `amount` field is amountOut for this
// exact-output method (matching Uniswap V3 QuoterV2).
export const uniswapV3QuoterV2Abi = parseAbi([
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) external returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
