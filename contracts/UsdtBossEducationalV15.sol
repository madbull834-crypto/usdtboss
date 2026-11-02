// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV14} from "./UsdtBossEducationalV14.sol";

/// @notice Routes a Slot-N activation to the Nth upline, then continues up
/// the sponsor chain until an active parent with an open position is found.
/// The bootstrap account is the terminal fallback.
/// @dev Adds no storage and is layout-compatible with V14.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV15 is UsdtBossEducationalV14 {
    function version() external pure override returns (uint256) {
        return 15;
    }

    /// @notice Returns the wallet that would receive `account`'s activation
    /// at `slot` under the V15 Nth-upline routing rules.
    function upgradeRecipient(address account, uint8 slot) external view returns (address) {
        if (slot == 0 || slot > MAX_SLOT) revert InvalidSlot();
        if (!members[account].joined) revert NotJoined();
        return _matrixParentForActivation(account, slot);
    }

    function _matrixParentForActivation(address account, uint8 slot)
        internal
        view
        override
        returns (address)
    {
        address candidate = account;

        // Slot 1 starts at the first upline, Slot 2 at the second, etc.
        for (uint8 depth; depth < slot; ++depth) {
            candidate = members[candidate].sponsor;
            if (candidate == address(0)) return bootstrapAccount;
        }

        while (candidate != address(0)) {
            if (candidate == bootstrapAccount) return bootstrapAccount;
            if (
                members[candidate].highestSlot >= slot
                    && childrenFilled[slot][candidate] < 3
            ) {
                return candidate;
            }
            candidate = members[candidate].sponsor;
        }

        return bootstrapAccount;
    }

    function _prepareMatrixParent(address parent, uint8 slot) internal override {
        // The root is the mandatory terminal receiver. Re-open its completed
        // three-fill counter so later fallback payments cannot become stuck.
        if (parent == bootstrapAccount && childrenFilled[slot][parent] == 3) {
            childrenFilled[slot][parent] = 0;
        }
    }
}
