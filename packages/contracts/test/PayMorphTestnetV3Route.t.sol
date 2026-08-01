// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";

import {PayMorphRouter} from "../src/PayMorphRouter.sol";
import {PayMorphTestnetV3Factory} from "../src/PayMorphTestnetV3Factory.sol";
import {PayMorphTestnetV3Pool} from "../src/PayMorphTestnetV3Pool.sol";
import {PayMorphTestnetV3Quoter} from "../src/PayMorphTestnetV3Quoter.sol";
import {PayMorphTestnetV3Router} from "../src/PayMorphTestnetV3Router.sol";
import {SparkDexV3Adapter} from "../src/SparkDexV3Adapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PayMorphTestnetV3RouteTest is Test {
    uint16 private constant SERVICE_FEE_BPS = 50;
    uint24 private constant POOL_FEE = 500;
    address private constant PAYER = address(0xA11CE);
    address private constant FEE_RECIPIENT = address(0xFEE);
    address private constant RECIPIENT = address(0xB0B);

    MockERC20 private fxrp;
    MockERC20 private usdt0;
    PayMorphRouter private payMorphRouter;
    PayMorphTestnetV3Factory private factory;
    PayMorphTestnetV3Router private swapRouter;
    PayMorphTestnetV3Pool private pool;
    PayMorphTestnetV3Quoter private quoter;

    function setUp() public {
        fxrp = new MockERC20("FXRP", "FXRP", 6);
        usdt0 = new MockERC20("USDT0", "USDT0", 6);
        payMorphRouter =
            new PayMorphRouter(address(fxrp), address(usdt0), FEE_RECIPIENT, SERVICE_FEE_BPS, address(this));
        factory = new PayMorphTestnetV3Factory(address(this), address(fxrp), address(usdt0), POOL_FEE);
        // Two FXRP base units buy one USDT0 base unit. The exact integer ratio
        // makes this controlled testnet route deterministic and auditable.
        swapRouter = new PayMorphTestnetV3Router(address(factory), address(fxrp), address(usdt0), POOL_FEE, 2, 1);
        pool = new PayMorphTestnetV3Pool(address(usdt0), address(swapRouter));
        factory.setPool(address(pool));
        quoter = new PayMorphTestnetV3Quoter(address(swapRouter));
        SparkDexV3Adapter adapter = new SparkDexV3Adapter(
            address(payMorphRouter), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE
        );
        payMorphRouter.setAdapter(address(adapter));
        usdt0.mint(address(swapRouter), 10_000_000);
    }

    function testQuoterAndSettlementMoveActualTestTokens() public {
        uint256 invoiceOut = 1_000_000;
        uint256 serviceFee = 5_000;
        uint256 totalUsdt0Out = invoiceOut + serviceFee;
        uint256 expectedFxrpIn = totalUsdt0Out * 2;
        uint256 maxFxrpInput = expectedFxrpIn + 90_000;

        (uint256 quoteInput, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate) = quoter.quoteExactOutputSingle(
            PayMorphTestnetV3Quoter.QuoteExactOutputSingleParams({
                tokenIn: address(fxrp),
                tokenOut: address(usdt0),
                amount: totalUsdt0Out,
                fee: POOL_FEE,
                sqrtPriceLimitX96: 0
            })
        );
        assertEq(quoteInput, expectedFxrpIn);
        assertEq(sqrtPriceX96After, 0);
        assertEq(initializedTicksCrossed, 0);
        assertEq(gasEstimate, 0);
        assertEq(pool.liquidity(), 10_000_000);

        fxrp.mint(PAYER, maxFxrpInput);
        vm.prank(PAYER);
        fxrp.approve(address(payMorphRouter), maxFxrpInput);
        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](1);
        recipients[0] = PayMorphRouter.Recipient({account: RECIPIENT, bps: 10_000});

        vm.prank(PAYER);
        payMorphRouter.settleUsdt0ExactOut(
            keccak256("paymorph-testnet-route"),
            maxFxrpInput,
            invoiceOut,
            recipients,
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );

        assertEq(usdt0.balanceOf(RECIPIENT), invoiceOut);
        assertEq(usdt0.balanceOf(FEE_RECIPIENT), serviceFee);
        assertEq(fxrp.balanceOf(PAYER), maxFxrpInput - expectedFxrpIn);
        assertEq(fxrp.balanceOf(address(swapRouter)), expectedFxrpIn);
        assertEq(pool.liquidity(), 10_000_000 - totalUsdt0Out);
        assertEq(fxrp.balanceOf(address(payMorphRouter)), 0);
        assertEq(usdt0.balanceOf(address(payMorphRouter)), 0);
    }

    function testRouteRefusesQuotesAboveActualUsdt0Liquidity() public {
        vm.expectRevert(
            abi.encodeWithSelector(PayMorphTestnetV3Router.InsufficientOutputLiquidity.selector, 10_000_000, 10_000_001)
        );
        quoter.quoteExactOutputSingle(
            PayMorphTestnetV3Quoter.QuoteExactOutputSingleParams({
                tokenIn: address(fxrp),
                tokenOut: address(usdt0),
                amount: 10_000_001,
                fee: POOL_FEE,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
