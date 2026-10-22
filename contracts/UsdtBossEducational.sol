// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface IERC20Minimal {
    function decimals() external view returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Implementation of the 12-slot 3x3
/// matrix AND the separate 6-level "Auto Global Pool" described in
/// "USDT BOSS-2.pdf". It is not an investment product.
/// @dev Amounts are expressed in the payment token's smallest units. Fresh
/// deployments read and persist the token's 6- or 18-decimal unit.
///
/// The PDF underspecifies the Global Pool's real placement/crediting rules
/// (see PDF_REQUIREMENTS.md). The implementation below is a documented
/// interpretation, not a literal transcription: each member's Global Pool
/// position advances through two forced-matrix stages per level -- a
/// 2-wide "Stage A" priced at that level's entry, whose two payments exactly
/// fund the member's promotion into a 5-wide "Stage B" priced at 2x entry.
/// Stage B's gross (10x entry) is then split into a 6x-entry reserve that
/// pays for automatic entry into the next level (matching the PDF's
/// entry(level+1) = 6x entry(level) pattern) and a 4x-entry distributable
/// balance, matching the PDF's printed Income figures for levels 1-5.
/// Level 6 has no next level, so its full 10x-entry gross is distributable.
/// That also reconciles page 13's "Total Income = $1,679,600", which had
/// looked like an error: it is the lifetime cumulative figure, i.e. 4x entry
/// earned at levels 1-5 ($124,400) plus level 6's $1,555,200 gross. This
/// model reproduces it exactly.
contract UsdtBossEducational is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // Unstructured storage avoids shifting fields appended by V3/V5. Existing
    // testnet proxies have zero in this slot and therefore retain the legacy
    // six-decimal behavior; new deployments persist the real token unit.
    bytes32 private constant PAYMENT_TOKEN_UNIT_SLOT =
        keccak256("usdtboss.storage.payment-token-unit.v1");
    uint8 public constant MAX_SLOT = 12;
    uint8 public constant GP_MAX_LEVEL = 6;
    uint16 public constant FEE_BPS = 1_000;
    /// @notice Admin charges start once a member reaches this slot, OR once
    /// they reach FEE_DIRECT_THRESHOLD directs, whichever happens first.
    uint8 public constant FEE_SLOT_THRESHOLD = 5;
    /// @notice Direct referrals at or above which admin charges apply, even
    /// while the member is still below FEE_SLOT_THRESHOLD.
    uint32 public constant FEE_DIRECT_THRESHOLD = 4;
    uint16 private constant BPS = 10_000;
    /// @dev Upper bound on members visited when searching a sponsor's
    /// downline for an open matrix position, and on sponsor-chain hops.
    uint256 private constant MAX_PLACEMENT_SCAN = 1_000;
    uint256 private constant MAX_SPONSOR_HOPS = 256;

    IERC20Minimal public paymentToken;
    address public treasury;
    address public bootstrapAccount;

    struct Member {
        bool joined;
        address sponsor;
        uint32 directCount;
        uint8 highestSlot;
        /// @dev Retained for storage compatibility and for earnings accrued by
        /// older implementations. New earnings are transferred immediately.
        uint256 withdrawable;
    }

    struct SlotQueue {
        uint256 cursor;
        address[] accounts;
    }

    struct GlobalMember {
        bool joined;
        uint8 highestLevel;
    }

    mapping(address => Member) public members;
    // Internal so a storage-compatible implementation upgrade can perform a
    // narrowly scoped migration correction without fabricating a live matrix
    // placement or payment.
    mapping(uint8 => SlotQueue) internal _queues;
    mapping(uint8 => mapping(address => uint8)) public childrenFilled;
    mapping(uint8 => mapping(address => uint256)) public cycleGross;

    mapping(address => GlobalMember) public globalMembers;
    // Internal so a storage-compatible implementation upgrade can perform a
    // narrowly scoped Global Pool migration without reconstructing queue
    // storage through raw slots. Visibility does not change storage layout.
    mapping(uint8 => SlotQueue) internal _gpQueueA;
    mapping(uint8 => SlotQueue) internal _gpQueueB;
    mapping(uint8 => mapping(address => uint8)) public gpFilledA;
    mapping(uint8 => mapping(address => uint8)) public gpFilledB;

    uint256 private _locked;

    /// @notice Price of the member's currently activated matrix level. For
    /// migrated accounts this is the spreadsheet's `amount`, converted to the
    /// payment token's smallest unit.
    mapping(address => uint256) public activatedAmount;
    mapping(address => bool) public wasMigrated;
    bool public migrationFinalized;

    // ---- Sponsor placement (appended storage; keep after all fields above) ----

    /// @notice The member whose position `member` fills in `slot`. Zero for
    /// migrated members, which were imported without a matrix placement.
    mapping(uint8 => mapping(address => address)) public matrixParent;
    mapping(uint8 => mapping(address => address[])) private _matrixChildren;
    /// @notice Lifetime income paid to a member by each plan, net of fees.
    mapping(address => uint256) public matrixIncome;
    mapping(address => uint256) public globalIncome;

    // ---- Legacy import (appended storage; keep after all fields above) ----

    /// @notice Income a member earned on the previous, off-chain platform,
    /// imported for display only. That platform paid level-based referral
    /// commission, which is a different mechanism from this contract's
    /// three-payment cycle, so it is deliberately NOT added to matrixIncome
    /// and NOT added to withdrawable: no token liability is created here and
    /// none of it is claimable through withdraw().
    mapping(address => uint256) public legacyIncome;
    /// @notice Sum of every legacyIncome entry written, for reconciliation.
    uint256 public legacyIncomeTotal;
    /// @notice Permanently ends legacy imports once the numbers are verified.
    bool public legacyBackfillFinalized;

    /// @notice Global Pool level a member held on the previous platform,
    /// imported for display only. Those entry fees were paid to the old
    /// system, not to this contract, so this deliberately does NOT enrol the
    /// member in globalMembers and creates no queue position: it records
    /// history without promising a payout this contract cannot fund.
    mapping(address => uint8) public legacyGlobalLevel;
    /// @notice How many accounts carry a legacyGlobalLevel, for reconciliation.
    uint256 public legacyGlobalCount;
    bool public legacyGlobalFinalized;

    /// @notice Upgrade money a member has banked but not yet spent. A cycle
    /// always reserves two thirds of its gross toward the next slot. When the
    /// completing slot IS the member's current slot that covers the next slot
    /// exactly, so nothing accumulates. Members imported above slot 1 complete
    /// lower cycles whose two thirds falls short of their next slot, and the
    /// remainder waits here instead of being paid out as income.
    mapping(address => uint256) public upgradeSavings;

    /// @notice Income already advanced to a member for the cycle currently
    /// open at this slot. The first payment into a position pays out at once
    /// instead of waiting for the third, so the cycle settles the remainder
    /// only. A cycle's gross can fund exactly one slot-price payout after the
    /// upgrade reserve, so advancing it here means nothing is left to pay at
    /// completion; the member is paid the same total, earlier.
    mapping(uint8 => mapping(address => uint256)) public cycleAdvance;

    struct MigrationRecord {
        address account;
        address sponsor;
        uint8 level;
        uint256 amount;
    }

    struct LegacyIncomeRecord {
        address account;
        uint256 amount;
    }

    struct LegacyGlobalRecord {
        address account;
        uint8 level;
    }

    error MainnetNotAllowed(uint256 chainId);
    error InvalidPaymentToken();
    error UnsupportedTokenDecimals(uint8 decimals);
    error ZeroAddress();
    error AlreadyJoined();
    error SponsorNotJoined();
    error NotJoined();
    error NothingToWithdraw();
    error TokenTransferFailed();
    error InvalidSlot();
    error MigrationClosed();
    error MigrationStillOpen();
    error InvalidMigrationAmount();
    error BatchTooLarge();

    event Joined(address indexed member, address indexed sponsor);
    event SlotActivated(address indexed member, uint8 indexed slot, address indexed parent);
    event CycleCompleted(
        address indexed member,
        uint8 indexed slot,
        uint256 gross,
        uint256 upgradeReserved,
        uint256 adminFee,
        uint256 credited
    );
    event Withdrawn(address indexed member, uint256 amount);
    event GlobalPoolJoined(address indexed member, address indexed sponsor);
    event GlobalStageAFilled(address indexed member, uint8 indexed level, address indexed parent);
    event GlobalStageBFilled(address indexed member, uint8 indexed level, address indexed parent);
    event GlobalCycleCompleted(
        address indexed member,
        uint8 indexed level,
        uint256 gross,
        uint256 nextLevelReserved,
        uint256 adminFee,
        uint256 credited
    );
    event MemberMigrated(
        address indexed member,
        address indexed sponsor,
        uint8 level,
        uint256 amount
    );
    event MigrationFinalized();
    event LegacyIncomeBackfilled(address indexed account, uint256 amount);
    event LegacyBackfillFinalized(uint256 total);
    event LegacyGlobalBackfilled(address indexed account, uint8 level);
    event LegacyGlobalFinalized(uint256 count);
    event UpgradeSavingsChanged(address indexed account, uint256 balance);
    event CycleAdvancePaid(address indexed account, uint8 indexed slot, uint256 credited, uint256 adminFee);
    event DirectCommissionPaid(address indexed sponsor, address indexed member, uint256 credited, uint256 adminFee);

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address token_, address treasury_, address bootstrap_, address owner_)
        external
        initializer
    {
        // Explicit allow-list: Hardhat, BSC mainnet/testnet, Sepolia, Polygon
        // Amoy and Base Sepolia.
        if (
            block.chainid != 31_337 && block.chainid != 11_155_111
                && block.chainid != 56 && block.chainid != 97 && block.chainid != 80_002
                && block.chainid != 84_532
        ) revert MainnetNotAllowed(block.chainid);
        if (token_ == address(0) || treasury_ == address(0) || bootstrap_ == address(0)) {
            revert ZeroAddress();
        }
        if (owner_ == address(0)) revert ZeroAddress();

        __Ownable_init(owner_);

        if (token_.code.length == 0) revert InvalidPaymentToken();
        uint8 tokenDecimals;
        try IERC20Minimal(token_).decimals() returns (uint8 value) {
            tokenDecimals = value;
        } catch {
            revert InvalidPaymentToken();
        }
        // The production token is 18 decimals and the existing mock is 6.
        // Keeping this narrow makes an accidental wrong-token deployment fail.
        if (tokenDecimals != 6 && tokenDecimals != 18) {
            revert UnsupportedTokenDecimals(tokenDecimals);
        }
        _setPaymentTokenUnit(10 ** tokenDecimals);
        paymentToken = IERC20Minimal(token_);
        treasury = treasury_;
        bootstrapAccount = bootstrap_;
        _locked = 1;
        members[bootstrap_] = Member(true, address(0), 0, MAX_SLOT, 0);
        activatedAmount[bootstrap_] = slotPrice(MAX_SLOT);
        globalMembers[bootstrap_] = GlobalMember(true, GP_MAX_LEVEL);

        // Seed every independent slot queue. The bootstrap account receives
        // the first cycle at each slot and prevents an empty-queue deadlock.
        for (uint8 slot = 1; slot <= MAX_SLOT; ++slot) {
            _queues[slot].accounts.push(bootstrap_);
        }

        // Same seeding for the Global Pool's two per-level queues.
        for (uint8 level = 1; level <= GP_MAX_LEVEL; ++level) {
            _gpQueueA[level].accounts.push(bootstrap_);
            _gpQueueB[level].accounts.push(bootstrap_);
        }
    }

    /// @notice Imports registration-only state from the legacy spreadsheet.
    /// Historical payments do not become withdrawable balances or current
    /// cycle progress because those tokens are not held by this contract.
    /// Imported accounts are appended to each queue up to `level` with a clean
    /// cycle, so they can participate in new activity after the cutover.
    function migrateMembers(MigrationRecord[] calldata records) external onlyOwner nonReentrant {
        if (migrationFinalized) revert MigrationClosed();
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            MigrationRecord calldata record = records[i];
            if (record.account == address(0) || record.sponsor == address(0)) revert ZeroAddress();
            if (members[record.account].joined) revert AlreadyJoined();
            if (!members[record.sponsor].joined) revert SponsorNotJoined();
            if (record.level == 0 || record.level > MAX_SLOT) revert InvalidSlot();
            if (record.amount != slotPrice(record.level)) revert InvalidMigrationAmount();

            members[record.account] = Member(true, record.sponsor, 0, record.level, 0);
            members[record.sponsor].directCount += 1;
            activatedAmount[record.account] = record.amount;
            wasMigrated[record.account] = true;

            // A registration snapshot cannot prove historical queue fills or
            // liabilities. Append eligible members without fabricating either.
            for (uint8 slot = 1; slot <= record.level; ++slot) {
                _queues[slot].accounts.push(record.account);
            }

            emit Joined(record.account, record.sponsor);
            emit MemberMigrated(record.account, record.sponsor, record.level, record.amount);
        }
    }

    /// @notice Imports prior-platform income totals for display. Writes only
    /// `legacyIncome`: queues, childrenFilled, cycleGross, matrixIncome and
    /// withdrawable are untouched, and no cycle is completed, so no payment is
    /// triggered and no token becomes claimable. Re-writing an account
    /// replaces its figure rather than accumulating, so a corrected batch can
    /// be re-sent safely.
    function backfillLegacyIncome(LegacyIncomeRecord[] calldata records) external onlyOwner {
        if (legacyBackfillFinalized) revert MigrationClosed();
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            LegacyIncomeRecord calldata record = records[i];
            if (record.account == address(0)) revert ZeroAddress();
            if (!members[record.account].joined) revert NotJoined();

            legacyIncomeTotal = legacyIncomeTotal - legacyIncome[record.account] + record.amount;
            legacyIncome[record.account] = record.amount;
            emit LegacyIncomeBackfilled(record.account, record.amount);
        }
    }

    /// @notice Imports prior-platform Global Pool standing for display. Writes
    /// only `legacyGlobalLevel`. It does not touch globalMembers, the Stage A
    /// or Stage B queues, gpFilledA/B or withdrawable, so no live pool position
    /// is created and nothing becomes claimable. Re-writing an account replaces
    /// its level rather than accumulating.
    function backfillLegacyGlobal(LegacyGlobalRecord[] calldata records) external onlyOwner {
        if (legacyGlobalFinalized) revert MigrationClosed();
        if (records.length > 50) revert BatchTooLarge();

        for (uint256 i; i < records.length; ++i) {
            LegacyGlobalRecord calldata record = records[i];
            if (record.account == address(0)) revert ZeroAddress();
            if (!members[record.account].joined) revert NotJoined();
            if (record.level == 0 || record.level > GP_MAX_LEVEL) revert InvalidSlot();

            if (legacyGlobalLevel[record.account] == 0) legacyGlobalCount += 1;
            legacyGlobalLevel[record.account] = record.level;
            emit LegacyGlobalBackfilled(record.account, record.level);
        }
    }

    /// @notice Permanently ends Global Pool history imports.
    function finalizeLegacyGlobal() external onlyOwner {
        if (legacyGlobalFinalized) revert MigrationClosed();
        legacyGlobalFinalized = true;
        emit LegacyGlobalFinalized(legacyGlobalCount);
    }

    /// @notice Permanently ends legacy income imports.
    function finalizeLegacyBackfill() external onlyOwner {
        if (legacyBackfillFinalized) revert MigrationClosed();
        legacyBackfillFinalized = true;
        emit LegacyBackfillFinalized(legacyIncomeTotal);
    }

    /// @notice Permanently ends privileged registration imports. Live joins
    /// remain disabled until this has been called.
    function finalizeMigration() external onlyOwner {
        if (migrationFinalized) revert MigrationClosed();
        migrationFinalized = true;
        emit MigrationFinalized();
    }

    /// @notice Buy the first (30-token) slot. Later slots are activated only
    /// by reserving two-thirds of a completed 3-payment cycle.
    function join(address sponsor) external nonReentrant {
        if (!migrationFinalized) revert MigrationStillOpen();
        if (members[msg.sender].joined) revert AlreadyJoined();
        if (!members[sponsor].joined) revert SponsorNotJoined();

        _safeTransferFrom(msg.sender, address(this), slotPrice(1));
        members[msg.sender].joined = true;
        members[msg.sender].sponsor = sponsor;
        members[sponsor].directCount += 1;
        emit Joined(msg.sender, sponsor);

        // A sponsor's first FEE_DIRECT_THRESHOLD - 1 directs run the matrix:
        // the joining fee funds a position and cycles normally. From the
        // threshold onward the fee is paid straight to the sponsor as direct
        // commission instead, so it cannot also fund a matrix position - the
        // member registers and holds their own earning position, but takes no
        // place in anyone else's cycle. Paying both would credit 57 out of a
        // 30 payment and leave a downline cycle underfunded.
        if (members[sponsor].directCount >= FEE_DIRECT_THRESHOLD) {
            _registerWithoutPlacement(msg.sender);
            uint256 amount = slotPrice(1);
            uint256 fee = (amount * FEE_BPS) / BPS;
            matrixIncome[sponsor] += amount - fee;
            _payNow(sponsor, amount - fee);
            _payNow(treasury, fee);
            emit DirectCommissionPaid(sponsor, msg.sender, amount - fee, fee);
        } else {
            _activateSlot(msg.sender, 1);
        }
    }

    /// @notice Join the separate 6-level Auto Global Pool at its level-1 entry
    /// price. Later levels are entered automatically, funded from completed
    /// Stage B cycles -- see the contract-level natspec for the interpretation.
    function joinGlobalPool(address sponsor) external nonReentrant {
        if (!migrationFinalized) revert MigrationStillOpen();
        if (globalMembers[msg.sender].joined) revert AlreadyJoined();
        if (!globalMembers[sponsor].joined) revert SponsorNotJoined();

        _safeTransferFrom(msg.sender, address(this), globalPoolEntry(1));
        globalMembers[msg.sender].joined = true;
        emit GlobalPoolJoined(msg.sender, sponsor);
        _activateStageA(msg.sender, 1);
    }

    /// @notice Withdraws earnings left by an implementation that pre-dates
    /// immediate payouts. New earnings are sent during the earning transaction.
    function withdraw() external nonReentrant {
        uint256 amount = members[msg.sender].withdrawable;
        if (amount == 0) revert NothingToWithdraw();
        members[msg.sender].withdrawable = 0;
        _safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function paymentTokenUnit() public view returns (uint256 unit) {
        bytes32 storageSlot = PAYMENT_TOKEN_UNIT_SLOT;
        assembly {
            unit := sload(storageSlot)
        }
        // Compatibility for proxies deployed before token-unit storage was
        // introduced. Their payment token was the six-decimal mock.
        if (unit == 0) return 1e6;
    }

    function slotPrice(uint8 slot) public view returns (uint256) {
        if (slot == 0 || slot > MAX_SLOT) revert InvalidSlot();
        return (30 * paymentTokenUnit()) << (slot - 1);
    }

    function queueLength(uint8 slot) external view returns (uint256) {
        if (slot == 0 || slot > MAX_SLOT) revert InvalidSlot();
        return _queues[slot].accounts.length;
    }

    function queueAccount(uint8 slot, uint256 index) external view returns (address) {
        if (slot == 0 || slot > MAX_SLOT) revert InvalidSlot();
        return _queues[slot].accounts[index];
    }

    /// @notice Members placed directly under `account` in `slot`, in position order.
    function matrixChildren(uint8 slot, address account) external view returns (address[] memory) {
        if (slot == 0 || slot > MAX_SLOT) revert InvalidSlot();
        return _matrixChildren[slot][account];
    }

    /// @notice Level-1 entry price for the Global Pool; later levels are 6x
    /// the previous one, matching the PDF's per-level entry progression.
    function globalPoolEntry(uint8 level) public view returns (uint256) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        uint256[6] memory entries = [uint256(20), 120, 720, 4_320, 25_920, 155_520];
        return entries[level - 1] * paymentTokenUnit();
    }

    function globalQueueLengthA(uint8 level) external view returns (uint256) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueA[level].accounts.length;
    }

    function globalQueueLengthB(uint8 level) external view returns (uint256) {
        if (level == 0 || level > GP_MAX_LEVEL) revert InvalidSlot();
        return _gpQueueB[level].accounts.length;
    }

    /// @notice Figures copied from PDF pages 8-13, exposed read-only. They all
    /// match the Global Pool's real cycle math: twoPayments is Stage B's price,
    /// fivePayments is Stage B's gross, and level 6's statedTotal is the PDF's
    /// lifetime cumulative income across all six levels.
    function globalPoolFigures(uint8 level)
        external
        view
        returns (uint256 entry, uint256 twoPayments, uint256 fivePayments, uint256 statedTotal)
    {
        if (level == 0 || level > 6) revert InvalidSlot();
        uint256[6] memory entries = [uint256(20), 120, 720, 4_320, 25_920, 155_520];
        entry = entries[level - 1] * paymentTokenUnit();
        twoPayments = entry * 2;
        fivePayments = entry * 2 * 5;
        statedTotal = level == 6 ? 1_679_600 * paymentTokenUnit() : twoPayments + fivePayments;
    }

    function _activateSlot(address account, uint8 slot) private {
        Member storage member = members[account];
        if (slot != member.highestSlot + 1) revert InvalidSlot();

        address parent = _openPosition(_placementAnchor(account, slot), slot);

        member.highestSlot = slot;
        activatedAmount[account] = slotPrice(slot);
        // The slot queue remains the registry of every member active in a slot.
        _queues[slot].accounts.push(account);
        matrixParent[slot][account] = parent;
        _matrixChildren[slot][parent].push(account);
        childrenFilled[slot][parent] += 1;
        cycleGross[slot][parent] += slotPrice(slot);
        emit SlotActivated(account, slot, parent);

        if (childrenFilled[slot][parent] == 1) {
            // First payment into this position is transferred to the holder.
            uint256 advance = slotPrice(slot);
            uint256 fee = _chargesFee(parent, slot) ? (advance * FEE_BPS) / BPS : 0;
            cycleAdvance[slot][parent] = advance;
            matrixIncome[parent] += advance - fee;
            _payNow(parent, advance - fee);
            _payNow(treasury, fee);
            emit CycleAdvancePaid(parent, slot, advance - fee, fee);
        }

        if (childrenFilled[slot][parent] == 3) {
            _completeCycle(parent, slot);
        }
    }

    /// @dev The member whose downline receives `account` in `slot`: its sponsor,
    /// or, when the sponsor has not activated that slot, the nearest sponsor-chain
    /// ancestor that has. The bootstrap account holds every slot.
    function _placementAnchor(address account, uint8 slot) private view returns (address) {
        address anchor = members[account].sponsor;
        for (uint256 hops; anchor != address(0) && hops < MAX_SPONSOR_HOPS; ++hops) {
            if (members[anchor].highestSlot >= slot) return anchor;
            anchor = members[anchor].sponsor;
        }
        return bootstrapAccount;
    }

    /// @dev First member with an open position in `anchor`'s `slot` downline,
    /// searched level by level, left to right (spillover). Falls back to the
    /// global join-order queue only if the search limit is reached.
    function _openPosition(address anchor, uint8 slot) private returns (address) {
        address[] memory pending = new address[](MAX_PLACEMENT_SCAN);
        pending[0] = anchor;
        uint256 head;
        uint256 tail = 1;
        while (head < tail) {
            address node = pending[head++];
            if (childrenFilled[slot][node] < 3) return node;
            address[] storage kids = _matrixChildren[slot][node];
            for (uint256 i; i < kids.length; ++i) {
                if (tail == MAX_PLACEMENT_SCAN) return _nextQueueParent(slot);
                pending[tail++] = kids[i];
            }
        }
        return _nextQueueParent(slot);
    }

    function _nextQueueParent(uint8 slot) private returns (address) {
        SlotQueue storage queue = _queues[slot];
        while (childrenFilled[slot][queue.accounts[queue.cursor]] == 3) {
            queue.cursor += 1;
        }
        return queue.accounts[queue.cursor];
    }

    /// @dev Registers a member at slot 1 without taking a matrix position.
    /// Their joining fee was paid out as direct commission, so it cannot fund
    /// a position too. They still hold their own slot-1 position, which their
    /// own directs fill - the same footing as an imported member.
    function _registerWithoutPlacement(address account) private {
        members[account].highestSlot = 1;
        activatedAmount[account] = slotPrice(1);
        _queues[1].accounts.push(account);
        emit SlotActivated(account, 1, address(0));
    }

    /// @dev Admin charges start at FEE_SLOT_THRESHOLD, or once a member holds
    /// FEE_DIRECT_THRESHOLD directs, whichever comes first.
    function _chargesFee(address account, uint8 slot) private view returns (bool) {
        return slot >= FEE_SLOT_THRESHOLD
            || members[account].directCount >= FEE_DIRECT_THRESHOLD;
    }

    function _completeCycle(address account, uint8 slot) private {
        uint256 gross = cycleGross[slot][account];
        cycleGross[slot][account] = 0;

        // Every cycle reserves two thirds of its gross for upgrades. For a
        // member sitting at the slot that just cycled, that is exactly the
        // next slot's price, so it buys it outright and banks nothing. For a
        // member imported above this slot it falls short, so it accumulates
        // until it can buy the next slot they do not own. Either way the money
        // stays inside the plan instead of paying out as income.
        uint256 upgradeReserved;
        if (members[account].highestSlot < MAX_SLOT) {
            upgradeReserved = (gross * 2) / 3;
            uint256 saved = upgradeSavings[account] + upgradeReserved;
            while (members[account].highestSlot < MAX_SLOT) {
                uint256 next = slotPrice(members[account].highestSlot + 1);
                if (saved < next) break;
                saved -= next;
                _activateSlot(account, members[account].highestSlot + 1);
            }
            upgradeSavings[account] = saved;
        }

        uint256 advanced = cycleAdvance[slot][account];
        cycleAdvance[slot][account] = 0;
        uint256 distributable = gross - upgradeReserved - advanced;
        // Two independent triggers, either of which turns admin charges on:
        // reaching FEE_SLOT_THRESHOLD, or reaching FEE_DIRECT_THRESHOLD
        // directs. Below both, the cycle is credited in full, which is what
        // keeps the opening slots (including the first 3x3) charge-free.
        uint256 adminFee = _chargesFee(account, slot) ? (distributable * FEE_BPS) / BPS : 0;
        uint256 credited = distributable - adminFee;
        matrixIncome[account] += credited;
        _payNow(account, credited);
        _payNow(treasury, adminFee);

        emit CycleCompleted(account, slot, gross, upgradeReserved, adminFee, credited);
        emit UpgradeSavingsChanged(account, upgradeSavings[account]);
    }

    /// @dev Places `account` as a new payer in level `level`'s 2-wide Stage A
    /// queue. When a parent's Stage A fills (2 payments = 2x entry), that
    /// exactly funds the parent's own promotion into Stage B.
    function _activateStageA(address account, uint8 level) private {
        if (level != globalMembers[account].highestLevel + 1) revert InvalidSlot();

        SlotQueue storage queue = _gpQueueA[level];
        while (gpFilledA[level][queue.accounts[queue.cursor]] == 2) {
            queue.cursor += 1;
        }
        address parent = queue.accounts[queue.cursor];

        globalMembers[account].highestLevel = level;
        queue.accounts.push(account);
        gpFilledA[level][parent] += 1;
        emit GlobalStageAFilled(account, level, parent);

        if (gpFilledA[level][parent] == 2) {
            _activateStageB(parent, level);
        }
    }

    /// @dev Places the just-promoted `account` in level `level`'s 5-wide
    /// Stage B queue. When a parent's Stage B fills (5 promotions = 10x
    /// entry gross), that parent's cycle completes.
    function _activateStageB(address account, uint8 level) private {
        SlotQueue storage queue = _gpQueueB[level];
        while (gpFilledB[level][queue.accounts[queue.cursor]] == 5) {
            queue.cursor += 1;
        }
        address parent = queue.accounts[queue.cursor];

        queue.accounts.push(account);
        gpFilledB[level][parent] += 1;
        emit GlobalStageBFilled(account, level, parent);

        if (gpFilledB[level][parent] == 5) {
            _completeGlobalCycle(parent, level);
        }
    }

    function _completeGlobalCycle(address account, uint8 level) private {
        uint256 entry = globalPoolEntry(level);
        uint256 gross = 10 * entry;

        uint256 reserved;
        if (level < GP_MAX_LEVEL && globalMembers[account].highestLevel == level) {
            reserved = globalPoolEntry(level + 1);
        }

        uint256 distributable = gross - reserved;
        uint256 adminFee = (distributable * FEE_BPS) / BPS;
        uint256 credited = distributable - adminFee;
        globalIncome[account] += credited;
        _payNow(account, credited);
        _payNow(treasury, adminFee);

        emit GlobalCycleCompleted(account, level, gross, reserved, adminFee, credited);

        if (reserved != 0) {
            _activateStageA(account, level + 1);
        }
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(paymentToken).call(
            abi.encodeCall(IERC20Minimal.transfer, (to, amount))
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _payNow(address recipient, uint256 amount) private {
        if (amount != 0) _safeTransfer(recipient, amount);
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(paymentToken).call(
            abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount))
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _setPaymentTokenUnit(uint256 unit) private {
        bytes32 storageSlot = PAYMENT_TOKEN_UNIT_SLOT;
        assembly {
            sstore(storageSlot, unit)
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
