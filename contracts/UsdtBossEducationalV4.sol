// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV3} from "./UsdtBossEducationalV3.sol";

/// @notice Immediate-payout implementation. New live matrix, direct-commission,
/// Global Pool and treasury earnings are transferred during the transaction
/// that creates them. The inherited withdraw function remains available only
/// for pending balances accrued before this upgrade.
/// @dev Adds no storage and remains layout-compatible with the existing proxy.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV4 is UsdtBossEducationalV3 {
    function version() external pure virtual override returns (uint256) {
        return 4;
    }
}
