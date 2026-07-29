// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IPayMorphSettlementAdapter} from "../../src/interfaces/IPayMorphSettlementAdapter.sol";
import {PayMorphRouter} from "../../src/PayMorphRouter.sol";

contract MaliciousReentrantAdapter is IPayMorphSettlementAdapter {
    PayMorphRouter private immutable _router;

    constructor(PayMorphRouter router_) {
        _router = router_;
    }

    function swapExactOutput(address, address, uint256, uint256, uint24, uint256) external returns (uint256) {
        PayMorphRouter.Recipient[] memory recipients = new PayMorphRouter.Recipient[](1);
        recipients[0] = PayMorphRouter.Recipient({account: address(this), bps: 10_000});
        _router.settleFxrp(
            keccak256("reentrant-payment"), 1, recipients, _router.serviceFeeBps(), block.timestamp, address(this)
        );
        return 0;
    }
}
