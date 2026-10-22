import type { ROYAL_POOL_SLOTS } from "./client";
export type ProtocolConfig = {
  exists: boolean;
  authority: string;
  paused: boolean;
  launched: boolean;
  rootInitialized: boolean;
  multisigConfigured: boolean;
  nextUserId: bigint;
  nextPaymentEventId: bigint;
  creator: string;
  joiningSol: number;
  tokenAllocationSol: number;
  matrixAllocationSol: number;
  tokenMint: string;
  tokenDecimals: number;
  tokenAmountPerJoin: bigint;
  tokenAllocationMode: number;
};

export type SolTrustUserAccount = {
  wallet: string;
  referrer: string;
  firstUpline: string;
  secondUpline: string;
  thirdUpline: string;
  firstDownline: string | null;
  secondDownline: string | null;
  userId: bigint;
  directReferralCount: number;
  currentSlot: number;
  activeSlotBitmap: number;
  exited: boolean;
  recycleCounts: number[];
  registeredAt: bigint;
  /** How many of this user's own 20 pocket positions are filled (as owner). */
  pocketFillCount: number;
  /** Whose pocket this user filled when they registered. */
  placementPocketOwner: string | null;
  /** Which of the owner's 20 pocket positions this user occupies. */
  placementPocketPosition: number;
  incomeTreeCount: number;
  incomeTreeCycle: number;
  incomeTreeSlot: number;
  incomeUpgradeReserveSol: number;
  incomeRecycleReady: boolean;
  /** Legacy pre-fix qualification attribution. New registrations use only
   * immutable payment/income-slot entries and leave these fields empty. */
  referralIncomeTreeOwner: string | null;
  referralIncomeTreePosition: number;
  referralIncomeTreeCycle: number;
};

export type LegacyGrowthView = {
  tree: number;
  sourceId: number;
  generationId: number;
  parent: string;
  position: number;
  level: number;
  imported: boolean;
  directCount: number;
  position1Income: number;
  position2Income: number;
};

export type RoyalPoolPayout = {
  slotNumber: (typeof ROYAL_POOL_SLOTS)[number];
  recipient: string;
  amountLamports: bigint;
  fallbackToRoot: boolean;
};

export type SolTrustMatrixPosition = {
  matrixId: bigint;
  cycleKind: number;
  slotNumber: number;
  positionId: bigint;
  user: string;
  referrer: string;
  parentPosition: string;
  cycleNumber: number;
  processedIdsBitmap: number;
  closed: boolean;
  assignedAt: bigint;
  /** How many of THIS pocket's 20 positions are filled (as owner). Only
   * meaningful for recycle-cycle positions. */
  pocketFillCount: number;
  /** Whose pocket this position's predecessor-completion filled (as a
   * filler), and at what position. Only meaningful for recycle-cycle
   * positions. */
  placementPocketOwner: string | null;
  placementPocketPosition: number;
};

export type SolTrustPaymentEvent = {
  matrixId: bigint;
  cycleKind: number;
  slotNumber: number;
  idNumber: number;
  payer: string;
  recipient: string;
  amountSol: number;
  eventType: number;
  timestamp: bigint;
  incomeTreeOwner: string;
  incomeTreePosition: number;
  incomeTreeCycle: number;
};

export type SolTrustIncomeSlotEntry = {
  owner: string;
  cycle: number;
  position: number;
  member: string;
};

export type SolTrustSlotUpgradeMatrixPosition = {
  owner: string;
  member: string;
  slotNumber: number;
  position: number;
  amountSol: number;
  assignedAt: bigint;
};

export type SolTrustSlotIncomeState = {
  owner: string;
  slotNumber: number;
  cycle: number;
  filledCount: number;
  recycleCount: number;
  nextSlotReserveSol: number;
  recycleReady: boolean;
};

export type SolTrustSlotIncomeEntry = {
  address?: string;
  owner: string;
  member: string;
  recipient: string;
  slotNumber: number;
  cycle: number;
  position: number;
  amountSol: number;
  eventType: number;
  assignedAt: bigint;
};

