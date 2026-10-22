// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV6} from "./UsdtBossEducationalV6.sol";

/// @notice One-address correction for a migrated member whose confirmed level
/// should be Slot 3. This creates no placement, cycle fill, income or transfer.
/// @dev Adds no storage and remains layout-compatible with V6.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV7 is UsdtBossEducationalV6 {
    address public constant SLOT_3_CORRECTION_ACCOUNT =
        0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18;

    error SlotCorrectionUnavailable();

    event MigratedMemberSlotCorrected(
        address indexed account,
        uint8 previousSlot,
        uint8 correctedSlot,
        uint256 activatedAmount
    );

    function version() external pure virtual override returns (uint256) {
        return 7;
    }

    /// @notice Applies the approved state-only correction exactly once.
    function correctMigratedMemberToSlot3() external onlyOwner {
        address account = SLOT_3_CORRECTION_ACCOUNT;
        Member storage member = members[account];
        if (!member.joined || !wasMigrated[account] || member.highestSlot != 2) {
            revert SlotCorrectionUnavailable();
        }

        member.highestSlot = 3;
        uint256 amount = slotPrice(3);
        activatedAmount[account] = amount;
        _queues[3].accounts.push(account);

        // A zero parent explicitly records a state-only migration correction,
        // not a paid matrix placement.
        emit SlotActivated(account, 3, address(0));
        emit MigratedMemberSlotCorrected(account, 2, 3, amount);
    }
}
