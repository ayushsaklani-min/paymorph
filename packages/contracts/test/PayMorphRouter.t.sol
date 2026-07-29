// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PayMorphRouter} from "../src/PayMorphRouter.sol";
import {SparkDexV3Adapter} from "../src/SparkDexV3Adapter.sol";
import {MaliciousReentrantAdapter} from "./mocks/MaliciousReentrantAdapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockOutboundFeeERC20} from "./mocks/MockOutboundFeeERC20.sol";
import {MockSettlementAdapter} from "./mocks/MockSettlementAdapter.sol";
import {MockUniswapV3Router} from "./mocks/MockUniswapV3Router.sol";

contract PayMorphRouterTest is Test {
    uint16 private constant SERVICE_FEE_BPS = 50;
    uint24 private constant POOL_FEE = 500;
    address private constant PAYER = address(0xA11CE);
    address private constant FEE_RECIPIENT = address(0xFEE);
    address private constant RECIPIENT_ONE = address(0xB0B);
    address private constant RECIPIENT_TWO = address(0xCAFE);

    MockERC20 private fxrp;
    MockERC20 private usdt0;
    MockUniswapV3Router private swapRouter;
    PayMorphRouter private router;
    SparkDexV3Adapter private adapter;

    function setUp() public {
        fxrp = new MockERC20("FXRP", "FXRP", 6);
        usdt0 = new MockERC20("USDT0", "USDT0", 6);
        swapRouter = new MockUniswapV3Router();
        router = new PayMorphRouter(address(fxrp), address(usdt0), FEE_RECIPIENT, SERVICE_FEE_BPS, address(this));
        adapter = new SparkDexV3Adapter(address(router), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE);
        router.setAdapter(address(adapter));
    }

    function testSettleFxrpSingleRecipientUsesExplicitInvoiceBase() public {
        uint256 invoiceAmount = 10_000;
        uint256 expectedFee = 50;
        uint256 expectedGross = 10_050;
        PayMorphRouter.Recipient[] memory recipients = _singleRecipient();

        _fundAndApprove(PAYER, expectedGross);
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("fxrp-explicit-invoice"), invoiceAmount, recipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );

        assertEq(fxrp.balanceOf(RECIPIENT_ONE), invoiceAmount);
        assertEq(fxrp.balanceOf(FEE_RECIPIENT), expectedFee);
        assertEq(fxrp.balanceOf(address(router)), 0);
        // Applying the fee to gross would incorrectly produce 51. The router derives it from the explicit invoice.
        assertEq(router.previewServiceFee(expectedGross, SERVICE_FEE_BPS), 51);
    }

    function testSettleFxrpTenRecipientsAssignsRemainderToFinalRecipient() public {
        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](10);
        for (uint256 i; i < 10; ++i) {
            // Safe because 0x100 + i is bounded to [0x100, 0x109].
            // forge-lint: disable-next-line(unsafe-typecast)
            recipients[i] = PayMorphRouter.Recipient({account: address(uint160(0x100 + i)), bps: 1_000});
        }
        uint256 invoiceAmount = 10_003;
        uint256 fee = router.previewServiceFee(invoiceAmount, SERVICE_FEE_BPS);
        _fundAndApprove(PAYER, invoiceAmount + fee);

        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("ten-recipient-payment"), invoiceAmount, recipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );

        for (uint256 i; i < 9; ++i) {
            assertEq(fxrp.balanceOf(recipients[i].account), 1_000);
        }
        assertEq(fxrp.balanceOf(recipients[9].account), 1_003);
        assertEq(fxrp.balanceOf(FEE_RECIPIENT), fee);
        assertEq(fxrp.balanceOf(address(router)), 0);
    }

    function testSettleUsdt0ExactOutputDistributesFeeAndRefundsUnusedFxrp() public {
        uint256 invoiceOut = 25_000_000;
        uint256 serviceFee = 125_000;
        uint256 maxInput = 30_000_000;
        uint256 actualInput = 20_000_000;
        swapRouter.setAmountIn(actualInput);
        usdt0.mint(address(swapRouter), invoiceOut + serviceFee);
        _fundAndApprove(PAYER, maxInput);

        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("usdt0-payment"),
            maxInput,
            invoiceOut,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );

        assertEq(usdt0.balanceOf(RECIPIENT_ONE), invoiceOut);
        assertEq(usdt0.balanceOf(FEE_RECIPIENT), serviceFee);
        assertEq(fxrp.balanceOf(PAYER), maxInput - actualInput);
        assertEq(fxrp.balanceOf(address(router)), 0);
        assertEq(usdt0.balanceOf(address(router)), 0);
        assertEq(fxrp.balanceOf(address(adapter)), 0);
    }

    function testAdapterRevertLeavesNoPartialPayment() public {
        bytes32 paymentId = keccak256("failed-swap");
        uint256 maxInput = 2_000_000;
        swapRouter.setShouldRevert(true);
        _fundAndApprove(PAYER, maxInput);

        vm.expectRevert(MockUniswapV3Router.SwapReverted.selector);
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            paymentId, maxInput, 1_000_000, _singleRecipient(), SERVICE_FEE_BPS, POOL_FEE, block.timestamp + 1, PAYER
        );

        assertFalse(router.settled(paymentId));
        assertEq(fxrp.balanceOf(PAYER), maxInput);
        assertEq(usdt0.balanceOf(RECIPIENT_ONE), 0);
        assertEq(fxrp.balanceOf(address(router)), 0);
        assertEq(fxrp.balanceOf(address(adapter)), 0);
    }

    function testMaliciousAdapterCannotReenter() public {
        MaliciousReentrantAdapter maliciousAdapter = new MaliciousReentrantAdapter(router);
        router.setAdapter(address(maliciousAdapter));
        uint256 maxInput = 2_000_000;
        _fundAndApprove(PAYER, maxInput);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("reentrancy-attempt"),
            maxInput,
            1_000_000,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );

        assertEq(fxrp.balanceOf(PAYER), maxInput);
        assertEq(fxrp.balanceOf(address(router)), 0);
        assertEq(fxrp.balanceOf(address(maliciousAdapter)), 0);
    }

    function testDuplicatePaymentIdReverts() public {
        bytes32 paymentId = keccak256("duplicate");
        uint256 invoiceAmount = 1_000_000;
        uint256 gross = invoiceAmount + router.previewServiceFee(invoiceAmount, SERVICE_FEE_BPS);
        _fundAndApprove(PAYER, gross * 2);

        vm.startPrank(PAYER);
        router.settleFxrp(paymentId, invoiceAmount, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.PaymentAlreadySettled.selector, paymentId));
        router.settleFxrp(paymentId, invoiceAmount, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
        vm.stopPrank();
    }

    function testExpiredDeadlineReverts() public {
        vm.warp(100);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.DeadlineExpired.selector, 99, 100));
        vm.prank(PAYER);
        router.settleFxrp(keccak256("expired"), 1, _singleRecipient(), SERVICE_FEE_BPS, 99, PAYER);
    }

    function testRecipientTotalMustEqualTenThousand() public {
        PayMorphRouter.Recipient[] memory recipients = _twoRecipients(5_000, 4_999);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidRecipientBpsTotal.selector, 9_999));
        vm.prank(PAYER);
        router.settleFxrp(keccak256("bad-bps"), 1, recipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
    }

    function testDuplicateRecipientReverts() public {
        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](2);
        recipients[0] = PayMorphRouter.Recipient({account: RECIPIENT_ONE, bps: 5_000});
        recipients[1] = PayMorphRouter.Recipient({account: RECIPIENT_ONE, bps: 5_000});
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.DuplicateRecipient.selector, RECIPIENT_ONE));
        vm.prank(PAYER);
        router.settleFxrp(keccak256("duplicate-recipient"), 1, recipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
    }

    function testZeroRecipientReverts() public {
        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](1);
        recipients[0] = PayMorphRouter.Recipient({account: address(0), bps: 10_000});
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.ZeroRecipient.selector, 0));
        vm.prank(PAYER);
        router.settleFxrp(keccak256("zero-recipient"), 1, recipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
    }

    function testFeeAboveMaximumReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.FeeExceedsMaximum.selector, 301));
        router.setServiceFeeBps(301);
    }

    function testConstructorValidation() public {
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        new PayMorphRouter(address(0), address(usdt0), FEE_RECIPIENT, 50, address(this));

        address noCode = address(0x1234);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.AddressHasNoCode.selector, noCode));
        new PayMorphRouter(noCode, address(usdt0), FEE_RECIPIENT, 50, address(this));

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        new PayMorphRouter(address(fxrp), address(usdt0), address(0), 50, address(this));

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        new PayMorphRouter(address(fxrp), address(usdt0), FEE_RECIPIENT, 50, address(0));

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.FeeExceedsMaximum.selector, 301));
        new PayMorphRouter(address(fxrp), address(usdt0), FEE_RECIPIENT, 301, address(this));
    }

    function testFeeSnapshotMustEqualCurrentFee() public {
        vm.expectRevert(
            abi.encodeWithSelector(PayMorphRouter.FeeSnapshotMismatch.selector, SERVICE_FEE_BPS - 1, SERVICE_FEE_BPS)
        );
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("fee-mismatch"), 1, _singleRecipient(), SERVICE_FEE_BPS - 1, block.timestamp + 1, PAYER
        );
    }

    function testAdministrativeUpdatesAndUnpause() public {
        address newFeeRecipient = address(0xABCD);
        router.setServiceFeeBps(100);
        router.setFeeRecipient(newFeeRecipient);
        router.pause();
        router.unpause();

        assertEq(router.serviceFeeBps(), 100);
        assertEq(router.feeRecipient(), newFeeRecipient);
        assertFalse(router.paused());

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        router.setFeeRecipient(address(0));
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        router.setAdapter(address(0));
    }

    function testPausedSettlementReverts() public {
        router.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(PAYER);
        router.settleFxrp(keccak256("paused"), 1, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER);
    }

    function testFeeOnTransferInputIsRejected() public {
        MockFeeOnTransferERC20 feeToken = new MockFeeOnTransferERC20();
        PayMorphRouter strictRouter =
            new PayMorphRouter(address(feeToken), address(usdt0), FEE_RECIPIENT, SERVICE_FEE_BPS, address(this));
        uint256 invoiceAmount = 1_000_000;
        uint256 gross = invoiceAmount + strictRouter.previewServiceFee(invoiceAmount, SERVICE_FEE_BPS);
        feeToken.mint(PAYER, gross);
        vm.prank(PAYER);
        feeToken.approve(address(strictRouter), gross);

        uint256 receivedAfterTransferFee = gross - (gross / 100);
        vm.expectRevert(
            abi.encodeWithSelector(
                PayMorphRouter.NonExactTokenTransfer.selector, address(feeToken), gross, receivedAfterTransferFee
            )
        );
        vm.prank(PAYER);
        strictRouter.settleFxrp(
            keccak256("fee-on-transfer"), invoiceAmount, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );
    }

    function testUnsupportedPoolFeeRevertsAtomically() public {
        uint256 maxInput = 2_000_000;
        _fundAndApprove(PAYER, maxInput);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.UnsupportedPoolFee.selector, uint24(3_000)));
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("wrong-fee"),
            maxInput,
            1_000_000,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            3_000,
            block.timestamp + 1,
            PAYER
        );
        assertEq(fxrp.balanceOf(PAYER), maxInput);
    }

    function testSettlementInputValidationBranches() public {
        vm.expectRevert(PayMorphRouter.ZeroPaymentId.selector);
        vm.prank(PAYER);
        router.settleFxrp(bytes32(0), 1, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER);

        vm.expectRevert(PayMorphRouter.ZeroAmount.selector);
        vm.prank(PAYER);
        router.settleFxrp(keccak256("zero-amount"), 0, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, PAYER);

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAddress.selector, address(0)));
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("zero-refund"), 1, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, address(0)
        );

        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidRefundRecipient.selector, PAYER, RECIPIENT_TWO));
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("redirected-refund"), 1, _singleRecipient(), SERVICE_FEE_BPS, block.timestamp + 1, RECIPIENT_TWO
        );

        PayMorphRouter.Recipient[] memory emptyRecipients = new PayMorphRouter.Recipient[](0);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidRecipientCount.selector, 0));
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("empty-recipients"), 1, emptyRecipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );

        PayMorphRouter.Recipient[] memory tooManyRecipients = new PayMorphRouter.Recipient[](11);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidRecipientCount.selector, 11));
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("too-many-recipients"), 1, tooManyRecipients, SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );

        PayMorphRouter.Recipient[] memory zeroBpsRecipient = new PayMorphRouter.Recipient[](1);
        zeroBpsRecipient[0] = PayMorphRouter.Recipient({account: RECIPIENT_ONE, bps: 0});
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.ZeroRecipientBps.selector, 0));
        vm.prank(PAYER);
        router.settleFxrp(
            keccak256("zero-recipient-bps"), 1, zeroBpsRecipient, SERVICE_FEE_BPS, block.timestamp + 1, PAYER
        );

        vm.expectRevert(PayMorphRouter.ZeroAmount.selector);
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("zero-max"), 0, 1, _singleRecipient(), SERVICE_FEE_BPS, POOL_FEE, block.timestamp + 1, PAYER
        );
    }

    function testUsdt0RequiresConfiguredAdapter() public {
        PayMorphRouter noAdapterRouter =
            new PayMorphRouter(address(fxrp), address(usdt0), FEE_RECIPIENT, SERVICE_FEE_BPS, address(this));
        vm.expectRevert(PayMorphRouter.AdapterNotConfigured.selector);
        vm.prank(PAYER);
        noAdapterRouter.settleUsdt0ExactOut(
            keccak256("no-adapter"), 1, 1, _singleRecipient(), SERVICE_FEE_BPS, POOL_FEE, block.timestamp + 1, PAYER
        );
    }

    function testRouterRejectsInvalidAdapterAccounting() public {
        MockSettlementAdapter mockAdapter = new MockSettlementAdapter(fxrp, usdt0);
        router.setAdapter(address(mockAdapter));
        uint256 maxInput = 1_000_000;
        _fundAndApprove(PAYER, maxInput * 3);

        mockAdapter.configure(maxInput + 1, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(PayMorphRouter.InvalidAdapterResult.selector, maxInput + 1, maxInput));
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("bad-report"),
            maxInput,
            500_000,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );

        mockAdapter.configure(maxInput / 2, 0, 0);
        vm.expectPartialRevert(PayMorphRouter.NonExactTokenTransfer.selector);
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("bad-refund"),
            maxInput,
            500_000,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );

        uint256 totalOutput = 500_000 + router.previewServiceFee(500_000, SERVICE_FEE_BPS);
        usdt0.mint(address(mockAdapter), totalOutput - 1);
        mockAdapter.configure(maxInput, 0, totalOutput - 1);
        vm.expectPartialRevert(PayMorphRouter.NonExactTokenTransfer.selector);
        vm.prank(PAYER);
        router.settleUsdt0ExactOut(
            keccak256("bad-output"),
            maxInput,
            500_000,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );
    }

    function testOutboundFeeTokenIsRejected() public {
        MockOutboundFeeERC20 feeUsdt0 = new MockOutboundFeeERC20();
        MockUniswapV3Router localSwapRouter = new MockUniswapV3Router();
        PayMorphRouter strictRouter =
            new PayMorphRouter(address(fxrp), address(feeUsdt0), FEE_RECIPIENT, SERVICE_FEE_BPS, address(this));
        SparkDexV3Adapter strictAdapter = new SparkDexV3Adapter(
            address(strictRouter), address(localSwapRouter), address(fxrp), address(feeUsdt0), POOL_FEE
        );
        strictRouter.setAdapter(address(strictAdapter));
        feeUsdt0.setFeeSender(address(strictRouter));

        uint256 invoiceOut = 1_000_000;
        uint256 totalOut = invoiceOut + strictRouter.previewServiceFee(invoiceOut, SERVICE_FEE_BPS);
        uint256 maxInput = 2_000_000;
        localSwapRouter.setAmountIn(maxInput);
        feeUsdt0.mint(address(localSwapRouter), totalOut);
        fxrp.mint(PAYER, maxInput);
        vm.prank(PAYER);
        fxrp.approve(address(strictRouter), maxInput);

        vm.expectPartialRevert(PayMorphRouter.NonExactTokenTransfer.selector);
        vm.prank(PAYER);
        strictRouter.settleUsdt0ExactOut(
            keccak256("outbound-fee"),
            maxInput,
            invoiceOut,
            _singleRecipient(),
            SERVICE_FEE_BPS,
            POOL_FEE,
            block.timestamp + 1,
            PAYER
        );
    }

    function testSparkAdapterValidationAndAccounting() public {
        SparkDexV3Adapter directAdapter =
            new SparkDexV3Adapter(address(this), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE);
        uint256 amountOut = 1_000_000;
        uint256 maximum = 2_000_000;

        vm.prank(PAYER);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.UnauthorizedCaller.selector, PAYER));
        adapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp + 1);

        vm.expectPartialRevert(SparkDexV3Adapter.UnsupportedTokenPair.selector);
        directAdapter.swapExactOutput(address(usdt0), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp + 1);
        vm.expectRevert(SparkDexV3Adapter.ZeroAmount.selector);
        directAdapter.swapExactOutput(address(fxrp), address(usdt0), 0, maximum, POOL_FEE, block.timestamp + 1);
        vm.warp(100);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.DeadlineExpired.selector, 99, 100));
        directAdapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, 99);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.UnexpectedInputBalance.selector, maximum, 0));
        directAdapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp);

        fxrp.mint(address(directAdapter), maximum);
        usdt0.mint(address(swapRouter), amountOut);
        swapRouter.setAmountIn(maximum);
        uint256 amountIn =
            directAdapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp);
        assertEq(amountIn, maximum);
        assertEq(fxrp.balanceOf(address(directAdapter)), 0);
    }

    function testSparkAdapterRejectsInvalidRouterAccounting() public {
        SparkDexV3Adapter directAdapter =
            new SparkDexV3Adapter(address(this), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE);
        uint256 maximum = 2_000_000;
        uint256 amountOut = 1_000_000;

        fxrp.mint(address(directAdapter), maximum);
        usdt0.mint(address(swapRouter), amountOut);
        swapRouter.setAmountIn(maximum + 1);
        swapRouter.setConsumedAmountIn(0);
        swapRouter.setSkipMaximumCheck(true);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.InvalidAmountIn.selector, maximum + 1, maximum));
        directAdapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp + 1);

        swapRouter.setSkipMaximumCheck(false);
        swapRouter.setAmountIn(maximum / 2);
        swapRouter.setConsumedAmountIn(maximum / 2 + 1);
        vm.expectPartialRevert(SparkDexV3Adapter.InvalidAmountIn.selector);
        directAdapter.swapExactOutput(address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp + 1);
    }

    function testSparkAdapterPreservesPreexistingInputDust() public {
        SparkDexV3Adapter directAdapter =
            new SparkDexV3Adapter(address(this), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE);
        uint256 donatedDust = 123;
        uint256 maximum = 2_000_000;
        uint256 amountIn = 1_500_000;
        uint256 amountOut = 1_000_000;
        fxrp.mint(address(directAdapter), donatedDust + maximum);
        usdt0.mint(address(swapRouter), amountOut);
        swapRouter.setAmountIn(amountIn);

        uint256 reportedAmountIn = directAdapter.swapExactOutput(
            address(fxrp), address(usdt0), amountOut, maximum, POOL_FEE, block.timestamp + 1
        );

        assertEq(reportedAmountIn, amountIn);
        assertEq(fxrp.balanceOf(address(directAdapter)), donatedDust);
        assertEq(fxrp.balanceOf(address(this)), maximum - amountIn);
    }

    function testSparkAdapterConstructorValidation() public {
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.InvalidContract.selector, address(0)));
        new SparkDexV3Adapter(address(0), address(swapRouter), address(fxrp), address(usdt0), POOL_FEE);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.InvalidContract.selector, address(0x1234)));
        new SparkDexV3Adapter(address(this), address(0x1234), address(fxrp), address(usdt0), POOL_FEE);
        vm.expectRevert(abi.encodeWithSelector(SparkDexV3Adapter.UnsupportedPoolFee.selector, uint24(0)));
        new SparkDexV3Adapter(address(this), address(swapRouter), address(fxrp), address(usdt0), 0);
    }

    function testFuzzPreviewServiceFeeMatchesCeil(uint128 invoiceAmount, uint16 feeBpsSeed) public view {
        uint16 feeBps = uint16(bound(feeBpsSeed, 0, 300));
        uint256 expected = (uint256(invoiceAmount) * feeBps + 9_999) / 10_000;
        assertEq(router.previewServiceFee(invoiceAmount, feeBps), expected);
    }

    function testFuzzFxrpPayoutConservesInvoiceAndFee(uint128 invoiceSeed, uint16 firstRecipientBpsSeed) public {
        uint256 invoiceAmount = bound(invoiceSeed, 1, type(uint96).max);
        uint16 firstBps = uint16(bound(firstRecipientBpsSeed, 1, 9_999));
        PayMorphRouter.Recipient[] memory recipients = _twoRecipients(firstBps, uint16(10_000 - firstBps));
        uint256 fee = router.previewServiceFee(invoiceAmount, SERVICE_FEE_BPS);
        _fundAndApprove(PAYER, invoiceAmount + fee);

        vm.prank(PAYER);
        router.settleFxrp(
            keccak256(abi.encode(invoiceAmount, firstBps)),
            invoiceAmount,
            recipients,
            SERVICE_FEE_BPS,
            block.timestamp + 1,
            PAYER
        );

        assertEq(fxrp.balanceOf(RECIPIENT_ONE) + fxrp.balanceOf(RECIPIENT_TWO), invoiceAmount);
        assertEq(fxrp.balanceOf(FEE_RECIPIENT), fee);
        assertEq(fxrp.balanceOf(address(router)), 0);
    }

    function _singleRecipient() private pure returns (PayMorphRouter.Recipient[] memory recipients) {
        recipients = new PayMorphRouter.Recipient[](1);
        recipients[0] = PayMorphRouter.Recipient({account: RECIPIENT_ONE, bps: 10_000});
    }

    function _twoRecipients(uint16 firstBps, uint16 secondBps)
        private
        pure
        returns (PayMorphRouter.Recipient[] memory recipients)
    {
        recipients = new PayMorphRouter.Recipient[](2);
        recipients[0] = PayMorphRouter.Recipient({account: RECIPIENT_ONE, bps: firstBps});
        recipients[1] = PayMorphRouter.Recipient({account: RECIPIENT_TWO, bps: secondBps});
    }

    function _fundAndApprove(address payer, uint256 amount) private {
        fxrp.mint(payer, amount);
        vm.prank(payer);
        fxrp.approve(address(router), type(uint256).max);
    }
}
