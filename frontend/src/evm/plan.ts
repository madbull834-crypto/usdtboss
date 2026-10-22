export type IncomeRecipient =
  | "upline"
  | "wallet"
  | "upgrade"
  | "team"
  | "recycle"
  | "royalPool";

export type IncomeIdRule = {
  id: number;
  position: number;
  level: 1 | 2 | 3;
  normalRecipient: IncomeRecipient;
  recycleRecipient: IncomeRecipient;
  label: string;
};

export type SlotRule = {
  slot: number;
  perIdIncomeSol: number;
  sixIncomeTotalSol: number;
  recycleCycles: number;
  recycleTotalSol: number;
};

export type GlobalAutopoolLevelRule = {
  level: number;
  entry: number;
  growthTree1Total: number;
  growthTree2Position: number;
  grossCycle: number;
  nextLevelReserve: number;
  planIncome: number;
  adminFee: number;
  netWalletIncome: number;
};

const GLOBAL_AUTOPOOL_ENTRIES = [20, 120, 720, 4_320, 25_920, 155_520] as const;

/** Mirrors the deployed two-stage Global Pool: two Stage-A positions promote
 * a member into the five-position Stage-B tree. The plan artwork shows income
 * before the contract's 10% admin fee, so both gross and net are explicit. */
export const GLOBAL_AUTOPOOL_LEVELS: GlobalAutopoolLevelRule[] = GLOBAL_AUTOPOOL_ENTRIES.map(
  (entry, index) => {
    const grossCycle = entry * 10;
    const nextLevelReserve = GLOBAL_AUTOPOOL_ENTRIES[index + 1] ?? 0;
    const planIncome = grossCycle - nextLevelReserve;
    const adminFee = planIncome * 0.1;
    return {
      level: index + 1,
      entry,
      growthTree1Total: entry * 2,
      growthTree2Position: entry * 2,
      grossCycle,
      nextLevelReserve,
      planIncome,
      adminFee,
      netWalletIncome: planIncome - adminFee,
    };
  },
);

export const GLOBAL_AUTOPOOL_PLAN_TOTAL = GLOBAL_AUTOPOOL_LEVELS.reduce(
  (total, level) => total + level.planIncome,
  0,
);

export const REGISTRATION_SOL = 30;
export const CONTRIBUTION_SPLIT = [
  { label: "Matrix entry", percent: 100, sol: 30 },
  { label: "Token purchase allocation (not implemented)", percent: 0, sol: 0 },
];

export const WELCOME_PASS_RULE = {
  startPriceSol: Number.NaN,
  targetPriceSol: Number.NaN,
  lockingDays: 0,
};

export const INCOME_ID_RULES: IncomeIdRule[] = [
  { id: 1, position: 1, level: 1, normalRecipient: "upline", recycleRecipient: "upline", label: "Personal upline income" },
  { id: 2, position: 2, level: 1, normalRecipient: "upline", recycleRecipient: "upline", label: "Personal upline income" },
  { id: 3, position: 3, level: 2, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 4, position: 5, level: 2, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Cycle-owner allocation" },
  { id: 5, position: 8, level: 2, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Cycle-owner allocation" },
  { id: 6, position: 10, level: 2, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 7, position: 12, level: 3, normalRecipient: "team", recycleRecipient: "team", label: "Team allocation" },
  { id: 8, position: 14, level: 3, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 9, position: 15, level: 3, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 10, position: 18, level: 3, normalRecipient: "team", recycleRecipient: "team", label: "Team allocation" },
  { id: 11, position: 16, level: 3, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 12, position: 19, level: 3, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Personal matrix income" },
  { id: 13, position: 17, level: 3, normalRecipient: "team", recycleRecipient: "team", label: "Team allocation" },
  { id: 14, position: 20, level: 3, normalRecipient: "wallet", recycleRecipient: "wallet", label: "Cycle-owner allocation" },
];

/** Actual wallet transfers counted as "My Income": matrix and upline only.
 * Team reward (5) is a real transfer too, but every page built on this
 * function documents Team as its own excluded category (see IncomePage's
 * and MyIncomeTree's "Team income ... excluded" copy) - it must stay out of
 * this total or it silently inflates personal income with no matching
 * position card. Recipient-owned entries 4/5 (upgrade) and 14 (recycle) are
 * withheld reserves, also excluded. */
export function isPersonalIncomeEventType(eventType: number) {
  return eventType === 1 || eventType === 2;
}

export const INCOME_CATEGORY_STYLES: Record<IncomeRecipient, { label: string; badge: string; dot: string }> = {
  upline: {
    label: "Direct income",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  wallet: {
    label: "Matrix income",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  upgrade: {
    label: "Upgrade reserve",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  team: {
    label: "Team allocation",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  recycle: {
    label: "Recycle reserve",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  royalPool: {
    label: "Royal pool",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
    dot: "bg-purple-500",
  },
};

export function incomeCategoryForId(idNumber: number, cycleKind: number) {
  const rule = INCOME_ID_RULES.find((candidate) => candidate.id === idNumber);
  const recipient = rule ? (cycleKind === 1 ? rule.recycleRecipient : rule.normalRecipient) : "wallet";
  return INCOME_CATEGORY_STYLES[recipient];
}

// Legacy table shape is preserved, but per-ID and recycle projections are not
// available from the EVM whole-cycle payout model.

export const SLOT_RULES: SlotRule[] = Array.from({ length: 12 }, (_, index) => {
  const slot = index + 1;
  const perIdIncomeSol = Number.NaN; // EVM credits whole cycles, not legacy income IDs.
  const recycleCycles = 0;
  return {
    slot,
    perIdIncomeSol,
    sixIncomeTotalSol: perIdIncomeSol * 6,
    recycleCycles,
    recycleTotalSol: recycleCycles * 7 * perIdIncomeSol,
  };
});

export const RANK_RULES = [
  { name: "Rising", targetSlot: 3, rewardPercent: 25 },
  { name: "Prime", targetSlot: 6, rewardPercent: 25 },
  { name: "Royal", targetSlot: 9, rewardPercent: 25 },
  { name: "Legendary", targetSlot: 12, rewardPercent: 25 },
];

export function slotRule(slot: number) {
  return SLOT_RULES[Math.max(0, Math.min(11, slot - 1))];
}

export function activeSlotNumbers(activeSlotBitmap: number) {
  return SLOT_RULES.filter((rule) => (activeSlotBitmap & (1 << (rule.slot - 1))) !== 0).map(
    (rule) => rule.slot,
  );
}

export function completedIncomeIds(processedIdsBitmap: number) {
  return INCOME_ID_RULES.filter((rule) => (processedIdsBitmap & (1 << (rule.id - 1))) !== 0).map(
    (rule) => rule.id,
  );
}

export function nextRank(currentSlot: number) {
  return {name:"Not implemented",targetSlot:currentSlot,rewardPercent:0};
}

export function formatSol(value: number) {
  if (!Number.isFinite(value)) return "Not available";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} USDT`;
}
