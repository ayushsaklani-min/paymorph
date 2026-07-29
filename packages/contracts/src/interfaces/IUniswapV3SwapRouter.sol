// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title IUniswapV3SwapRouter
/// @notice Minimal interface for a Uniswap V3-compatible exact-output-single router.
interface IUniswapV3SwapRouter {
    /// @notice Parameters for an exact-output single-pool swap.
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps at most `amountInMaximum` input tokens for exactly `amountOut` output tokens.
    /// @param params Exact-output route parameters.
    /// @return amountIn Actual input amount consumed.
    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn);
}
