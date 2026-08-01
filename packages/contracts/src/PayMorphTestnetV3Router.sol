// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IUniswapV3SwapRouter} from "./interfaces/IUniswapV3SwapRouter.sol";

/// @title PayMorphTestnetV3Router
/// @notice A real-token, fixed-ratio exact-output route for Coston2 testnet
/// settlement. It is deliberately not represented as SparkDEX or an AMM.
contract PayMorphTestnetV3Router is IUniswapV3SwapRouter {
    using SafeERC20 for IERC20;

    error InvalidAddress(address account);
    error InvalidRatio(uint256 numerator, uint256 denominator);
    error UnsupportedTokenPair(address tokenIn, address tokenOut);
    error UnsupportedPoolFee(uint24 supplied, uint24 expected);
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    error ExcessiveInput(uint256 amountIn, uint256 maximum);
    error InsufficientOutputLiquidity(uint256 available, uint256 requested);
    error ZeroAmount();

    address public immutable factory;
    IERC20 public immutable tokenIn;
    IERC20 public immutable tokenOut;
    uint24 public immutable routeFee;
    uint256 public immutable inputPerOutputNumerator;
    uint256 public immutable inputPerOutputDenominator;

    constructor(
        address factory_,
        address tokenIn_,
        address tokenOut_,
        uint24 routeFee_,
        uint256 inputPerOutputNumerator_,
        uint256 inputPerOutputDenominator_
    ) {
        if (factory_ == address(0) || tokenIn_ == address(0) || tokenOut_ == address(0)) {
            revert InvalidAddress(address(0));
        }
        if (routeFee_ == 0) revert UnsupportedPoolFee(0, routeFee_);
        if (inputPerOutputNumerator_ == 0 || inputPerOutputDenominator_ == 0) {
            revert InvalidRatio(inputPerOutputNumerator_, inputPerOutputDenominator_);
        }
        factory = factory_;
        tokenIn = IERC20(tokenIn_);
        tokenOut = IERC20(tokenOut_);
        routeFee = routeFee_;
        inputPerOutputNumerator = inputPerOutputNumerator_;
        inputPerOutputDenominator = inputPerOutputDenominator_;
    }

    function quoteExactOutput(address tokenIn_, address tokenOut_, uint24 fee_, uint256 amountOut)
        public
        view
        returns (uint256 amountIn)
    {
        if (tokenIn_ != address(tokenIn) || tokenOut_ != address(tokenOut)) {
            revert UnsupportedTokenPair(tokenIn_, tokenOut_);
        }
        if (fee_ != routeFee) revert UnsupportedPoolFee(fee_, routeFee);
        if (amountOut == 0) revert ZeroAmount();
        uint256 available = tokenOut.balanceOf(address(this));
        if (available < amountOut) revert InsufficientOutputLiquidity(available, amountOut);
        amountIn = _ceilDiv(amountOut * inputPerOutputNumerator, inputPerOutputDenominator);
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn) {
        // A timestamp expiry protects only against stale user operations.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > params.deadline) revert DeadlineExpired(params.deadline, block.timestamp);
        amountIn = quoteExactOutput(params.tokenIn, params.tokenOut, params.fee, params.amountOut);
        if (amountIn > params.amountInMaximum) revert ExcessiveInput(amountIn, params.amountInMaximum);

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOut.safeTransfer(params.recipient, params.amountOut);
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) private pure returns (uint256) {
        return (numerator - 1) / denominator + 1;
    }
}
