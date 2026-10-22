import { useEffect, useRef, type RefObject } from "react";
import { formatUserOrdinal, type PlacementTreeNode, type SolTrustUserAccount } from "../../evm/client";

/** Renders the contract's real 3-wide forced matrix for one slot.
 *
 * This is deliberately separate from MatrixTreeView, which draws the archive's
 * 2-wide pocket tree. The contract uses a three-child sponsor-downline matrix,
 * so a binary widget cannot represent it. */
export default function PlacementTreeView({
  tree,
  usersByWallet = new Map(),
  ownerWallet,
}: {
  tree: PlacementTreeNode | null;
  usersByWallet?: Map<string, SolTrustUserAccount>;
  ownerWallet: string;
}) {
  const rootCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootCardRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tree]);

  if (!tree) return null;
  const legacyDerived = tree.source === "legacy-derived";

  return (
    <div className="flex w-max min-w-full flex-col items-center gap-2">
      <div className="w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200 sm:text-sm">
        <p className="font-bold">How to read the placement tree</p>
        <p className="mt-1 leading-5">
          Each parent holds three positions, filled in order 1, 2, 3. A new member is
          placed under their sponsor; when the sponsor's three positions are full, they
          go to the first open position in the sponsor's team, level by level
          (<span className="font-semibold">spillover</span>). The three payments under a parent
          complete that parent's cycle.
        </p>
        <p className="mt-2 leading-5">
          {legacyDerived
            ? "Legacy derived view: positions are reconstructed from imported referrals, active member levels and registration order. This visualization does not create income or withdrawable balances."
            : "Live view: these are confirmed contract matrix placements. Imported legacy positions are kept separate from this topology."}
        </p>
      </div>
      <PlacementBranch node={tree} usersByWallet={usersByWallet} ownerWallet={ownerWallet} root rootRef={rootCardRef} />
    </div>
  );
}

function PlacementBranch({
  node,
  usersByWallet,
  ownerWallet,
  root = false,
  rootRef,
  parentUserId,
}: {
  node: PlacementTreeNode;
  usersByWallet: Map<string, SolTrustUserAccount>;
  ownerWallet: string;
  root?: boolean;
  rootRef?: RefObject<HTMLDivElement>;
  parentUserId?: bigint;
}) {
  const sponsor = usersByWallet.get(node.user.referrer);
  const sponsorMatchesParent =
    node.parentWallet !== null && node.parentWallet === node.user.referrer;
  const filled = node.children.filter(Boolean).length;
  const isOwner = node.user.wallet === ownerWallet;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={root ? rootRef : undefined}
        className={`relative z-10 w-[clamp(8rem,22vw,11.5rem)] rounded-lg border p-2 text-left shadow-sm sm:p-3 ${
          isOwner
            ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30"
            : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {root ? "Tree owner" : `Position ${node.position}`}
            </p>
            <p className="mt-1 text-base font-bold text-brand-600 dark:text-brand-400 sm:text-lg">
              {formatUserOrdinal(node.user.userId)}
            </p>
          </div>
          {!root && <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{node.position}/3</span>}
        </div>
        <p className="mt-2 font-mono text-[10px] text-gray-600 dark:text-gray-300 sm:text-xs" title={node.user.wallet}>
          {shortWallet(node.user.wallet)}
        </p>
        <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-[10px] text-gray-600 dark:bg-white/[0.04] dark:text-gray-300 sm:text-xs">
          <p><span className="font-semibold">Slot:</span> {node.slot}</p>
          <p>
            <span className="font-semibold">Positions:</span>{" "}
            {node.truncated ? "Expand to view" : `${filled}/3 ${node.source === "legacy-derived" ? "derived" : "paid"}`}
          </p>
          {!root && (
            <p>
              <span className="font-semibold">Matrix parent:</span>{" "}
              {parentUserId !== undefined ? formatUserOrdinal(parentUserId) : "Tree owner"}
            </p>
          )}
          <p>
            <span className="font-semibold">Sponsor:</span>{" "}
            {sponsor ? formatUserOrdinal(sponsor.userId) : shortWallet(node.user.referrer)}
          </p>
          {!root && (
            <p
              className={
                sponsorMatchesParent
                  ? "font-semibold text-gray-500 dark:text-gray-400"
                  : "font-semibold text-amber-600 dark:text-amber-300"
              }
            >
              {sponsorMatchesParent ? "Sponsor = matrix parent" : "Spillover: sponsor ≠ matrix parent"}
            </p>
          )}
        </div>
        {node.truncated && (
          <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">
            More positions below — open this user to expand
          </p>
        )}
      </div>

      {!node.truncated && filled > 0 && (
        <>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
          <div className="relative grid grid-cols-3 gap-1 pt-4 sm:gap-2">
            <div className="absolute left-[16.6%] right-[16.6%] top-0 h-px bg-gray-300 dark:bg-gray-700" />
            {node.children.map((child, index) => (
              <div key={child?.user.wallet ?? `open-${index}`} className="relative flex justify-center">
                <div className="absolute -top-4 h-4 w-px bg-gray-300 dark:bg-gray-700" />
                {child ? (
                  <PlacementBranch
                    node={child}
                    usersByWallet={usersByWallet}
                    ownerWallet={ownerWallet}
                    parentUserId={node.user.userId}
                  />
                ) : (
                  <div className="w-[clamp(8rem,22vw,11.5rem)] rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-[10px] text-gray-400 dark:border-gray-800 sm:py-4 sm:text-xs">
                    Open position {index + 1}
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

function shortWallet(wallet: string) {
  if (!wallet || wallet === "0x0000000000000000000000000000000000000000") return "Root / System";
  if (wallet.length <= 13) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}
