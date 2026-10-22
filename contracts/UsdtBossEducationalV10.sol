// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV4} from "./UsdtBossEducationalV4.sol";

interface IERC20BalanceV10 {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice One-time correction that moves one approved migrated identity to
/// its replacement wallet without changing package value, income totals,
/// queue order, cycle state, or payment-token balances.
/// @dev Adds no storage and remains layout-compatible with V9 because V7-V9
/// added no storage. Already-consumed V7-V9 migration functions are omitted.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV10 is UsdtBossEducationalV4 {
    // Repeated exactly from V6. V7-V9 added no storage.
    struct LegacyGrowthRecord {
        address parent;
        uint32 sourceId;
        uint32 generationId;
        uint32 position;
        uint8 level;
        bool imported;
        uint256 position1Income;
        uint256 position2Income;
    }

    mapping(uint8 => mapping(address => LegacyGrowthRecord)) public legacyGrowth;
    mapping(uint8 => uint256) public legacyGrowthCount;
    mapping(uint8 => bool) public legacyGrowthFinalized;
    mapping(uint8 => mapping(address => address[])) internal _legacyGrowthChildren;

    address public constant SOURCE_ACCOUNT =
        0x8451866ccC54ABc2f49D1e2bb2041C46035FE8f6;
    address public constant REPLACEMENT_ACCOUNT =
        0xaF9168210B45EB0F660dEF7D08cA0BA7E2272BEf;
    address public constant EXPECTED_SPONSOR =
        0xe2054Ed8e010618501838d6116BfdCDC4955CfdA;
    uint256 public constant EXPECTED_USER_ID = 139875;

    error AccountAddressMigrationUnavailable();
    error InvalidGrowthTree();
    error ZeroWithdrawalAmount();
    error InsufficientPoolBalance(uint256 available, uint256 requested);

    event AccountAddressMigrated(
        address indexed previousAccount,
        address indexed replacementAccount,
        uint256 indexed userId
    );
    event PoolFundsWithdrawn(
        address indexed owner,
        address indexed recipient,
        uint256 amount
    );

    function version() external pure override returns (uint256) {
        return 10;
    }

    function legacyGrowthChildrenLength(uint8 tree, address account) external view returns (uint256) {
        if (tree == 0 || tree > 2) revert InvalidGrowthTree();
        return _legacyGrowthChildren[tree][account].length;
    }

    function legacyGrowthChild(uint8 tree, address account, uint256 index) external view returns (address) {
        if (tree == 0 || tree > 2) revert InvalidGrowthTree();
        return _legacyGrowthChildren[tree][account][index];
    }

    function poolBalance() public view returns (uint256) {
        return IERC20BalanceV10(address(paymentToken)).balanceOf(address(this));
    }

