import { useEffect, useRef, type RefObject } from "react";
import { formatUserOrdinal, type IncomeReceipt, type MatrixTreeNode, type RegistrationContribution } from "../../evm/client";
import { INCOME_CATEGORY_STYLES, type IncomeRecipient } from "../../evm/plan";

export type { IncomeReceipt, RegistrationContribution } from "../../evm/client";

export default function MatrixTreeView({
  tree,
  incomeReceiptsByWallet = new Map(),
  contributionsByWallet = new Map(),
  mode,
  usersByWallet = new Map(),
}: {
  tree: MatrixTreeNode | null;
  incomeReceiptsByWallet?: Map<string, IncomeReceipt[]>;
  contributionsByWallet?: Map<string, RegistrationContribution>;
  mode: "placement" | "income";
  usersByWallet?: Map<string, MatrixTreeNode["user"]>;
}) {
  const rootCardRef = useRef<HTMLDivElement>(null);

  // The tree is horizontally centered inside a wide, horizontally-scrolling
  // wrapper (it can be much wider than the viewport once empty placeholder
  // positions are drawn all the way to a 14-slot pyramid). Without this, the
  // scroll position defaults to 0 and the root card - and often the entire
  // populated part of the tree - can render off-screen to the right, making
  // a freshly loaded tree look blank until the user notices they can scroll.
  useEffect(() => {
    rootCardRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tree]);

  if (!tree) {
    return null;
  }

  return (
    <div className="flex w-max min-w-full flex-col items-center gap-2">
      <TreeGuide mode={mode} />
      {mode === "income" && <IncomeLegend />}
      <MatrixTreeBranch
        node={tree}
        incomeReceiptsByWallet={incomeReceiptsByWallet}
        contributionsByWallet={contributionsByWallet}
        mode={mode}
        usersByWallet={usersByWallet}
        root
        rootRef={rootCardRef}
        incomeOwnerWallet={tree.user.wallet}
      />
    </div>
  );
}

function TreeGuide({ mode }: { mode: "placement" | "income" }) {
  return (
    <div className="w-full max-w-3xl rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-left text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200 sm:text-sm">
      <p className="font-bold">{mode === "placement" ? "How to read the placement tree" : "How to read the income tree"}</p>
      <p className="mt-1 leading-5">
        {mode === "placement"
          ? "This shows where users are physically placed. Position 1 is LEFT, position 2 is RIGHT, then positions 3–6 fill the next level. Placement alone does not mean the root earned income."
          : "This shows the root wallet's 14 on-chain income positions. A member is recorded under the primary owner and also under a different wallet that actually received the routed income. The credited position changes the counter but never transfers USDT twice. In Slot 1 cycle 1, positions 4 and 5 fund the upgrade; in later cycles, position 4 funds the Royal Pool and position 5 pays the owner. Position 14 triggers recycle."}
      </p>
    </div>
  );
}

function IncomeLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
      {Object.values(INCOME_CATEGORY_STYLES).map((style) => (
        <span key={style.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      ))}
    </div>
  );
}

