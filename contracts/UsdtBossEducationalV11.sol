// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV6} from "./UsdtBossEducationalV6.sol";

/// @notice One-time, state-only Global Pool Level-1 activation for the five
/// approved wallets registered by V9.
/// @dev V7-V10 added no storage. Inheriting V6 therefore preserves the exact
/// live V10 storage layout while omitting already-consumed correction code.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV11 is UsdtBossEducationalV6 {
    address public constant GLOBAL_POOL_SPONSOR =
        0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759;

    error ApprovedGlobalPoolActivationUnavailable(address account);

    event ApprovedGlobalPoolMemberActivated(
        address indexed account,
        address indexed sponsor,
        uint8 level
    );

    function version() external pure override returns (uint256) {
        return 11;
    }

    function activateApprovedGlobalPoolMembers() external onlyOwner nonReentrant {
        address[5] memory accounts = [
            address(0x940F87CD3b50C280B5AE42E97c62950C5C658F6b),
            address(0xaDFCd5780A96Ca8a9f543674A40753438E825965),
            address(0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C),
            address(0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6),
            address(0x11AD0bC070fBEE83622a86a5780b3948bB7059F4)
        ];

        if (!globalMembers[GLOBAL_POOL_SPONSOR].joined) {
            revert ApprovedGlobalPoolActivationUnavailable(GLOBAL_POOL_SPONSOR);
        }

        for (uint256 i; i < accounts.length; ++i) {
            _validateApprovedAccount(accounts[i]);
        }
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            globalMembers[account] = GlobalMember(true, 1);
            _gpQueueA[1].accounts.push(account);
            emit GlobalPoolJoined(account, GLOBAL_POOL_SPONSOR);
            emit ApprovedGlobalPoolMemberActivated(account, GLOBAL_POOL_SPONSOR, 1);
        }
    }

    /// @notice Auditable access to Stage-A queue positions created by this migration.
    function globalQueueAccountA(uint8 level, uint256 index) external view returns (address) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts[index];
    }

    function _validateApprovedAccount(address account) private view {
        Member storage member = members[account];
        if (
            !member.joined
                || member.sponsor != GLOBAL_POOL_SPONSOR
                || member.highestSlot != 1
                || member.withdrawable != 0
                || activatedAmount[account] != slotPrice(1)
                || wasMigrated[account]
                || globalMembers[account].joined
                || matrixIncome[account] != 0
                || globalIncome[account] != 0
                || upgradeSavings[account] != 0
        ) revert ApprovedGlobalPoolActivationUnavailable(account);

        for (uint8 level = 1; level <= GP_MAX_LEVEL; ++level) {
            if (gpFilledA[level][account] != 0 || gpFilledB[level][account] != 0) {
                revert ApprovedGlobalPoolActivationUnavailable(account);
            }
        }
    }
}
