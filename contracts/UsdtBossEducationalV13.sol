// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV6} from "./UsdtBossEducationalV6.sol";

/// @notice One-time correction for the five verified historical Level-2
/// Global Pool members activated at live Level 1 by V12.
/// @dev V7-V12 added no storage. This state-only correction records their
/// already-completed historical Level 1 without issuing retroactive income,
/// moving tokens, or filling another member's live cycle.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV13 is UsdtBossEducationalV6 {
    error LegacyLevelOneCompletionUnavailable(address account);

    event LegacyGlobalLevelOneCompleted(
        address indexed account,
        uint8 stageAFilled,
        uint8 stageBFilled,
        uint8 liveLevel
    );

    function version() external pure override returns (uint256) {
        return 13;
    }

    function completeApprovedLegacyGlobalLevelOne() external onlyOwner nonReentrant {
        address[5] memory accounts = [
            address(0x4de3bdF7fAE0E6b65080d03D615e389109Beaf0b),
            address(0xe2054Ed8e010618501838d6116BfdCDC4955CfdA),
            address(0x3476BA0F301301C6E430C7d51742Dc326ecF9310),
            address(0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18),
            address(0x8f43A3b2cF8eE64Cb1A2F81E37DeC53c231cbE9D)
        ];

        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            GlobalMember storage global = globalMembers[account];
            if (
                !members[account].joined
                    || !global.joined
                    || global.highestLevel != 1
                    || legacyGlobalLevel[account] != 2
                    || gpFilledA[1][account] != 0
                    || gpFilledB[1][account] != 0
                    || globalIncome[account] != 0
            ) revert LegacyLevelOneCompletionUnavailable(account);
        }

        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            gpFilledA[1][account] = 2;
            gpFilledB[1][account] = 5;
            globalMembers[account].highestLevel = 2;
            _gpQueueA[2].accounts.push(account);
            emit LegacyGlobalLevelOneCompleted(account, 2, 5, 2);
        }
    }

    function globalQueueAccountA(uint8 level, uint256 index) external view returns (address) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts[index];
    }
}
