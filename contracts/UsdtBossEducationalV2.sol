// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducational} from "./UsdtBossEducational.sol";

/// @notice Upgrade-test implementation. New versions must append storage and
/// retain the existing inheritance/storage layout.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV2 is UsdtBossEducational {
    function version() external pure returns (uint256) {
        return 2;
    }
}
