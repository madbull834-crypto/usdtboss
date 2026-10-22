// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdtBossEducationalV4} from "./UsdtBossEducationalV4.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Preserves V5's two display-only growth trees and adds an explicit
/// owner-controlled withdrawal for payment tokens held by the proxy.
/// @dev The V5 storage declarations are repeated unchanged because V5's
/// version function was not virtual. No storage is added after the V5 layout.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract UsdtBossEducationalV6 is UsdtBossEducationalV4 {
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

    struct LegacyGrowthImport {
        uint8 tree;
        uint32 sourceId;
        address account;
        address parent;
        uint32 generationId;
        uint32 position;
        uint8 level;
        uint256 position1Income;
        uint256 position2Income;
    }

    mapping(uint8 => mapping(address => LegacyGrowthRecord)) public legacyGrowth;
    mapping(uint8 => uint256) public legacyGrowthCount;
    mapping(uint8 => bool) public legacyGrowthFinalized;
    mapping(uint8 => mapping(address => address[])) internal _legacyGrowthChildren;

    error InvalidGrowthTree();
    error InvalidGrowthPosition();
    error InvalidGrowthParent();
    error LegacyGrowthAlreadyImported();
    error ZeroWithdrawalAmount();
    error InsufficientPoolBalance(uint256 available, uint256 requested);

    event LegacyGrowthBackfilled(
        uint8 indexed tree,
        address indexed account,
        address indexed parent,
        uint8 level,
        uint32 position
    );
    event LegacyGrowthFinalized(uint8 indexed tree, uint256 count);
    event PoolFundsWithdrawn(
        address indexed owner,
        address indexed recipient,
        uint256 amount
    );

    function version() external pure virtual override returns (uint256) {
        return 6;
    }

    function backfillLegacyGrowth(LegacyGrowthImport[] calldata records) external onlyOwner {
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            LegacyGrowthImport calldata record = records[i];
            if (record.tree == 0 || record.tree > 2) revert InvalidGrowthTree();
            if (legacyGrowthFinalized[record.tree]) revert MigrationClosed();
            if (record.account == address(0)) revert ZeroAddress();
            if (!members[record.account].joined) revert NotJoined();
            if (record.level == 0) revert InvalidSlot();

            uint32 width = record.tree == 1 ? 2 : 5;
            uint8 maxLevel = record.tree == 1 ? 32 : 14;
            if (record.level > maxLevel) revert InvalidSlot();
            uint32 positionsAtLevel = 1;
            for (uint8 level = 1; level < record.level; ++level) positionsAtLevel *= width;
            if (record.position == 0 || record.position > positionsAtLevel) {
                revert InvalidGrowthPosition();
            }
            if (record.level == 1) {
                if (record.parent != address(0)) revert InvalidGrowthParent();
            } else if (record.parent == address(0) || !members[record.parent].joined) {
                revert InvalidGrowthParent();
            }

            LegacyGrowthRecord storage stored = legacyGrowth[record.tree][record.account];
            if (stored.imported) revert LegacyGrowthAlreadyImported();
            legacyGrowthCount[record.tree] += 1;
            if (record.parent != address(0)) {
                _legacyGrowthChildren[record.tree][record.parent].push(record.account);
            }
            stored.parent = record.parent;
            stored.sourceId = record.sourceId;
            stored.generationId = record.generationId;
            stored.position = record.position;
            stored.level = record.level;
            stored.imported = true;
            stored.position1Income = record.position1Income;
            stored.position2Income = record.position2Income;

            emit LegacyGrowthBackfilled(
                record.tree, record.account, record.parent, record.level, record.position
            );
        }
    }

    function legacyGrowthChildrenLength(uint8 tree, address account) external view returns (uint256) {
        if (tree == 0 || tree > 2) revert InvalidGrowthTree();
        return _legacyGrowthChildren[tree][account].length;
    }

    function legacyGrowthChild(uint8 tree, address account, uint256 index) external view returns (address) {
        if (tree == 0 || tree > 2) revert InvalidGrowthTree();
        return _legacyGrowthChildren[tree][account][index];
    }

    function finalizeLegacyGrowth(uint8 tree) external onlyOwner {
        if (tree == 0 || tree > 2) revert InvalidGrowthTree();
        if (legacyGrowthFinalized[tree]) revert MigrationClosed();
        legacyGrowthFinalized[tree] = true;
        emit LegacyGrowthFinalized(tree, legacyGrowthCount[tree]);
    }

    function poolBalance() public view returns (uint256) {
        return IERC20Balance(address(paymentToken)).balanceOf(address(this));
    }

    /// @dev This does not distinguish excess tokens from reserved plan funds.
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
}
