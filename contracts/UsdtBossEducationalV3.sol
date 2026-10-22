// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducational} from "./UsdtBossEducational.sol";

/// @notice Adds display-only legacy identities and Global Pool income without
/// changing live queues, withdrawable balances, or token liabilities.
/// @dev Storage is append-only for the existing UUPS proxy.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV3 is UsdtBossEducational {
    struct LegacyIdentityRecord {
        address account;
        uint256 userId;
    }

    struct LegacyGlobalIncomeRecord {
        address account;
        uint256 amount;
    }

    mapping(address => uint256) public legacyUserId;
    mapping(uint256 => address) public legacyIdAccount;
    uint256 public legacyIdentityCount;
    bool public legacyIdentityFinalized;

    mapping(address => uint256) public legacyGlobalIncome;
    uint256 public legacyGlobalIncomeTotal;
    bool public legacyGlobalIncomeFinalized;

    error InvalidLegacyUserId();
    error LegacyUserIdAlreadyAssigned();

    event LegacyIdentityBackfilled(address indexed account, uint256 indexed userId);
    event LegacyIdentityFinalized(uint256 count);
    event LegacyGlobalIncomeBackfilled(address indexed account, uint256 amount);
    event LegacyGlobalIncomeFinalized(uint256 total);

    function version() external pure virtual returns (uint256) {
        return 3;
    }

    /// @notice Records the old platform's public member IDs for display and
    /// referral lookup. It creates no membership or financial state.
    function backfillLegacyIdentities(LegacyIdentityRecord[] calldata records) external onlyOwner {
        if (legacyIdentityFinalized) revert MigrationClosed();
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            LegacyIdentityRecord calldata record = records[i];
            if (record.account == address(0)) revert ZeroAddress();
            if (record.userId == 0) revert InvalidLegacyUserId();
            if (!members[record.account].joined) revert NotJoined();

            uint256 previousId = legacyUserId[record.account];
            address assigned = legacyIdAccount[record.userId];
            if (assigned != address(0) && assigned != record.account) {
                revert LegacyUserIdAlreadyAssigned();
            }
            if (previousId != 0 && previousId != record.userId) {
                delete legacyIdAccount[previousId];
            }
            if (previousId == 0) legacyIdentityCount += 1;
            legacyUserId[record.account] = record.userId;
            legacyIdAccount[record.userId] = record.account;
            emit LegacyIdentityBackfilled(record.account, record.userId);
        }
    }

    /// @notice Records reconstructed previous-platform Global Pool income for
    /// display. It deliberately does not increase withdrawable or globalIncome.
    function backfillLegacyGlobalIncome(LegacyGlobalIncomeRecord[] calldata records) external onlyOwner {
        if (legacyGlobalIncomeFinalized) revert MigrationClosed();
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            LegacyGlobalIncomeRecord calldata record = records[i];
            if (record.account == address(0)) revert ZeroAddress();
            if (!members[record.account].joined) revert NotJoined();

            legacyGlobalIncomeTotal =
                legacyGlobalIncomeTotal - legacyGlobalIncome[record.account] + record.amount;
            legacyGlobalIncome[record.account] = record.amount;
            emit LegacyGlobalIncomeBackfilled(record.account, record.amount);
        }
    }

    function finalizeLegacyIdentities() external onlyOwner {
        if (legacyIdentityFinalized) revert MigrationClosed();
        legacyIdentityFinalized = true;
        emit LegacyIdentityFinalized(legacyIdentityCount);
    }

    function finalizeLegacyGlobalIncome() external onlyOwner {
        if (legacyGlobalIncomeFinalized) revert MigrationClosed();
        legacyGlobalIncomeFinalized = true;
        emit LegacyGlobalIncomeFinalized(legacyGlobalIncomeTotal);
    }
}