export type MatrixProfile = {
  wallet: string;
  userAddress: string;
  positionAddress: string;
  user: SolTrustUserAccount;
  position: SolTrustMatrixPosition | null;
  welcomePass: SolTrustWelcomePass | null;
  firstDownline: SolTrustUserAccount | null;
  secondDownline: SolTrustUserAccount | null;
};

export type MatrixTreeNode = {
  user: SolTrustUserAccount;
  first: MatrixTreeNode | null;
  second: MatrixTreeNode | null;
  /** Recipient-side visualization of an event accounted in another owner's
   * tree. It never represents a second on-chain entry or counter increment. */
  displayOnlyEvent?: SolTrustPaymentEvent;
};

export type InvitationTreeNode = {
  user: SolTrustUserAccount;
  children: InvitationTreeNode[];
};

export type SolTrustWelcomePass = {
  user: string;
  issuedAt: bigint;
  unlockAt: bigint;
  burned: boolean;
};

export type SolTrustRoyalPool = {
  totalDepositedSol: number;
  totalDistributedSol: number;
  currentBalanceSol: number;
  distributionRound: bigint;
  formulaResolved: boolean;
};



export type ResolvedRegistrationPlacement = {
  ownerWallet: string;
  /** Which of the owner's 20 pocket positions this registration claims. */
  position: number;
  /** Upline wallets, in order, that must be passed as remaining accounts so
   * the on-chain program can independently verify placement and commission
   * relationships. A non-root referrer's first upline is required even when
   * the referrer's own pocket still has room. */
  hops: string[];
};

export type RegistrationContribution = {
  ownerWallet: string;
  position: number;
  idNumber: number | null;
  event: SolTrustPaymentEvent | null;
};

export type IncomeReceipt = {
  id: number;
  cycleKind: number;
  count: number;
  amountSol: number;
  eventType: number;
  recipient: string;
  incomeTreePosition: number;
};

export type ResolvedRecyclePlacement = {
  ownerWallet: string;
  /** Which of the owner's 20 pocket positions this recycle event claims. */
  position: number;
  /** Upline wallets, in order, forming the on-chain-verified candidate
   * chain - mirrors resolveRegistrationPlacement's hops, except each hop
   * here needs TWO accounts (the candidate's UserAccount + their
   * MatrixPosition at the target slot), since recycle pockets are scoped
   * per (user, slot, cycle) instead of living on UserAccount directly. */
  hops: string[];
  /** Which recycle generation `position` belongs to - the owner's current
   * recycleCounts[slot-1] unless opensNewGeneration is set, in which case
   * it's that value + 1. */
  recycleNumber: number;
  /** True when the owner's current-generation pocket was already full: an
   * active owner never spills a recycled contribution to a different upline
   * just because of that - a fresh generation opens for the same owner
   * instead (see math::position_within_pocket_cycle's registration-side
   * counterpart for why "full" no longer disqualifies a candidate here). */
  opensNewGeneration: boolean;
};

/** A three-wide matrix placement. Live placements are read from contract state
 * or SlotActivated events. Legacy-derived placements are display-only and are
 * reconstructed from the imported sponsor hierarchy, active member level and
 * registration order; they never create or change income. */
export type MatrixPlacement = {
  member: string;
  slot: number;
  parent: string;
  /** 1, 2 or 3 - which of the parent's three child positions this fills. */
  position: number;
  source: "live" | "legacy-derived";
};

/** A node of the contract's real 3-wide forced matrix for a single slot. */
export type PlacementTreeNode = {
  user: SolTrustUserAccount;
  slot: number;
  /** 0 for the tree owner, otherwise 1-3 within its parent. */
  position: number;
  parentWallet: string | null;
  /** Identifies confirmed contract topology versus a legacy visualization. */
  source: "live" | "legacy-derived";
  /** Always length 3; null entries are open positions. */
  children: (PlacementTreeNode | null)[];
  /** Children exist but were not expanded because the depth limit was hit. */
  truncated: boolean;
};
