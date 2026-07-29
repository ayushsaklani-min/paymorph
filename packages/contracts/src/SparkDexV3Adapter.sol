// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPayMorphSettlementAdapter} from "./interfaces/IPayMorphSettlementAdapter.sol";
import {IUniswapV3SwapRouter} from "./interfaces/IUniswapV3SwapRouter.sol";

/// @title SparkDexV3Adapter
/// @notice Single-route adapter for an allowlisted Uniswap V3-compatible FXRP/USDT0 pool.
/// @dev The adapter is intentionally immutable and only callable by its PayMorphRouter.
contract SparkDexV3Adapter is IPayMorphSettlementAdapter {
    using SafeERC20 for IERC20;

    /// @notice Caller is not the immutable PayMorphRouter.
    error UnauthorizedCaller(address caller);
    /// @notice A required constructor address is zero or has no deployed code.
    error InvalidContract(address account);
    /// @notice The requested token pair is not the immutable FXRP-to-USDT0 route.
    error UnsupportedTokenPair(address tokenIn, address tokenOut);
    /// @notice The requested pool fee is not allowlisted.
    error UnsupportedPoolFee(uint24 poolFee);
    /// @notice An amount is zero.
    error ZeroAmount();
    /// @notice The swap has expired.
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    /// @notice The input token balance is below the amount transferred for this swap.
    error UnexpectedInputBalance(uint256 expected, uint256 actual);
    /// @notice The external router reported or consumed an invalid input amount.
    error InvalidAmountIn(uint256 reported, uint256 maximum);
    /// @notice The adapter retained input-token dust after refunding the caller.
    error ResidualInputBalance(uint256 balance);

    /// @notice PayMorph settlement router allowed to invoke the adapter.
    address public immutable payMorphRouter;
    /// @notice Uniswap V3-compatible swap router.
    IUniswapV3SwapRouter public immutable swapRouter;
    /// @notice Allowlisted input token (FXRP).
    IERC20 public immutable tokenIn;
    /// @notice Allowlisted output token (USDT0).
    IERC20 public immutable tokenOut;
    /// @notice Allowlisted pool fee.
    uint24 public immutable supportedPoolFee;

    /// @param payMorphRouter_ PayMorphRouter deployed before this adapter.
    /// @param swapRouter_ Verified Uniswap V3-compatible router.
    /// @param tokenIn_ FXRP token.
    /// @param tokenOut_ USDT0 token.
    /// @param supportedPoolFee_ Allowlisted pool fee, normally 500 on Coston2.
    constructor(
        address payMorphRouter_,
        address swapRouter_,
        address tokenIn_,
        address tokenOut_,
        uint24 supportedPoolFee_
    ) {
        _requireContract(payMorphRouter_);
        _requireContract(swapRouter_);
        _requireContract(tokenIn_);
        _requireContract(tokenOut_);
        if (supportedPoolFee_ == 0) revert UnsupportedPoolFee(0);

        payMorphRouter = payMorphRouter_;
        swapRouter = IUniswapV3SwapRouter(swapRouter_);
        tokenIn = IERC20(tokenIn_);
        tokenOut = IERC20(tokenOut_);
        supportedPoolFee = supportedPoolFee_;
    }

    /// @inheritdoc IPayMorphSettlementAdapter
    function swapExactOutput(
        address tokenIn_,
        address tokenOut_,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint24 poolFee,
        uint256 deadline
    ) external returns (uint256 amountIn) {
        if (msg.sender != payMorphRouter) revert UnauthorizedCaller(msg.sender);
        if (tokenIn_ != address(tokenIn) || tokenOut_ != address(tokenOut)) {
            revert UnsupportedTokenPair(tokenIn_, tokenOut_);
        }
        if (poolFee != supportedPoolFee) revert UnsupportedPoolFee(poolFee);
        if (amountOut == 0 || amountInMaximum == 0) revert ZeroAmount();
        // A timestamp deadline is the canonical Uniswap V3 expiry guard and only makes stale swaps revert.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);

        uint256 inputBalance = tokenIn.balanceOf(address(this));
        if (inputBalance < amountInMaximum) {
            revert UnexpectedInputBalance(amountInMaximum, inputBalance);
        }
        uint256 preexistingInputBalance = inputBalance - amountInMaximum;

        tokenIn.forceApprove(address(swapRouter), amountInMaximum);
        amountIn = swapRouter.exactOutputSingle(
            IUniswapV3SwapRouter.ExactOutputSingleParams({
                tokenIn: tokenIn_,
                tokenOut: tokenOut_,
                fee: poolFee,
                recipient: msg.sender,
                deadline: deadline,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            })
        );
        tokenIn.forceApprove(address(swapRouter), 0);

        if (amountIn > amountInMaximum) revert InvalidAmountIn(amountIn, amountInMaximum);
        uint256 expectedRefund = amountInMaximum - amountIn;
        uint256 actualRefund = tokenIn.balanceOf(address(this));
        uint256 expectedBalanceBeforeRefund = preexistingInputBalance + expectedRefund;
        if (actualRefund != expectedBalanceBeforeRefund) {
            uint256 actualAmountIn = actualRefund > inputBalance ? 0 : inputBalance - actualRefund;
            revert InvalidAmountIn(actualAmountIn, amountInMaximum);
        }

        if (expectedRefund != 0) tokenIn.safeTransfer(msg.sender, expectedRefund);
        uint256 residualBalance = tokenIn.balanceOf(address(this));
        if (residualBalance != preexistingInputBalance) {
            revert ResidualInputBalance(residualBalance);
        }
    }

    function _requireContract(address account) private view {
        if (account == address(0) || account.code.length == 0) revert InvalidContract(account);
    }
}
