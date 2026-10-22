// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV6} from "./UsdtBossEducationalV6.sol";

/// @notice Removes the duplicated previous-platform Global Pool level records
/// after all historical holders have been activated in the live pool.
/// @dev V7-V13 added no storage, so this remains layout-compatible with V13.
/// This correction does not alter live membership, queues, fills, or income.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV14 is UsdtBossEducationalV6 {
    error LegacyGlobalClearIncomplete(uint256 expected, uint256 provided);
    error LegacyGlobalRecordUnavailable(address account);

    event LegacyGlobalRecordCleared(address indexed account, uint8 previousLevel);
    event LegacyGlobalRecordsCleared(uint256 count);

    function version() external pure override returns (uint256) {
        return 14;
    }

    /// @notice Clears every current legacy Global Pool record in one audited
    /// batch. Requiring the full count prevents a partial or ambiguous cleanup.
    function clearAllLegacyGlobalPoolRecords(address[] calldata accounts)
        external
        onlyOwner
        nonReentrant
    {
        uint256 count = legacyGlobalCount;
        if (count == 0 || accounts.length != count) {
            revert LegacyGlobalClearIncomplete(count, accounts.length);
        }
        if (accounts.length > 100) revert BatchTooLarge();

        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            uint8 previousLevel = legacyGlobalLevel[account];
            if (account == address(0) || previousLevel == 0) {
                revert LegacyGlobalRecordUnavailable(account);
            }
            delete legacyGlobalLevel[account];
            emit LegacyGlobalRecordCleared(account, previousLevel);
        }

        legacyGlobalCount = 0;
        emit LegacyGlobalRecordsCleared(count);
    }

    function globalQueueAccountA(uint8 level, uint256 index) external view returns (address) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts[index];
    }
}
