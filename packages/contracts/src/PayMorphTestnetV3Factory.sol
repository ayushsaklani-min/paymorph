// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title PayMorphTestnetV3Factory
/// @notice Single-pair registry for the separately labelled Coston2 testnet
/// exact-output route described in ADR 0007.
contract PayMorphTestnetV3Factory {
    error Unauthorized(address caller);
    error InvalidPool(address pool);
    error PoolAlreadySet(address pool);

    address public immutable owner;
    address public immutable tokenA;
    address public immutable tokenB;
    uint24 public immutable fee;
    address public pool;

    constructor(address owner_, address tokenA_, address tokenB_, uint24 fee_) {
        owner = owner_;
        tokenA = tokenA_;
        tokenB = tokenB_;
        fee = fee_;
    }

    function setPool(address pool_) external {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        if (pool != address(0)) revert PoolAlreadySet(pool);
        if (pool_ == address(0) || pool_.code.length == 0) revert InvalidPool(pool_);
        pool = pool_;
    }

    function getPool(address tokenA_, address tokenB_, uint24 fee_) external view returns (address) {
        if (fee_ != fee) return address(0);
        if ((tokenA_ == tokenA && tokenB_ == tokenB) || (tokenA_ == tokenB && tokenB_ == tokenA)) {
            return pool;
        }
        return address(0);
    }
}
