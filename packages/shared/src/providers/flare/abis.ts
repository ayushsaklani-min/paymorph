import { parseAbi } from 'viem';

export const uniswapV3RouterIdentityAbi = parseAbi([
  'function factory() external view returns (address)',
]);

export const uniswapV3FactoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
]);

export const uniswapV3PoolAbi = parseAbi(['function liquidity() external view returns (uint128)']);
