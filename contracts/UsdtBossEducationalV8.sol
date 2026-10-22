// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV7} from "./UsdtBossEducationalV7.sol";

/// @notice One-time, state-only Global Pool migration for six approved legacy
/// members. It creates Level-1 earning positions without treating the import
/// as a payment, filling an upline cycle, or moving payment tokens.
/// @dev Adds no storage and remains layout-compatible with V7.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV8 is UsdtBossEducationalV7 {
    address public constant GLOBAL_POOL_SPONSOR =
        0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759;

    error GlobalPoolMigrationUnavailable(address account);

    event GlobalPoolMemberMigrated(
        address indexed account,
        address indexed sponsor,
        uint8 level
    );

    function version() external pure override returns (uint256) {
        return 8;
    }

    /// @notice Imports the approved sponsor followed by its five approved
    /// members into the live Level-1 Stage-A queue. Existing registration and
    /// 30-USDT package state is left unchanged.
    function migrateApprovedGlobalPoolMembers() external onlyOwner nonReentrant {
        address[5] memory accounts = [
            address(0xB59717583D6401dB907E76A09026c6e586Af838c),
            address(0xaee81e154c995De728f4Eece7e8175aF6537A9A8),
            address(0x95b2015747AFBFAEC90A7a9A19B1729d94F0CDb6),
            address(0x693Ec52a03A0068204A819856028251759b5cFB1),
            address(0x49c9cFe47Cbc37388D772e7B155031D2dF21c228)
        ];

        if (!globalMembers[bootstrapAccount].joined) {
            revert GlobalPoolMigrationUnavailable(bootstrapAccount);
        }
        _validateGlobalPoolMigration(GLOBAL_POOL_SPONSOR);
        for (uint256 i; i < accounts.length; ++i) {
            _validateGlobalPoolMigration(accounts[i]);
        }

        _migrateGlobalPoolMember(GLOBAL_POOL_SPONSOR, bootstrapAccount);
        for (uint256 i; i < accounts.length; ++i) {
            _migrateGlobalPoolMember(accounts[i], GLOBAL_POOL_SPONSOR);
        }
    }

    /// @notice Auditable queue access for the state-only migration.
    function globalQueueAccountA(uint8 level, uint256 index) external view returns (address) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts[index];
    }

    function _validateGlobalPoolMigration(address account) private view {
        if (!members[account].joined || globalMembers[account].joined) {
            revert GlobalPoolMigrationUnavailable(account);
        }
    }

    function _migrateGlobalPoolMember(address account, address sponsor) private {
        globalMembers[account] = GlobalMember(true, 1);
        _gpQueueA[1].accounts.push(account);
        emit GlobalPoolJoined(account, sponsor);
        emit GlobalPoolMemberMigrated(account, sponsor, 1);
    }
}
