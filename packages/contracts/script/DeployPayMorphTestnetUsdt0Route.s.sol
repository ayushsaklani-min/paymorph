// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PayMorphTestnetV3Factory} from "../src/PayMorphTestnetV3Factory.sol";
import {PayMorphTestnetV3Pool} from "../src/PayMorphTestnetV3Pool.sol";
import {PayMorphTestnetV3Quoter} from "../src/PayMorphTestnetV3Quoter.sol";
import {PayMorphTestnetV3Router} from "../src/PayMorphTestnetV3Router.sol";
import {SparkDexV3Adapter} from "../src/SparkDexV3Adapter.sol";

interface IPayMorphRouterAdmin {
    function FXRP() external view returns (address);
    function USDT0() external view returns (address);
    function adapter() external view returns (address);
    function ADAPTER_MANAGER_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function setAdapter(address newAdapter) external;
}

/// @title DeployPayMorphTestnetUsdt0Route
/// @notice Deploys the separately labelled real-token Coston2 testnet route
/// approved by ADR 0007, funds it with test USDT0, then wires the existing
/// PayMorphRouter only after liquidity transfer succeeds.
contract DeployPayMorphTestnetUsdt0Route is Script {
    using SafeERC20 for IERC20;

    struct DeploymentConfig {
        address payMorphRouter;
        address deployer;
        address fxrp;
        address usdt0;
        uint256 deployerPrivateKey;
        uint24 poolFee;
        uint256 initialLiquidity;
        uint256 inputPerOutputNumerator;
        uint256 inputPerOutputDenominator;
    }

    error WrongChain(uint256 expected, uint256 actual);
    error InvalidContract(string name, address account);
    error AdapterAlreadyConfigured(address adapter);
    error MissingAdapterManagerRole(address account);
    error InsufficientUsdt0Liquidity(uint256 available, uint256 required);
    error InvalidAmount(string name, uint256 value);

    function run()
        external
        returns (
            PayMorphTestnetV3Factory factory,
            PayMorphTestnetV3Router swapRouter,
            PayMorphTestnetV3Pool pool,
            PayMorphTestnetV3Quoter quoter,
            SparkDexV3Adapter adapter
        )
    {
        DeploymentConfig memory config = _loadConfig();
        IPayMorphRouterAdmin payMorphRouter = IPayMorphRouterAdmin(config.payMorphRouter);
        _preflight(config, payMorphRouter);

        vm.startBroadcast(config.deployerPrivateKey);
        factory = new PayMorphTestnetV3Factory(config.deployer, config.fxrp, config.usdt0, config.poolFee);
        swapRouter = new PayMorphTestnetV3Router(
            address(factory),
            config.fxrp,
            config.usdt0,
            config.poolFee,
            config.inputPerOutputNumerator,
            config.inputPerOutputDenominator
        );
        pool = new PayMorphTestnetV3Pool(config.usdt0, address(swapRouter));
        factory.setPool(address(pool));
        quoter = new PayMorphTestnetV3Quoter(address(swapRouter));
        adapter = new SparkDexV3Adapter(
            config.payMorphRouter, address(swapRouter), config.fxrp, config.usdt0, config.poolFee
        );

        // Fund before enabling the route. If this transfer reverts, the
        // PayMorph router remains FXRP-only and cannot expose a false route.
        IERC20(config.usdt0).safeTransfer(address(swapRouter), config.initialLiquidity);
        payMorphRouter.setAdapter(address(adapter));
        vm.stopBroadcast();

        console2.log("Route kind PAYMORPH_TESTNET");
        console2.log("PayMorphRouter", config.payMorphRouter);
        console2.log("PayMorphTestnetV3Factory", address(factory));
        console2.log("PayMorphTestnetV3Router", address(swapRouter));
        console2.log("PayMorphTestnetV3Pool", address(pool));
        console2.log("PayMorphTestnetV3Quoter", address(quoter));
        console2.log("PayMorph adapter", address(adapter));
        console2.log("Initial USDT0 liquidity", config.initialLiquidity);
    }

    function _loadConfig() private view returns (DeploymentConfig memory config) {
        if (block.chainid != 114) revert WrongChain(114, block.chainid);
        config.payMorphRouter = vm.envAddress("PAYMORPH_ROUTER_ADDRESS");
        config.deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.deployerPrivateKey);
        uint256 poolFeeRaw = vm.envOr("USDT0_ROUTE_POOL_FEE", uint256(500));
        uint256 initialLiquidityRaw = vm.envOr("USDT0_ROUTE_INITIAL_LIQUIDITY_BASE_UNITS", uint256(5_000_000));
        config.inputPerOutputNumerator = vm.envOr("USDT0_ROUTE_INPUT_PER_OUTPUT_NUMERATOR", uint256(1));
        config.inputPerOutputDenominator = vm.envOr("USDT0_ROUTE_INPUT_PER_OUTPUT_DENOMINATOR", uint256(1));
        if (poolFeeRaw == 0 || poolFeeRaw > type(uint24).max) revert InvalidAmount("USDT0_ROUTE_POOL_FEE", poolFeeRaw);
        if (initialLiquidityRaw == 0) {
            revert InvalidAmount("USDT0_ROUTE_INITIAL_LIQUIDITY_BASE_UNITS", initialLiquidityRaw);
        }
        config.initialLiquidity = initialLiquidityRaw;
        if (config.inputPerOutputNumerator == 0) {
            revert InvalidAmount("USDT0_ROUTE_INPUT_PER_OUTPUT_NUMERATOR", config.inputPerOutputNumerator);
        }
        if (config.inputPerOutputDenominator == 0) {
            revert InvalidAmount("USDT0_ROUTE_INPUT_PER_OUTPUT_DENOMINATOR", config.inputPerOutputDenominator);
        }
        // Safe after the explicit uint24 range check above.
        // forge-lint: disable-next-line(unsafe-typecast)
        config.poolFee = uint24(poolFeeRaw);

        _requireContract("PayMorphRouter", config.payMorphRouter);
        IPayMorphRouterAdmin payMorphRouter = IPayMorphRouterAdmin(config.payMorphRouter);
        config.fxrp = payMorphRouter.FXRP();
        config.usdt0 = payMorphRouter.USDT0();
        _requireContract("FXRP", config.fxrp);
        _requireContract("USDT0", config.usdt0);
    }

    function _preflight(DeploymentConfig memory config, IPayMorphRouterAdmin payMorphRouter) private view {
        address activeAdapter = payMorphRouter.adapter();
        if (activeAdapter != address(0)) revert AdapterAlreadyConfigured(activeAdapter);
        if (!payMorphRouter.hasRole(payMorphRouter.ADAPTER_MANAGER_ROLE(), config.deployer)) {
            revert MissingAdapterManagerRole(config.deployer);
        }
        uint256 available = IERC20(config.usdt0).balanceOf(config.deployer);
        if (available < config.initialLiquidity) {
            revert InsufficientUsdt0Liquidity(available, config.initialLiquidity);
        }
    }

    function _requireContract(string memory name, address account) private view {
        if (account == address(0) || account.code.length == 0) revert InvalidContract(name, account);
    }
}
