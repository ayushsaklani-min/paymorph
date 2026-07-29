// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {PayMorphRouter} from "../src/PayMorphRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract FxrpSettlementHandler is Test {
    PayMorphRouter public immutable router;
    MockERC20 public immutable fxrp;
    address public immutable recipient;
    address public immutable feeRecipient;

    uint256 public nonce;
    uint256 public totalInvoice;
    uint256 public totalFees;

    constructor(PayMorphRouter router_, MockERC20 fxrp_, address recipient_, address feeRecipient_) {
        router = router_;
        fxrp = fxrp_;
        recipient = recipient_;
        feeRecipient = feeRecipient_;
        fxrp.approve(address(router_), type(uint256).max);
    }

    function settle(uint128 amountSeed) external {
        uint256 invoiceAmount = bound(amountSeed, 1, type(uint96).max);
        uint256 fee = router.previewServiceFee(invoiceAmount, router.serviceFeeBps());
        fxrp.mint(address(this), invoiceAmount + fee);

        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](1);
        recipients[0] = PayMorphRouter.Recipient({account: recipient, bps: 10_000});
        router.settleFxrp(
            keccak256(abi.encode("invariant", nonce++)),
            invoiceAmount,
            recipients,
            router.serviceFeeBps(),
            block.timestamp,
            address(this)
        );

        totalInvoice += invoiceAmount;
        totalFees += fee;
    }
}

contract PayMorphRouterInvariantTest is StdInvariant, Test {
    MockERC20 private fxrp;
    MockERC20 private usdt0;
    PayMorphRouter private router;
    FxrpSettlementHandler private handler;
    address private recipient = address(0xB0B);
    address private feeRecipient = address(0xFEE);

    function setUp() public {
        fxrp = new MockERC20("FXRP", "FXRP", 6);
        usdt0 = new MockERC20("USDT0", "USDT0", 6);
        router = new PayMorphRouter(address(fxrp), address(usdt0), feeRecipient, 50, address(this));
        handler = new FxrpSettlementHandler(router, fxrp, recipient, feeRecipient);
        targetContract(address(handler));
    }

    function invariantRouterRetainsNoCoreTokenBalance() public view {
        assertEq(fxrp.balanceOf(address(router)), 0);
        assertEq(usdt0.balanceOf(address(router)), 0);
    }

    function invariantRecipientPayoutAndFeeEqualExactGross() public view {
        assertEq(fxrp.balanceOf(recipient), handler.totalInvoice());
        assertEq(fxrp.balanceOf(feeRecipient), handler.totalFees());
    }
}
