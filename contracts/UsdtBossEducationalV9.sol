// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV7} from "./UsdtBossEducationalV7.sol";

/// @notice One-time, state-only Matrix registration for five approved wallets.
/// Each wallet receives an active Slot-1 earning position without recording a
/// payment, filling an upline matrix cycle, or moving payment tokens.
/// @dev V8 added no storage. Inheriting V7 deliberately omits V8's already-used
/// migration entry point while remaining storage-layout compatible with V8.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV9 is UsdtBossEducationalV7 {
    address public constant APPROVED_MATRIX_SPONSOR =
        0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759;

    error ApprovedMatrixRegistrationUnavailable(address account);

    event ApprovedMatrixMemberRegistered(
        address indexed account,
        address indexed sponsor,
        uint8 slot,
        uint256 activatedAmount
    );

    function version() external pure override returns (uint256) {
        return 9;
    }

    /// @notice Registers only the five approved wallets under the fixed
    /// sponsor and activates Slot 1 without collecting the normal entry fee.
    /// The state-only registration deliberately creates no matrix parent,
    /// cycle fill, income, or payment-token movement.
    function registerApprovedMatrixMembers() external onlyOwner nonReentrant {
        address[5] memory accounts = [
            address(0x940F87CD3b50C280B5AE42E97c62950C5C658F6b),
            address(0xaDFCd5780A96Ca8a9f543674A40753438E825965),
            address(0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C),
            address(0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6),
            address(0x11AD0bC070fBEE83622a86a5780b3948bB7059F4)
        ];

        Member storage sponsor = members[APPROVED_MATRIX_SPONSOR];
        if (!sponsor.joined) {
            revert ApprovedMatrixRegistrationUnavailable(APPROVED_MATRIX_SPONSOR);
        }
        for (uint256 i; i < accounts.length; ++i) {
            if (members[accounts[i]].joined) {
                revert ApprovedMatrixRegistrationUnavailable(accounts[i]);
            }
        }

        uint256 amount = slotPrice(1);
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            members[account] = Member(true, APPROVED_MATRIX_SPONSOR, 0, 1, 0);
            sponsor.directCount += 1;
            activatedAmount[account] = amount;
            _queues[1].accounts.push(account);

            emit Joined(account, APPROVED_MATRIX_SPONSOR);
            emit SlotActivated(account, 1, address(0));
            emit ApprovedMatrixMemberRegistered(
                account, APPROVED_MATRIX_SPONSOR, 1, amount
            );
        }
    }
}
