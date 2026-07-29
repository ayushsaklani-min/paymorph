// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPayMorphSettlementAdapter} from "../../src/interfaces/IPayMorphSettlementAdapter.sol";

contract MockSettlementAdapter is IPayMorphSettlementAdapter {
    using SafeERC20 for IERC20;

    IERC20 private immutable _tokenIn;
    IERC20 private immutable _tokenOut;

    uint256 public reportedAmountIn;
    uint256 public refundedAmountIn;
    uint256 public deliveredAmountOut;

    constructor(IERC20 tokenIn_, IERC20 tokenOut_) {
        _tokenIn = tokenIn_;
        _tokenOut = tokenOut_;
    }

    function configure(uint256 reportedAmountIn_, uint256 refundedAmountIn_, uint256 deliveredAmountOut_) external {
        reportedAmountIn = reportedAmountIn_;
        refundedAmountIn = refundedAmountIn_;
        deliveredAmountOut = deliveredAmountOut_;
    }

    function swapExactOutput(address, address, uint256, uint256, uint24, uint256) external returns (uint256) {
        if (refundedAmountIn != 0) _tokenIn.safeTransfer(msg.sender, refundedAmountIn);
        if (deliveredAmountOut != 0) _tokenOut.safeTransfer(msg.sender, deliveredAmountOut);
        return reportedAmountIn;
    }
}
