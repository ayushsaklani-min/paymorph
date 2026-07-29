// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPayMorphSettlementAdapter} from "./interfaces/IPayMorphSettlementAdapter.sol";

/// @title PayMorphRouter
/// @notice Immutable-token settlement router for atomic FXRP or exact-output USDT0 invoice payouts.
/// @dev Version 1 is non-upgradeable. It intentionally has no core-token rescue function: each successful
///      settlement must preserve the router's pre-call token balances.
contract PayMorphRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Settlement token selected by the merchant quote.
    enum SettlementAsset {
        FXRP,
        USDT0
    }

    /// @notice A recipient and its share of the invoice amount.
    struct Recipient {
        address account;
        uint16 bps;
    }

    /// @notice Fee configuration role.
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    /// @notice Adapter configuration role.
    bytes32 public constant ADAPTER_MANAGER_ROLE = keccak256("ADAPTER_MANAGER_ROLE");
    /// @notice Emergency pause role.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    /// @notice Basis-point denominator.
    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Maximum service fee (3%).
    uint16 public constant MAX_FEE_BPS = 300;
    /// @notice Maximum recipients per payment in v1.
    uint256 public constant MAX_RECIPIENTS = 10;

    /// @notice Dynamic-address constructor parameter is invalid.
    error InvalidAddress(address account);
    /// @notice A configured contract address has no bytecode.
    error AddressHasNoCode(address account);
    /// @notice Payment identifier is zero.
    error ZeroPaymentId();
    /// @notice Payment identifier has already settled.
    error PaymentAlreadySettled(bytes32 paymentId);
    /// @notice Settlement deadline has elapsed.
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    /// @notice Invoice or maximum input amount is zero.
    error ZeroAmount();
    /// @notice Recipient count is outside the v1 bounds.
    error InvalidRecipientCount(uint256 count);
    /// @notice Recipient account is zero.
    error ZeroRecipient(uint256 index);
    /// @notice Recipient basis points are zero.
    error ZeroRecipientBps(uint256 index);
    /// @notice Recipient account appears more than once.
    error DuplicateRecipient(address recipient);
    /// @notice Recipient basis points do not total exactly 10,000.
    error InvalidRecipientBpsTotal(uint256 total);
    /// @notice Fee is above the on-chain cap.
    error FeeExceedsMaximum(uint16 feeBps);
    /// @notice Quote fee snapshot is not the active on-chain fee.
    error FeeSnapshotMismatch(uint16 snapshot, uint16 currentFee);
    /// @notice No settlement adapter is configured.
    error AdapterNotConfigured();
    /// @notice Token transfer changed balances by a non-exact amount.
    error NonExactTokenTransfer(address token, uint256 expected, uint256 actual);
    /// @notice Adapter-reported input differs from the actual FXRP retained by the router for refund.
    error InvalidAdapterResult(uint256 reportedInput, uint256 maximumInput);
    /// @notice V1 only permits refunding the payer personal account that invoked settlement.
    error InvalidRefundRecipient(address expected, address actual);

    /// @notice Emitted only after the exact fee and all recipient payouts complete.
    event PaymentSettled(
        bytes32 indexed paymentId,
        address indexed payerPersonalAccount,
        SettlementAsset asset,
        uint256 invoiceAmount,
        uint256 serviceFee,
        uint256 inputFxrpUsed,
        address refundTo,
        uint256 refundFxrp
    );

    /// @notice Emitted for each exact recipient payout.
    event RecipientPaid(
        bytes32 indexed paymentId, address indexed recipient, address indexed token, uint256 amount, uint16 bps
    );

    /// @notice Emitted when the exact-output adapter changes.
    event AdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
    /// @notice Emitted when the active service fee changes.
    event ServiceFeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    /// @notice Emitted when the service-fee recipient changes.
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    /// @notice Replay protection keyed by the committed PayMorph payment identifier.
    mapping(bytes32 paymentId => bool isSettled) public settled;

    /// @notice Current service fee used by new settlement quotes.
    uint16 public serviceFeeBps;
    /// @notice Current service-fee recipient.
    address public feeRecipient;
    /// @notice Runtime-configurable exact-output adapter.
    IPayMorphSettlementAdapter public adapter;
    /// @notice FXRP token resolved at deployment from AssetManagerFXRP.
    IERC20 public immutable FXRP;
    /// @notice Configured and bytecode-validated USDT0 token.
    IERC20 public immutable USDT0;

    /// @param fxrp_ Runtime-resolved FXRP token.
    /// @param usdt0_ Bytecode-validated USDT0 token.
    /// @param feeRecipient_ Initial service-fee recipient.
    /// @param initialServiceFeeBps_ Initial service fee, at most 300 bps.
    /// @param admin_ Initial admin, fee manager, adapter manager, and pauser.
    constructor(address fxrp_, address usdt0_, address feeRecipient_, uint16 initialServiceFeeBps_, address admin_) {
        _requireContract(fxrp_);
        _requireContract(usdt0_);
        if (feeRecipient_ == address(0)) revert InvalidAddress(feeRecipient_);
        if (admin_ == address(0)) revert InvalidAddress(admin_);
        if (initialServiceFeeBps_ > MAX_FEE_BPS) {
            revert FeeExceedsMaximum(initialServiceFeeBps_);
        }

        FXRP = IERC20(fxrp_);
        USDT0 = IERC20(usdt0_);
        feeRecipient = feeRecipient_;
        serviceFeeBps = initialServiceFeeBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(FEE_MANAGER_ROLE, admin_);
        _grantRole(ADAPTER_MANAGER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
    }

    /// @notice Settles an FXRP invoice and its service fee atomically.
    /// @dev The blueprint originally supplied only a gross FXRP amount even though its normative fee formula is
    ///      `ceil(invoiceAmount * feeBps / 10_000)`. Gross alone cannot unambiguously recover the invoice base
    ///      amount under ceil rounding. This corrected interface takes `invoiceFxrpAmount` explicitly and derives
    ///      the gross pull as `invoiceFxrpAmount + previewServiceFee(...)`.
    /// @param paymentId Unique committed payment identifier.
    /// @param invoiceFxrpAmount Exact FXRP amount owed to recipients before service fee.
    /// @param recipients Ordered unique recipient split totaling 10,000 bps.
    /// @param feeBpsSnapshot Fee committed in the quote; must equal the current fee.
    /// @param deadline Latest valid execution timestamp.
    /// @param refundTo Committed payer personal account; must equal `msg.sender`. No FXRP refund occurs here.
    function settleFxrp(
        bytes32 paymentId,
        uint256 invoiceFxrpAmount,
        Recipient[] calldata recipients,
        uint16 feeBpsSnapshot,
        uint256 deadline,
        address refundTo
    ) external nonReentrant whenNotPaused {
        _validateSettlement(paymentId, invoiceFxrpAmount, feeBpsSnapshot, deadline, refundTo);
        _validateRecipients(recipients);

        uint256 serviceFee = previewServiceFee(invoiceFxrpAmount, feeBpsSnapshot);
        uint256 grossFxrpAmount = invoiceFxrpAmount + serviceFee;
        settled[paymentId] = true;

        _pullExact(FXRP, msg.sender, grossFxrpAmount);
        _distribute(paymentId, FXRP, invoiceFxrpAmount, recipients);
        _pushExact(FXRP, feeRecipient, serviceFee);

        emit PaymentSettled(
            paymentId, msg.sender, SettlementAsset.FXRP, invoiceFxrpAmount, serviceFee, grossFxrpAmount, refundTo, 0
        );
    }

    /// @notice Settles an exact USDT0 invoice output and refunds unused FXRP atomically.
    /// @param paymentId Unique committed payment identifier.
    /// @param maxFxrpInput Maximum FXRP the exact-output route may consume.
    /// @param invoiceUsdt0Out Exact USDT0 amount owed to recipients before service fee.
    /// @param recipients Ordered unique recipient split totaling 10,000 bps.
    /// @param feeBpsSnapshot Fee committed in the quote; must equal the current fee.
    /// @param poolFee Allowlisted pool fee committed in the quote.
    /// @param deadline Latest valid execution timestamp.
    /// @param refundTo Committed payer personal account receiving unused FXRP; must equal `msg.sender` in v1.
    function settleUsdt0ExactOut(
        bytes32 paymentId,
        uint256 maxFxrpInput,
        uint256 invoiceUsdt0Out,
        Recipient[] calldata recipients,
        uint16 feeBpsSnapshot,
        uint24 poolFee,
        uint256 deadline,
        address refundTo
    ) external nonReentrant whenNotPaused {
        _validateSettlement(paymentId, invoiceUsdt0Out, feeBpsSnapshot, deadline, refundTo);
        if (maxFxrpInput == 0) revert ZeroAmount();
        _validateRecipients(recipients);

        IPayMorphSettlementAdapter currentAdapter = adapter;
        if (address(currentAdapter) == address(0)) revert AdapterNotConfigured();

        uint256 serviceFee = previewServiceFee(invoiceUsdt0Out, feeBpsSnapshot);
        uint256 totalUsdt0Out = invoiceUsdt0Out + serviceFee;
        settled[paymentId] = true;

        (uint256 actualFxrpUsed, uint256 refundFxrp) =
            _swapForExactUsdt0(currentAdapter, maxFxrpInput, totalUsdt0Out, poolFee, deadline);
        _distribute(paymentId, USDT0, invoiceUsdt0Out, recipients);
        _pushExact(USDT0, feeRecipient, serviceFee);
        _pushExact(FXRP, refundTo, refundFxrp);

        _emitUsdt0Settlement(paymentId, invoiceUsdt0Out, serviceFee, actualFxrpUsed, refundTo, refundFxrp);
    }

    function _swapForExactUsdt0(
        IPayMorphSettlementAdapter currentAdapter,
        uint256 maxFxrpInput,
        uint256 totalUsdt0Out,
        uint24 poolFee,
        uint256 deadline
    ) private returns (uint256 actualFxrpUsed, uint256 refundFxrp) {
        _pullExact(FXRP, msg.sender, maxFxrpInput);
        _pushExact(FXRP, address(currentAdapter), maxFxrpInput);

        uint256 fxrpBeforeSwap = FXRP.balanceOf(address(this));
        uint256 usdt0BeforeSwap = USDT0.balanceOf(address(this));
        actualFxrpUsed = currentAdapter.swapExactOutput(
            address(FXRP), address(USDT0), totalUsdt0Out, maxFxrpInput, poolFee, deadline
        );
        if (actualFxrpUsed > maxFxrpInput) {
            revert InvalidAdapterResult(actualFxrpUsed, maxFxrpInput);
        }

        refundFxrp = maxFxrpInput - actualFxrpUsed;
        uint256 fxrpReturned = FXRP.balanceOf(address(this)) - fxrpBeforeSwap;
        if (fxrpReturned != refundFxrp) {
            revert NonExactTokenTransfer(address(FXRP), refundFxrp, fxrpReturned);
        }
        uint256 usdt0Received = USDT0.balanceOf(address(this)) - usdt0BeforeSwap;
        if (usdt0Received != totalUsdt0Out) {
            revert NonExactTokenTransfer(address(USDT0), totalUsdt0Out, usdt0Received);
        }
    }

    function _emitUsdt0Settlement(
        bytes32 paymentId,
        uint256 invoiceUsdt0Out,
        uint256 serviceFee,
        uint256 actualFxrpUsed,
        address refundTo,
        uint256 refundFxrp
    ) private {
        emit PaymentSettled(
            paymentId,
            msg.sender,
            SettlementAsset.USDT0,
            invoiceUsdt0Out,
            serviceFee,
            actualFxrpUsed,
            refundTo,
            refundFxrp
        );
    }

    /// @notice Returns the ceil-rounded service fee for an invoice amount.
    /// @param invoiceAmount Invoice amount before the service fee.
    /// @param feeBps Fee in basis points, capped at 300.
    function previewServiceFee(uint256 invoiceAmount, uint16 feeBps) public pure returns (uint256) {
        if (feeBps > MAX_FEE_BPS) revert FeeExceedsMaximum(feeBps);
        return Math.mulDiv(invoiceAmount, feeBps, BPS_DENOMINATOR, Math.Rounding.Ceil);
    }

    /// @notice Updates the active service fee.
    function setServiceFeeBps(uint16 newFeeBps) external onlyRole(FEE_MANAGER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeExceedsMaximum(newFeeBps);
        uint16 oldFeeBps = serviceFeeBps;
        serviceFeeBps = newFeeBps;
        emit ServiceFeeUpdated(oldFeeBps, newFeeBps);
    }

    /// @notice Updates the service-fee recipient.
    function setFeeRecipient(address newRecipient) external onlyRole(FEE_MANAGER_ROLE) {
        if (newRecipient == address(0)) revert InvalidAddress(newRecipient);
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /// @notice Updates the allowlisted settlement adapter.
    function setAdapter(address newAdapter) external onlyRole(ADAPTER_MANAGER_ROLE) {
        _requireContract(newAdapter);
        address oldAdapter = address(adapter);
        adapter = IPayMorphSettlementAdapter(newAdapter);
        emit AdapterUpdated(oldAdapter, newAdapter);
    }

    /// @notice Pauses new settlements.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes settlements.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateSettlement(
        bytes32 paymentId,
        uint256 invoiceAmount,
        uint16 feeBpsSnapshot,
        uint256 deadline,
        address refundTo
    ) private view {
        if (paymentId == bytes32(0)) revert ZeroPaymentId();
        if (settled[paymentId]) revert PaymentAlreadySettled(paymentId);
        if (invoiceAmount == 0) revert ZeroAmount();
        // A timestamp deadline is the intended quote-expiry guard; minor validator skew cannot redirect funds.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        if (refundTo == address(0)) revert InvalidAddress(refundTo);
        if (refundTo != msg.sender) revert InvalidRefundRecipient(msg.sender, refundTo);
        if (feeBpsSnapshot != serviceFeeBps) {
            revert FeeSnapshotMismatch(feeBpsSnapshot, serviceFeeBps);
        }
    }

    function _validateRecipients(Recipient[] calldata recipients) private pure {
        uint256 length = recipients.length;
        if (length == 0 || length > MAX_RECIPIENTS) revert InvalidRecipientCount(length);

        uint256 totalBps;
        for (uint256 i; i < length; ++i) {
            Recipient calldata recipient = recipients[i];
            if (recipient.account == address(0)) revert ZeroRecipient(i);
            if (recipient.bps == 0) revert ZeroRecipientBps(i);
            totalBps += recipient.bps;
            for (uint256 j; j < i; ++j) {
                if (recipients[j].account == recipient.account) {
                    revert DuplicateRecipient(recipient.account);
                }
            }
        }
        if (totalBps != BPS_DENOMINATOR) revert InvalidRecipientBpsTotal(totalBps);
    }

    function _distribute(bytes32 paymentId, IERC20 token, uint256 invoiceAmount, Recipient[] calldata recipients)
        private
    {
        uint256 paid;
        uint256 finalIndex = recipients.length - 1;
        for (uint256 i; i < recipients.length; ++i) {
            uint256 payout =
                i == finalIndex ? invoiceAmount - paid : Math.mulDiv(invoiceAmount, recipients[i].bps, BPS_DENOMINATOR);
            paid += payout;
            _pushExact(token, recipients[i].account, payout);
            emit RecipientPaid(paymentId, recipients[i].account, address(token), payout, recipients[i].bps);
        }
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert NonExactTokenTransfer(address(token), amount, received);
    }

    function _pushExact(IERC20 token, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 senderBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(to);
        token.safeTransfer(to, amount);
        uint256 sent = senderBefore - token.balanceOf(address(this));
        uint256 received = token.balanceOf(to) - recipientBefore;
        if (sent != amount || received != amount) {
            revert NonExactTokenTransfer(address(token), amount, received);
        }
    }

    function _requireContract(address account) private view {
        if (account == address(0)) revert InvalidAddress(account);
        if (account.code.length == 0) revert AddressHasNoCode(account);
    }
}
