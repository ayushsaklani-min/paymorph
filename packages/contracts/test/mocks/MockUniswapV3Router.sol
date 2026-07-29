// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IUniswapV3SwapRouter} from "../../src/interfaces/IUniswapV3SwapRouter.sol";

contract MockUniswapV3Router is IUniswapV3SwapRouter {
    using SafeERC20 for IERC20;

    error SwapReverted();
    error ExcessiveInput(uint256 amountIn, uint256 maximum);

    uint256 public amountIn;
    uint256 public consumedAmountIn;
    bool public useConsumedAmountIn;
    bool public skipMaximumCheck;
    bool public shouldRevert;

    function setAmountIn(uint256 amountIn_) external {
        amountIn = amountIn_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function setConsumedAmountIn(uint256 consumedAmountIn_) external {
        consumedAmountIn = consumedAmountIn_;
        useConsumedAmountIn = true;
    }

    function setSkipMaximumCheck(bool skipMaximumCheck_) external {
        skipMaximumCheck = skipMaximumCheck_;
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        returns (uint256 actualAmountIn)
    {
        if (shouldRevert) revert SwapReverted();
        actualAmountIn = amountIn;
        if (!skipMaximumCheck && actualAmountIn > params.amountInMaximum) {
            revert ExcessiveInput(actualAmountIn, params.amountInMaximum);
        }

        uint256 consumed = useConsumedAmountIn ? consumedAmountIn : actualAmountIn;
        if (consumed != 0) {
            IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), consumed);
        }
        IERC20(params.tokenOut).safeTransfer(params.recipient, params.amountOut);
    }
}
