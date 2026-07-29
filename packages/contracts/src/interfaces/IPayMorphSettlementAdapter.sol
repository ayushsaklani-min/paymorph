// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title IPayMorphSettlementAdapter
/// @notice Restricted adapter boundary for exact-output settlement routes.
interface IPayMorphSettlementAdapter {
    /// @notice Swaps at most `amountInMaximum` of `tokenIn` for exactly `amountOut` of `tokenOut`.
    /// @dev The caller transfers `amountInMaximum` to the adapter before this call. A conforming adapter
    ///      delivers `amountOut` directly to the caller and returns all unused input to the caller.
    /// @param tokenIn Input token supplied by the settlement router.
    /// @param tokenOut Exact-output token delivered to the settlement router.
    /// @param amountOut Exact token-out amount required.
    /// @param amountInMaximum Maximum token-in amount the route may consume.
    /// @param poolFee Allowlisted Uniswap V3-compatible pool fee.
    /// @param deadline Latest valid execution timestamp.
    /// @return amountIn Actual token-in amount consumed.
    function swapExactOutput(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint24 poolFee,
        uint256 deadline
    ) external returns (uint256 amountIn);
}
