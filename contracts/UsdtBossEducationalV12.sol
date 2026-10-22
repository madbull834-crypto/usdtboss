// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV6} from "./UsdtBossEducationalV6.sol";

/// @notice Activates imported previous-platform Global Pool members in the
/// live Level-1 queue without collecting another entry payment.
/// @dev This is a state-only migration. It deliberately creates no Stage-A
/// fill, cycle income, token liability, or payment-token movement.
/// V7-V11 added no storage, so inheriting V6 preserves the exact live V11
/// storage layout while omitting already-consumed one-time migration methods.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV12 is UsdtBossEducationalV6 {
    uint256 private constant MAX_LEGACY_ACTIVATION_BATCH = 100;
    uint256 private constant MAX_SPONSOR_HOPS_V12 = 256;

    error LegacyGlobalActivationUnavailable(address account);

    event LegacyGlobalPoolMemberActivated(
        address indexed account,
        address indexed sponsor,
        uint8 liveLevel,
        uint8 historicalLevel
    );

    function version() external pure override returns (uint256) {
        return 12;
    }

    /// @notice Gives verified historical Global Pool members a clean live
    /// Level-1 position without charging the 20-USDT entry again.
    /// @dev Historical levels are retained in `legacyGlobalLevel` for display;
    /// every newly activated live position starts at Level 1 because no prior
    /// live cycle reserves exist to fund a higher level.
    function activateLegacyGlobalPoolMembers(address[] calldata accounts)
        external
        onlyOwner
        nonReentrant
    {
        if (!legacyGlobalFinalized) revert MigrationStillOpen();
        if (accounts.length == 0 || accounts.length > MAX_LEGACY_ACTIVATION_BATCH) {
            revert BatchTooLarge();
        }

        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            if (
                account == address(0)
                    || !members[account].joined
                    || legacyGlobalLevel[account] == 0
                    || globalMembers[account].joined
            ) revert LegacyGlobalActivationUnavailable(account);

            address sponsor = _nearestLiveGlobalSponsor(account);
            uint8 historicalLevel = legacyGlobalLevel[account];

            globalMembers[account] = GlobalMember(true, 1);
            _gpQueueA[1].accounts.push(account);

            emit GlobalPoolJoined(account, sponsor);
            emit LegacyGlobalPoolMemberActivated(account, sponsor, 1, historicalLevel);
        }
    }

    /// @notice Auditable access to live Global Pool Stage-A queue positions.
    function globalQueueAccountA(uint8 level, uint256 index) external view returns (address) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts[index];
    }

    function _nearestLiveGlobalSponsor(address account) private view returns (address) {
        address candidate = members[account].sponsor;
        for (uint256 hops; candidate != address(0) && hops < MAX_SPONSOR_HOPS_V12; ++hops) {
            if (globalMembers[candidate].joined) return candidate;
            candidate = members[candidate].sponsor;
        }
        return bootstrapAccount;
    }
}