function MatrixTreeBranch({
  node,
  incomeReceiptsByWallet,
  contributionsByWallet,
  mode,
  usersByWallet,
  root = false,
  rootRef,
  treePosition = 0,
  parentUserId,
  incomeOwnerWallet,
}: {
  node: MatrixTreeNode;
  incomeReceiptsByWallet: Map<string, IncomeReceipt[]>;
  contributionsByWallet: Map<string, RegistrationContribution>;
  mode: "placement" | "income";
  usersByWallet: Map<string, MatrixTreeNode["user"]>;
  root?: boolean;
  rootRef?: RefObject<HTMLDivElement>;
  treePosition?: number;
  parentUserId?: bigint;
  incomeOwnerWallet: string;
}) {
  const hasChildren = Boolean(node.first || node.second);
  const receipts = incomeReceiptsByWallet.get(node.user.wallet) ?? [];
  const contribution = root ? null : contributionsByWallet.get(node.user.wallet) ?? null;
  const displayOnlyEvent = node.displayOnlyEvent;
  const displayedPosition = mode === "placement" && node.user.placementPocketPosition > 0
    ? node.user.placementPocketPosition
    : treePosition;
  const side = displayedPosition % 2 === 1 ? "LEFT" : "RIGHT";
  const referrer = usersByWallet.get(node.user.referrer);
  const placementOwner = node.user.placementPocketOwner
    ? usersByWallet.get(node.user.placementPocketOwner)
    : undefined;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={root ? rootRef : undefined}
        className={`relative z-10 w-[clamp(7.5rem,22vw,11rem)] rounded-lg border p-2 text-left shadow-sm sm:p-3 ${
          root
            ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30"
            : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {root ? "Tree owner" : mode === "placement" ? `Position ${displayedPosition}` : `Income #${treePosition}`}
            </p>
            <p className="mt-1 text-base font-bold text-brand-600 dark:text-brand-400 sm:text-lg">{formatUserOrdinal(node.user.userId)}</p>
          </div>
          {!root && <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${side === "LEFT" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"}`}>{side}</span>}
        </div>
        <p className="mt-2 font-mono text-[10px] text-gray-600 dark:text-gray-300 sm:text-xs" title={node.user.wallet}>{shortWallet(node.user.wallet)}</p>
        <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-[10px] text-gray-600 dark:bg-white/[0.04] dark:text-gray-300 sm:text-xs">
          <p><span className="font-semibold">Slot:</span> {node.user.currentSlot}</p>
          {!root && mode === "placement" && <p><span className="font-semibold">Matrix parent:</span> {parentUserId !== undefined ? formatUserOrdinal(parentUserId) : "Tree owner"}</p>}
          {!root && mode === "placement" && <p><span className="font-semibold">Placed in pocket:</span> {placementOwner ? formatUserOrdinal(placementOwner.userId) : shortWallet(node.user.placementPocketOwner ?? "unknown")}</p>}
          {!root && mode === "placement" && <p><span className="font-semibold">Referred by:</span> {referrer ? formatUserOrdinal(referrer.userId) : shortWallet(node.user.referrer)}</p>}
          {!root && mode === "income" && <p><span className="font-semibold">Income parent:</span> {parentUserId !== undefined ? formatUserOrdinal(parentUserId) : "Tree owner"}</p>}
          {!root && mode === "income" && <p><span className="font-semibold">Triggered by:</span> {formatUserOrdinal(node.user.userId)} (global user ID)</p>}
          {displayOnlyEvent && <p className="font-semibold text-amber-600 dark:text-amber-300">Recipient view only — no second counter entry</p>}
          {!root && mode === "placement" && <p><span className="font-semibold">Meaning:</span> placement only; earning checked separately</p>}
        </div>
        {displayOnlyEvent && (
          <div className="mt-2 rounded-lg bg-emerald-100 px-2 py-2 text-left text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <p className="text-[10px] font-bold uppercase sm:text-xs">Eligible income received</p>
            <p className="mt-1 text-xs font-bold">{formatSol(displayOnlyEvent.amountSol)} paid to tree owner</p>
            <p className="mt-1 text-[9px] leading-4 sm:text-[10px]">
              Accounted under {formatOwner(displayOnlyEvent.incomeTreeOwner, usersByWallet)}, position {displayOnlyEvent.incomeTreePosition}.
            </p>
            <p className="text-[9px] opacity-75 sm:text-[10px]">Source slot {displayOnlyEvent.slotNumber} · Payment ID {displayOnlyEvent.idNumber}</p>
          </div>
        )}
        {!displayOnlyEvent && receipts.length > 0 && (
          <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 sm:text-[10px]">
              Payment routing
            </p>
            <div className="mt-2 space-y-2">
              {receipts.map((receipt) => {
                const outcome = incomeOutcome(receipt, incomeOwnerWallet);
                const category = INCOME_CATEGORY_STYLES[outcome.category];
                return (
                  <div
                    key={`${receipt.cycleKind}-${receipt.id}-${receipt.eventType}-${receipt.recipient}-${receipt.incomeTreePosition}`}
                    className={`rounded-lg px-2 py-2 text-left ${category.badge}`}
                  >
                    <p className="text-[10px] font-bold sm:text-xs">Income position {receipt.incomeTreePosition}: {outcome.title}</p>
                    <p className="mt-0.5 text-xs font-bold">{formatSol(receipt.amountSol)}</p>
                    <p className="mt-0.5 text-[9px] leading-4 sm:text-[10px]">{outcome.destination}</p>
                    <p className="mt-0.5 text-[9px] opacity-75 sm:text-[10px]">Source payment ID {receipt.id}{receipt.count > 1 ? ` ×${receipt.count}` : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!displayOnlyEvent && contribution && (
          <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400 sm:text-[10px]">
              Your registration
            </p>
            <p className="mt-1 text-[10px] text-gray-600 dark:text-gray-300 sm:text-xs">
              Position {contribution.position} in {shortWallet(contribution.ownerWallet)}'s pocket
            </p>
            {contribution.idNumber === null ? (
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 sm:text-xs">Silent position — no payout</p>
            ) : contribution.event ? (
              <ContributionRouting event={contribution.event} />
            ) : (
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 sm:text-xs">ID {contribution.idNumber} — payment not found</p>
            )}
          </div>
        )}
      </div>

      {hasChildren && (
        <>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
          <div className="relative grid grid-cols-2 gap-1 pt-4 sm:gap-2">
            <div className="absolute left-1/4 right-1/4 top-0 h-px bg-gray-300 dark:bg-gray-700" />
            {[node.first, node.second].map((child, index) => (
              <div key={child?.user.wallet ?? `empty-${index}`} className="relative flex justify-center">
                <div className="absolute -top-4 h-4 w-px bg-gray-300 dark:bg-gray-700" />
                {child ? (
                  <MatrixTreeBranch
                    node={child}
                    incomeReceiptsByWallet={incomeReceiptsByWallet}
                    contributionsByWallet={contributionsByWallet}
                    mode={mode}
                    usersByWallet={usersByWallet}
                    incomeOwnerWallet={incomeOwnerWallet}
                    treePosition={treePosition * 2 + index + 1}
                    parentUserId={node.user.userId}
                  />
                ) : (
                  <div className="w-[clamp(7.5rem,22vw,11rem)] rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-[10px] text-gray-400 dark:border-gray-800 sm:py-4 sm:text-xs">
                    Open {index === 0 ? "LEFT" : "RIGHT"} position
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ContributionRouting({ event }: { event: NonNullable<RegistrationContribution["event"]> }) {
  const outcome = incomeOutcome({
    id: event.idNumber,
    cycleKind: event.cycleKind,
    count: 1,
    amountSol: event.amountSol,
    eventType: event.eventType,
    recipient: event.recipient,
    incomeTreePosition: event.incomeTreePosition,
  }, event.incomeTreeOwner);
  return (
    <div className="mt-1 text-[10px] leading-4 text-sky-700 dark:text-sky-300 sm:text-xs">
      <p className="font-bold">Income position {event.incomeTreePosition}: {outcome.title}</p>
      <p>{formatSol(event.amountSol)} — {outcome.destination}</p>
      <p className="opacity-75">Source payment ID {event.idNumber}</p>
    </div>
  );
}

function incomeOutcome(
  receipt: IncomeReceipt,
  incomeOwnerWallet: string,
): { title: string; destination: string; category: IncomeRecipient } {
  if (receipt.eventType === 8) {
    return {
      title: "Historical membership restored",
      destination: "Structure-only migration. The original historical payment was not transferred again.",
      category: "wallet",
    };
  }
  if (receipt.eventType === 3) {
    return {
      title: "Reserved for slot upgrade",
      destination: `Held by the contract for ${shortWallet(incomeOwnerWallet)}. Not sent to a wallet.`,
      category: "upgrade",
    };
  }
  if (receipt.eventType === 7) {
    return {
      title: "Reserved for recycle",
      destination: `Held by the contract for ${shortWallet(incomeOwnerWallet)}'s recycle. Not withdrawable income.`,
      category: "recycle",
    };
  }
  if (receipt.eventType === 6) {
    return {
      title: "Allocated to royal pool",
      destination: "Deposited into the protocol royal pool, not the tree owner's wallet.",
      category: "royalPool",
    };
  }
  const paidToOwner = receipt.recipient === incomeOwnerWallet;
  if (receipt.eventType === 5) {
    return {
      title: paidToOwner ? "Team income paid to tree owner" : "Team income redirected",
      destination: `Transferred to wallet ${shortWallet(receipt.recipient)}.`,
      category: "team",
    };
  }
  return {
    title: paidToOwner ? "Paid to tree owner's wallet" : "Paid to upline/root wallet",
    destination: `Transferred to wallet ${shortWallet(receipt.recipient)}.`,
    category: paidToOwner ? "wallet" : "upline",
  };
}

function shortWallet(wallet: string) {
  if (wallet.length <= 13) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}

function formatOwner(wallet: string, usersByWallet: Map<string, MatrixTreeNode["user"]>) {
  const user = usersByWallet.get(wallet);
  return user ? formatUserOrdinal(user.userId) : shortWallet(wallet);
}

function formatSol(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT`;
}