    function withdrawPoolFunds(address recipient, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroWithdrawalAmount();
        uint256 available = poolBalance();
        if (amount > available) revert InsufficientPoolBalance(available, amount);
        (bool ok, bytes memory data) = address(paymentToken).call(
            abi.encodeCall(paymentToken.transfer, (recipient, amount))
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
        emit PoolFundsWithdrawn(msg.sender, recipient, amount);
    }

    function migrateApprovedAccountAddress() external onlyOwner nonReentrant {
        address source = SOURCE_ACCOUNT;
        address replacement = REPLACEMENT_ACCOUNT;
        Member memory sourceMember = members[source];

        if (
            !sourceMember.joined
                || sourceMember.sponsor != EXPECTED_SPONSOR
                || sourceMember.directCount != 4
                || sourceMember.highestSlot != 2
                || sourceMember.withdrawable != 0
                || activatedAmount[source] != slotPrice(2)
                || !wasMigrated[source]
                || legacyUserId[source] != EXPECTED_USER_ID
                || legacyIdAccount[EXPECTED_USER_ID] != source
                || legacyIncome[source] != 57 * paymentTokenUnit()
                || legacyGlobalLevel[source] != 1
                || globalMembers[source].joined
                || members[replacement].joined
                || legacyUserId[replacement] != 0
                || legacyIdAccount[EXPECTED_USER_ID] == replacement
        ) revert AccountAddressMigrationUnavailable();

        _validateEmptyLiveState(source, replacement);

        address[4] memory directs = [
            address(0x24D9DBa9ab961d258545F01650D02f71549032a8),
            address(0x666fD2C19Dd6F0de63e75Cd17aA5310e2AC299b0),
            address(0x7B88734fe780bF583eFD60D662de1D67cad4d373),
            address(0x3F3a42dc8288B5a80aAaF1e1386993074be79522)
        ];
        for (uint256 i; i < directs.length; ++i) {
            if (!members[directs[i]].joined || members[directs[i]].sponsor != source) {
                revert AccountAddressMigrationUnavailable();
            }
        }

        members[replacement] = sourceMember;
        activatedAmount[replacement] = activatedAmount[source];
        wasMigrated[replacement] = wasMigrated[source];
        legacyIncome[replacement] = legacyIncome[source];
        legacyGlobalLevel[replacement] = legacyGlobalLevel[source];
        legacyGlobalIncome[replacement] = legacyGlobalIncome[source];
        legacyUserId[replacement] = EXPECTED_USER_ID;
        legacyIdAccount[EXPECTED_USER_ID] = replacement;

        for (uint256 i; i < directs.length; ++i) {
            members[directs[i]].sponsor = replacement;
        }

        uint256 queueReplacements;
        for (uint8 slot = 1; slot <= MAX_SLOT; ++slot) {
            address[] storage accounts = _queues[slot].accounts;
            for (uint256 i; i < accounts.length; ++i) {
                if (accounts[i] == source) {
                    accounts[i] = replacement;
                    queueReplacements += 1;
                }
            }
        }
        if (queueReplacements != 2) revert AccountAddressMigrationUnavailable();

        _moveGrowthRecord(1, source, replacement);
        _moveGrowthRecord(2, source, replacement);

        delete members[source];
        delete activatedAmount[source];
        delete wasMigrated[source];
        delete legacyIncome[source];
        delete legacyGlobalLevel[source];
        delete legacyGlobalIncome[source];
        delete legacyUserId[source];

        emit AccountAddressMigrated(source, replacement, EXPECTED_USER_ID);
    }

    function _validateEmptyLiveState(address source, address replacement) private view {
        if (
            matrixIncome[source] != 0
                || globalIncome[source] != 0
                || upgradeSavings[source] != 0
                || legacyGlobalIncome[source] != 0
                || globalMembers[replacement].joined
                || activatedAmount[replacement] != 0
                || wasMigrated[replacement]
                || matrixIncome[replacement] != 0
                || globalIncome[replacement] != 0
                || legacyIncome[replacement] != 0
                || legacyGlobalLevel[replacement] != 0
                || legacyGlobalIncome[replacement] != 0
        ) revert AccountAddressMigrationUnavailable();

        for (uint8 slot = 1; slot <= MAX_SLOT; ++slot) {
            if (
                matrixParent[slot][source] != address(0)
                    || childrenFilled[slot][source] != 0
                    || cycleGross[slot][source] != 0
                    || cycleAdvance[slot][source] != 0
                    || matrixParent[slot][replacement] != address(0)
                    || childrenFilled[slot][replacement] != 0
                    || cycleGross[slot][replacement] != 0
                    || cycleAdvance[slot][replacement] != 0
            ) revert AccountAddressMigrationUnavailable();
        }
        for (uint8 level = 1; level <= GP_MAX_LEVEL; ++level) {
            if (
                gpFilledA[level][source] != 0
                    || gpFilledB[level][source] != 0
                    || gpFilledA[level][replacement] != 0
                    || gpFilledB[level][replacement] != 0
            ) revert AccountAddressMigrationUnavailable();
        }
    }

    function _moveGrowthRecord(uint8 tree, address source, address replacement) private {
        LegacyGrowthRecord storage sourceRecord = legacyGrowth[tree][source];
        if (!sourceRecord.imported || legacyGrowth[tree][replacement].imported) {
            revert AccountAddressMigrationUnavailable();
        }

        address parent = sourceRecord.parent;
        if (parent != address(0)) {
            address[] storage siblings = _legacyGrowthChildren[tree][parent];
            bool replaced;
            for (uint256 i; i < siblings.length; ++i) {
                if (siblings[i] == source) {
                    siblings[i] = replacement;
                    replaced = true;
                }
            }
            if (!replaced) revert AccountAddressMigrationUnavailable();
        }

        legacyGrowth[tree][replacement] = sourceRecord;
        address[] storage children = _legacyGrowthChildren[tree][source];
        for (uint256 i; i < children.length; ++i) {
            address child = children[i];
            if (legacyGrowth[tree][child].parent != source) {
                revert AccountAddressMigrationUnavailable();
            }
            _legacyGrowthChildren[tree][replacement].push(child);
            legacyGrowth[tree][child].parent = replacement;
        }

        delete _legacyGrowthChildren[tree][source];
        delete legacyGrowth[tree][source];
    }
}
