// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";

import {PayMorphRouter} from "../src/PayMorphRouter.sol";
import {SparkDexV3Adapter} from "../src/SparkDexV3Adapter.sol";

interface IFlareContractRegistry {
    function getContractAddressByName(string calldata name) external view returns (address);
}

interface IAssetManager {
    function fAsset() external view returns (address);
}

/// @title DeployPayMorph
/// @notice Resolves FXRP through Flare's registry, validates configured contracts, and deploys immutable v1.
contract DeployPayMorph is Script {
    struct DeploymentConfig {
        address registry;
        address usdt0;
        address swapRouter;
        address admin;
        address feeRecipient;
        address deployer;
        address assetManager;
        address fxrp;
        uint256 deployerPrivateKey;
        uint16 serviceFeeBps;
        uint24 poolFee;
        bool enableUsdt0;
    }

    error WrongChain(uint256 expected, uint256 actual);
    error InvalidContract(string name, address account);
    error InvalidAddress(string name, address account);
    error IntegerOutOfRange(string name, uint256 value);

    function run() external returns (PayMorphRouter router, SparkDexV3Adapter adapter) {
        DeploymentConfig memory config = _loadConfig();

        vm.startBroadcast(config.deployerPrivateKey);
        // The deployer temporarily holds roles so it can complete the circular router/adapter wiring.
        router =
            new PayMorphRouter(config.fxrp, config.usdt0, config.feeRecipient, config.serviceFeeBps, config.deployer);
        if (config.enableUsdt0) {
            adapter =
                new SparkDexV3Adapter(address(router), config.swapRouter, config.fxrp, config.usdt0, config.poolFee);
            router.setAdapter(address(adapter));
        }
        _handoffRoles(router, config.deployer, config.admin);
        vm.stopBroadcast();

        console2.log("PayMorphRouter", address(router));
        console2.log("SparkDexV3Adapter", address(adapter));
        console2.log("AssetManagerFXRP", config.assetManager);
        console2.log("FXRP", config.fxrp);
        console2.log("USDT0", config.usdt0);
        console2.log("SparkDEX router", config.swapRouter);
    }

    function _loadConfig() private view returns (DeploymentConfig memory config) {
        if (block.chainid != 114) revert WrongChain(114, block.chainid);

        config.registry = vm.envAddress("FLARE_CONTRACT_REGISTRY");
        config.usdt0 = vm.envAddress("USDT0_ADDRESS");
        config.enableUsdt0 = vm.envOr("ENABLE_USDT0", false);
        config.swapRouter = config.enableUsdt0 ? vm.envAddress("SPARKDEX_ROUTER_ADDRESS") : address(0);
        config.admin = vm.envAddress("CONTRACT_ADMIN");
        config.feeRecipient = vm.envAddress("FEE_RECIPIENT");
        config.deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.deployerPrivateKey);
        uint256 serviceFeeRaw = vm.envOr("SERVICE_FEE_BPS", uint256(50));
        uint256 poolFeeRaw = vm.envOr("SPARKDEX_POOL_FEE", uint256(500));

        _requireContract("FlareContractRegistry", config.registry);
        config.assetManager = IFlareContractRegistry(config.registry).getContractAddressByName("AssetManagerFXRP");
        _requireContract("AssetManagerFXRP", config.assetManager);
        config.fxrp = IAssetManager(config.assetManager).fAsset();
        _requireContract("FXRP", config.fxrp);
        _requireContract("USDT0", config.usdt0);
        if (config.enableUsdt0) {
            _requireContract("SparkDEX router", config.swapRouter);
        }
        if (config.admin == address(0)) {
            revert InvalidAddress("CONTRACT_ADMIN", config.admin);
        }
        if (config.feeRecipient == address(0)) {
            revert InvalidAddress("FEE_RECIPIENT", config.feeRecipient);
        }
        if (serviceFeeRaw > type(uint16).max) {
            revert IntegerOutOfRange("SERVICE_FEE_BPS", serviceFeeRaw);
        }
        if (poolFeeRaw > type(uint24).max) {
            revert IntegerOutOfRange("SPARKDEX_POOL_FEE", poolFeeRaw);
        }
        // Safe after the explicit range checks above.
        // forge-lint: disable-next-line(unsafe-typecast)
        config.serviceFeeBps = uint16(serviceFeeRaw);
        // forge-lint: disable-next-line(unsafe-typecast)
        config.poolFee = uint24(poolFeeRaw);
    }

    function _requireContract(string memory name, address account) private view {
        if (account == address(0) || account.code.length == 0) {
            revert InvalidContract(name, account);
        }
    }

    function _handoffRoles(PayMorphRouter router, address deployer, address admin) private {
        if (admin == deployer) return;
        router.grantRole(router.DEFAULT_ADMIN_ROLE(), admin);
        router.grantRole(router.FEE_MANAGER_ROLE(), admin);
        router.grantRole(router.ADAPTER_MANAGER_ROLE(), admin);
        router.grantRole(router.PAUSER_ROLE(), admin);
        router.renounceRole(router.FEE_MANAGER_ROLE(), deployer);
        router.renounceRole(router.ADAPTER_MANAGER_ROLE(), deployer);
        router.renounceRole(router.PAUSER_ROLE(), deployer);
        router.renounceRole(router.DEFAULT_ADMIN_ROLE(), deployer);
    }
}
