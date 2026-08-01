// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title PayMorphTestnetV3Pool
/// @notice Read-only liquidity projection for a testnet route. The actual
/// USDT0 is held by the paired router, where swaps transfer it atomically.
contract PayMorphTestnetV3Pool {
    IERC20 public immutable tokenOut;
    address public immutable swapRouter;

    constructor(address tokenOut_, address swapRouter_) {
        tokenOut = IERC20(tokenOut_);
        swapRouter = swapRouter_;
    }

    function liquidity() external view returns (uint128) {
        uint256 balance = tokenOut.balanceOf(swapRouter);
        // Safe because values above uint128.max return the capped branch.
        // forge-lint: disable-next-line(unsafe-typecast)
        return balance > type(uint128).max ? type(uint128).max : uint128(balance);
    }
}
