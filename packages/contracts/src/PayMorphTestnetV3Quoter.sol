// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

interface IPayMorphTestnetV3Router {
    function quoteExactOutput(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut)
        external
        view
        returns (uint256 amountIn);
}

/// @title PayMorphTestnetV3Quoter
/// @notice QuoterV2-compatible read simulation for ADR 0007's fixed-ratio
/// Coston2 testnet route. No tokens move during this call.
contract PayMorphTestnetV3Quoter {
    struct QuoteExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amount;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    IPayMorphTestnetV3Router public immutable swapRouter;

    constructor(address swapRouter_) {
        swapRouter = IPayMorphTestnetV3Router(swapRouter_);
    }

    function quoteExactOutputSingle(QuoteExactOutputSingleParams calldata params)
        external
        view
        returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        amountIn = swapRouter.quoteExactOutput(params.tokenIn, params.tokenOut, params.fee, params.amount);
        // The route is fixed-ratio rather than a tick-based AMM, so there is no
        // meaningful Uniswap price/tick transition to report.
        sqrtPriceX96After = 0;
        initializedTicksCrossed = 0;
        gasEstimate = 0;
    }
}
