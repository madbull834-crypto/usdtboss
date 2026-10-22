import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { PublicKey } from "../../evm/address";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import ContractSlotTree from "../../components/soltrust/ContractSlotTree";
import {
  DEFAULT_REFERRER,
  PROGRAM_ID,
  RPC_URL,
  buildSlotUpgradeMatrixTree,
  buildSlotIncomeTree,
  countMatrixTreeUsers,
  connection,
  getAllSolTrustUsers,
  getAllPaymentEvents,
  getAllIncomeSlotEntries,
  getAllSlotUpgradeMatrixPositions,
  getAllSlotIncomeEntries,
  getDirectReferralUsers,
  getMatrixPosition,
  getMatrixPlacements,
  matrixPlacementOf,
  matrixPlacementsForWallet,
  isLegacyMatrixWallet,
  type MatrixPlacement,
  getSlotIncomeState,
  getSolTrustUserAccount,
  evmProvider,
  type SolTrustMatrixPosition,
  type SolTrustIncomeSlotEntry,
  type SolTrustUserAccount,
  type MatrixTreeNode,
  type SolTrustPaymentEvent,
  type SolTrustSlotIncomeEntry,
} from "../../evm/client";
import {
  INCOME_ID_RULES,
  activeSlotNumbers,
  completedIncomeIds,
  formatSol,
  isPersonalIncomeEventType,
  slotRule,
} from "../../evm/plan";

type IncomeMode = "direct" | "level" | "slot";
type LoadState = "idle" | "loading" | "success" | "error";

type TeamRow = {
  level: number;
  parent: string;
  user: SolTrustUserAccount;
};

export default function IncomePage({ mode }: { mode: IncomeMode }) {
  const params = useParams();
  const routeSlot = Number(params.slotNumber ?? 1);
  const selectedSlot = Math.min(12, Math.max(1, Number.isFinite(routeSlot) ? routeSlot : 1));
  const rpc = useMemo(() => connection(), []);
  const [wallet, setWallet] = useState("");
  const [lookupWallet, setLookupWallet] = useState(DEFAULT_REFERRER.toBase58());
  const [rootUser, setRootUser] = useState<SolTrustUserAccount | null>(null);
  const [position, setPosition] = useState<SolTrustMatrixPosition | null>(null);
  const [recyclePositions, setRecyclePositions] = useState<SolTrustMatrixPosition[]>([]);
  // Use the authoritative on-chain income cycle. A newly recycled cycle has
  // no entry records at position 0/14, so inferring the current cycle from
  // historical entries would incorrectly keep showing the completed cycle.
  const [selectedIncomeCycle, setSelectedIncomeCycle] = useState(0);
  const [currentSlotIncomeCycle, setCurrentSlotIncomeCycle] = useState(0);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [, setSlotMatrix] = useState<MatrixTreeNode | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");
  const [paymentEvents, setPaymentEvents] = useState<SolTrustPaymentEvent[]>([]);
  const [allUsers, setAllUsers] = useState<SolTrustUserAccount[]>([]);
  const [allProgramPaymentEvents, setAllProgramPaymentEvents] = useState<SolTrustPaymentEvent[]>([]);
  const [, setIncomeEntries] = useState<SolTrustIncomeSlotEntry[]>([]);
  const [slotIncomeEntries, setSlotIncomeEntries] = useState<SolTrustSlotIncomeEntry[]>([]);
  const [placements,setPlacements]=useState<MatrixPlacement[]>([]);

  const title =
    mode === "direct" ? "Direct Income" : mode === "level" ? "Level Income" : `Slot ${selectedSlot} Income`;

  useEffect(() => {
    const connectedWallet = evmProvider()?.publicKey?.toString();
    if (connectedWallet) {
      setWallet(connectedWallet);
      setLookupWallet(connectedWallet);
      void loadIncome(connectedWallet);
    }
  // Route changes reset the view; loadIncome reads the corresponding render state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedSlot]);

  async function connectWallet() {
    const phantom = evmProvider();
    if (!phantom) {
      setStatus("error");
      setMessage("EVM wallet was not found. Open this site over HTTPS with an EVM wallet installed.");
      return;
    }
    try {
      const response = await phantom.connect();
      const address = response.publicKey.toString();
      setWallet(address);
      setLookupWallet(address);
      setMessage("Wallet connected.");
      await loadIncome(address);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function loadIncome(address = lookupWallet) {
    setStatus("loading");
    setMessage("");
    setRootUser(null);
    setPosition(null);
    setRecyclePositions([]);
    setSelectedIncomeCycle(0);
    setCurrentSlotIncomeCycle(0);
    setTeamRows([]);
    setSlotMatrix(null);
    setPaymentEvents([]);
    setAllUsers([]);
    setAllProgramPaymentEvents([]);
    setIncomeEntries([]);
    setSlotIncomeEntries([]);

    let walletKey: PublicKey;
    try {
      walletKey = new PublicKey(address.trim());
    } catch {
      setStatus("error");
      setMessage("Enter a valid wallet public key.");
      return;
    }

    try {
      const [user, allUsers, allPaymentEvents, slotUpgradePositions, allIncomeEntries, slotIncomeEntries, slotIncomeState, matrixPlacements] = await Promise.all([
        getSolTrustUserAccount(rpc, walletKey),
        getAllSolTrustUsers(rpc),
        getAllPaymentEvents(rpc),
        mode === "slot" && selectedSlot > 1
          ? getAllSlotUpgradeMatrixPositions(rpc)
          : Promise.resolve([]),
        mode === "slot" && selectedSlot === 1
          ? getAllIncomeSlotEntries(rpc)
          : Promise.resolve([]),
        mode === "slot" && selectedSlot > 1
          ? getAllSlotIncomeEntries(rpc)
          : Promise.resolve([]),
        mode === "slot" && selectedSlot > 1
          ? getSlotIncomeState(rpc, walletKey, selectedSlot)
          : Promise.resolve(null),
        getMatrixPlacements(),
      ]);
      if (!user) {
        setStatus("error");
        setMessage("This wallet is not registered in the current SolTrust program.");
        return;
      }
      const slot = mode === "slot" ? selectedSlot : user.currentSlot || 1;
      const recycleNumber = user.recycleCounts[slot - 1] ?? 0;
      const [matrixPosition, allRecyclePositions] = await Promise.all([
        getMatrixPosition(rpc, walletKey, slot, 0),
        Promise.all(
          Array.from({ length: recycleNumber }, (_, index) => index + 1).map(
            (cycle) => getMatrixPosition(rpc, walletKey, slot, cycle),
          ),
        ),
      ]);
      const rows = mode === "direct"
        ? getDirectReferralUsers(allUsers, user.wallet).map((directUser) => ({
            level: 1,
            parent: user.wallet,
            user: directUser,
          }))
        : await fetchTeamRows(user, 12);

      const loadedRecyclePositions = allRecyclePositions.filter(
        (candidate): candidate is SolTrustMatrixPosition => candidate !== null,
      );
      setRootUser(user);
      setPlacements(matrixPlacements);
      setPosition(matrixPosition);
      setRecyclePositions(loadedRecyclePositions);
      const authoritativeIncomeCycle = selectedSlot === 1
        ? user.incomeTreeCycle
        : slotIncomeState?.cycle ?? 0;
      setCurrentSlotIncomeCycle(authoritativeIncomeCycle);
      setSelectedIncomeCycle(authoritativeIncomeCycle);
      setTeamRows(rows);
      setPaymentEvents(allPaymentEvents.filter((event) =>
        event.recipient === user.wallet &&
        isPersonalIncomeEventType(event.eventType) &&
        event.cycleKind === 0 && (mode !== "direct" || event.eventType === 2) && (mode !== "slot" || event.slotNumber === selectedSlot)
      ));
      setAllUsers(allUsers);
      setAllProgramPaymentEvents(allPaymentEvents);
      setIncomeEntries(allIncomeEntries);
      setSlotIncomeEntries(slotIncomeEntries);
      if (mode === "slot") {
        const routedTree = selectedSlot > 1
          ? buildSlotIncomeTree(allUsers, slotIncomeEntries, user.wallet, selectedSlot, authoritativeIncomeCycle)
          : null;
        const tree = selectedSlot > 1
          ? (routedTree && countMatrixTreeUsers(routedTree) > 1
            ? routedTree
            : buildSlotUpgradeMatrixTree(allUsers, slotUpgradePositions, user.wallet, selectedSlot))
          : null;
        setSlotMatrix(tree);
      }
      setStatus("success");
      setMessage(`${title} loaded from EVM contract events. New live income is paid directly to recipient wallets. Binary positions and recycle history are not supported by this contract.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : `Could not load ${title.toLowerCase()}.`);
    }
  }

  async function fetchTeamRows(root: SolTrustUserAccount, depth: number) {
    const rows: TeamRow[] = [];
    const visited = new Set([root.wallet]);
    let frontier = [root];
    const users = await getAllSolTrustUsers(rpc);

    for (let level = 1; level <= depth && frontier.length > 0; level += 1) {
      const nextFrontier: SolTrustUserAccount[] = [];
      for (const parent of frontier) {
        for (const childWallet of users.filter(u=>u.referrer===parent.wallet).map(u=>u.wallet)) {
          if (!childWallet || visited.has(childWallet)) continue;
          const child = await getSolTrustUserAccount(rpc, new PublicKey(childWallet));
          if (!child) continue;
          visited.add(childWallet);
          rows.push({ level, parent: parent.wallet, user: child });
          nextFrontier.push(child);
        }
      }
      frontier = nextFrontier;
    }
    return rows;
  }

  const activeSlots = rootUser ? activeSlotNumbers(rootUser.activeSlotBitmap) : [];
  const usersByWallet = useMemo(
    () => new Map(allUsers.map((user) => [user.wallet, user])),
    [allUsers],
  );
  const currentRule = slotRule(mode === "slot" ? selectedSlot : rootUser?.currentSlot ?? 1);
  const directRows = teamRows.filter((row) => row.level === 1);
  const recyclePosition = recyclePositions.length > 0
    ? recyclePositions[recyclePositions.length - 1]
    : null;
  const cycleHistory = [...(position ? [position] : []), ...recyclePositions];
  // Slot 1 trusts the authoritative `incomeTreeCycle` counter for which cycle
  // is "current"; `displayedCycle` is then a best-effort lookup into the raw
  // pocket records purely for the supplementary matrixId/positionId/closed
  // display below; it can legitimately be missing for a cycle whose
  // MatrixPosition record never got created (see `selectedIncomeCycle`).
  const displayedCycle = cycleHistory.find(
    (entry) => entry.cycleNumber === selectedIncomeCycle,
  ) ?? null;
  const displayedIncomeCycle = selectedIncomeCycle;
  const visiblePlacements = rootUser
    ? matrixPlacementsForWallet(placements, rootUser.wallet)
    : [];
  const displayedSlotIncomeEntries = selectedSlot > 1 && rootUser
    ? slotIncomeEntries.filter((entry) =>
        entry.owner === rootUser.wallet
        && entry.slotNumber === selectedSlot
        && entry.cycle === displayedIncomeCycle
      )
    : [];
  const displayedMatrixMembers = rootUser ? [
    {position:0,wallet:rootUser.wallet,user:rootUser},
    ...visiblePlacements.filter(p=>p.parent===rootUser.wallet && p.slot===selectedSlot)
      .map(p=>({position:p.position,wallet:p.member,user:usersByWallet.get(p.member)})),
  ] : [];
  const directProjection = paymentEvents.reduce((sum, event) => sum + event.amountSol, 0);
  const headlineAmount =
    mode === "direct"
      ? directProjection
      : paymentEvents.reduce((sum, event) => sum + event.amountSol, 0);

  return (
    <>
      <PageMeta title={`SolTrust ${title}`} description={`SolTrust ${title} view`} />
      <div className="solvault-theme">
        <PageBreadcrumb pageTitle={title} />
        <div className="space-y-6">
        <ComponentCard
          title={`${title} Lookup`}
          desc="Confirmed EVM cycle payouts and sponsor relationships. New live payouts transfer directly to recipient wallets."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
            <input
              value={lookupWallet}
              onChange={(event) => setLookupWallet(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              placeholder="Wallet public key"
            />
            <button
              type="button"
              onClick={() => void loadIncome()}
              disabled={status === "loading"}
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {status === "loading" ? "Loading" : `Load ${title}`}
            </button>
            <button
              type="button"
              onClick={connectWallet}
              className="h-11 rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {wallet ? "Wallet Connected" : "Connect Wallet"}
            </button>
          </div>
          <div className="grid gap-3 text-sm text-gray-500 dark:text-gray-400 md:grid-cols-3">
            <Info label="RPC" value={RPC_URL} />
            <Info label="Program" value={PROGRAM_ID.toBase58()} />
            <Info label="Default Referrer" value={DEFAULT_REFERRER.toBase58()} />
          </div>
          {status === "error" && message && <StatusMessage status={status} message={message} />}
        </ComponentCard>

        {rootUser && (
          <>
            <ComponentCard title={`${title} Summary`}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="User ID" value={rootUser.userId.toString()} />
                <Metric label="Active Slots" value={activeSlots.join(", ") || "None"} />
                <Metric label="Per ID Income" value={formatSol(currentRule.perIdIncomeSol)} />
                <Metric label="Confirmed Income" value={formatSol(headlineAmount)} />
                <Metric
                  label={mode === "direct" ? "Direct Referrals" : "Earning Transactions"}
                  value={mode === "direct" ? String(directRows.length) : String(paymentEvents.length)}
                />
                <Metric
                  label={mode === "direct" ? "Referral Qualification" : "Filled Slot Positions"}
                  value={mode === "direct" ? "Commission from direct 4" : `${visiblePlacements.filter(p=>p.parent===rootUser.wallet && p.slot===selectedSlot).length}/3`}
                />
                <Metric
                  label={mode === "direct" ? "Commission-qualified directs" : "Level Team"}
                  value={mode === "direct" ? String(Math.max(0, directRows.length - 3)) : String(teamRows.length)}
                />
                <Metric label="Position" value={String(matrixPlacementOf(placements,rootUser.wallet,selectedSlot)?.position ?? "Bootstrap / inactive")} />
                <Metric
                  label="Recycle Cycle"
                  value={recyclePosition ? `Recycle ${recyclePosition.cycleNumber}` : "Not implemented"}
                />
                <Metric
                  label="Recycle ID Progress"
                  value={recyclePosition ? `${completedIncomeIds(recyclePosition.processedIdsBitmap).length}/14` : "Not implemented"}
                />
              </div>
            </ComponentCard>

            {mode === "slot" && rootUser && (
              <ComponentCard
                title={`Slot ${selectedSlot} — Complete Cycle History`}
                desc="The deployed contract has one three-payment cycle per slot and no recycling. Legacy recycle navigation is unavailable."
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedIncomeCycle((cycle) => Math.max(0, cycle - 1))}
                      disabled={selectedIncomeCycle === 0}
                      className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/30"
                    >
                      ← Previous Cycle
                    </button>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      {`Recycle ${selectedIncomeCycle}${selectedIncomeCycle === currentSlotIncomeCycle ? " (Current)" : ""}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedIncomeCycle((cycle) => Math.min(currentSlotIncomeCycle, cycle + 1))}
                      disabled={selectedIncomeCycle >= currentSlotIncomeCycle}
                      className="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                    >
                      Next Cycle →
                    </button>
                  </div>
                  {displayedCycle && (() => {
                  const isOriginal = displayedIncomeCycle === 0;
                  const completed = selectedSlot === 1 && displayedCycle
                    ? completedIncomeIds(displayedCycle.processedIdsBitmap).length
                    : new Set(displayedSlotIncomeEntries.map((entry) => entry.position)).size;
                  const cycleCompleted = displayedIncomeCycle < currentSlotIncomeCycle || completed >= 14;
                  return (
                    <div className="space-y-4">

                      <section className={`rounded-2xl border p-4 sm:p-5 ${
                        cycleCompleted
                          ? "border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/20"
                          : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                      }`}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-gray-900 dark:text-white">
                              {isOriginal ? "Original Cycle" : `Recycle ${displayedIncomeCycle}`}
                            </p>
                            {displayedCycle && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Matrix ID {displayedCycle.matrixId.toString()} · Position {displayedCycle.positionId.toString()}
                              </p>
                            )}
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            cycleCompleted
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          }`}>
                            {cycleCompleted ? "Completed" : `Current · ${completed}/14`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                          {INCOME_ID_RULES.map((rule) => {
                            const bitmapComplete = displayedCycle
                              ? (displayedCycle.processedIdsBitmap & (1 << (rule.id - 1))) !== 0
                              : false;
                            const slotEntry = selectedSlot > 1
                              ? slotIncomeEntries
                                  .filter((entry) =>
                                    entry.owner === rootUser.wallet &&
                                    entry.slotNumber === selectedSlot &&
                                    entry.cycle === displayedIncomeCycle &&
                                    entry.position === rule.id,
                                  )
                                  .sort((left, right) => Number(right.assignedAt - left.assignedAt))[0]
                              : undefined;
                            const paymentEvent = selectedSlot === 1
                              ? allProgramPaymentEvents
                                  .filter((event) =>
                                    event.incomeTreeOwner === rootUser.wallet &&
                                    event.incomeTreeCycle === displayedIncomeCycle &&
                                    event.incomeTreePosition === rule.id,
                                  )
                                  .sort((left, right) => Number(right.timestamp - left.timestamp))[0]
                              : undefined;
                            const routing = slotEntry
                              ? cycleRouting(slotEntry.member, slotEntry.recipient, slotEntry.amountSol, slotEntry.eventType, rootUser.wallet)
                              : paymentEvent
                                ? cycleRouting(paymentEvent.payer, paymentEvent.recipient, paymentEvent.amountSol, paymentEvent.eventType, rootUser.wallet)
                                : null;
                            const complete = bitmapComplete || routing !== null;
                            return (
                              <div key={rule.id} className={`rounded-lg border p-3 ${complete ? "border-emerald-300 bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-950/30"}`}>
                                <p className="text-xs font-semibold text-gray-900 dark:text-white">Income position {rule.id}</p>
                                <p className="mt-1 text-xs font-semibold text-gray-600 dark:text-gray-300">{complete ? routing?.label ?? "Processed" : "Waiting"}</p>
                                {routing && (
                                  <div className="mt-2 space-y-1 border-t border-emerald-200 pt-2 text-[10px] leading-4 text-gray-600 dark:border-emerald-900 dark:text-gray-300">
                                    <p><span className="font-semibold">Generated by:</span> {formatCycleWallet(routing.source, usersByWallet)}</p>
                                    <p><span className="font-semibold">Amount:</span> {formatSol(routing.amountSol)}</p>
                                    <p><span className="font-semibold">Income went to:</span> {routing.destination}</p>
                                    {routing.wallet && <p className="break-all font-mono text-[9px] text-gray-500" title={routing.wallet}>{routing.wallet}</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  );
                })()}
                </div>
              </ComponentCard>
            )}

            {mode !== "direct" && paymentEvents.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                <p className="font-semibold">No confirmed personal income payments exist for this wallet.</p>
                <p className="mt-1">
                  Income appears after a completed cycle pays the recipient wallet. Older pending balances remain available through Withdraw Previous Balance.
                </p>
              </div>
            )}

            {mode === "direct" && (
              <ComponentCard
                title="Direct-referral commission flow"
                desc="Directs 1–3 fill the sponsor's matrix positions. From direct 4 onward, the 30 USDT joining payment follows the contract's direct-commission path: 27 USDT to the sponsor and 3 USDT to treasury."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((index) => {
                    const row = directRows[index];
                    const commissionPosition = index >= 3;
                    const commission = row
                      ? paymentEvents.find(event => event.eventType === 2 && event.payer === row.user.wallet)
                      : undefined;
                    return (
                      <div
                        key={index}
                        className={`rounded-xl border p-5 ${
                          row
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                            : "border-dashed border-gray-200 dark:border-gray-800"
                        }`}
                      >
                        <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Direct referral {index + 1}
                        </p>
                        <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                          {row ? `User ID ${row.user.userId}` : "Open position"}
                        </p>
                        <p className="mt-2 break-all font-mono text-xs text-gray-500 dark:text-gray-400">
                          {row?.user.wallet ?? "Waiting for direct referral"}
                        </p>
                        <p className="mt-3 font-semibold text-brand-500">
                          {row
                            ? commissionPosition
                              ? commission ? `${formatSol(commission.amountSol)} commission confirmed` : "No commission event recorded"
                              : "Matrix-position direct"
                            : commissionPosition ? "Waiting for commission-qualified direct" : "Open matrix-funding direct"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ComponentCard>
            )}

            {mode === "level" && (
            <ComponentCard
              title="Confirmed matrix income credits"
              desc="Actual credits emitted by the current contract. This contract pays whole slot-cycle and direct-commission amounts; it has no legacy per-ID income model."
            >
              {paymentEvents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No confirmed matrix income credits exist for this wallet yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[620px] divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-white/[0.03]"><tr><Th>Credit type</Th><Th>Slot</Th><Th>Amount</Th><Th>Source</Th></tr></thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                      {paymentEvents.map((event) => (
                        <tr key={event.matrixId.toString()}>
                          <Td>{event.eventType === 2 ? "Direct commission" : "Matrix cycle income"}</Td>
                          <Td>{event.slotNumber}</Td>
                          <Td>{formatSol(event.amountSol)}</Td>
                          <Td mono>{event.payer === "0x0000000000000000000000000000000000000000" ? "Cycle credit" : event.payer}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ComponentCard>
            )}

            {mode === "slot" && (
              <ComponentCard
                title={`Slot ${selectedSlot} Income Matrix`}
                desc={isLegacyMatrixWallet(rootUser.wallet)
                  ? "Referral-derived legacy positions based on active member level and registration order. Display only; no income or balance is created."
                  : "Actual three-position FIFO placements from contract state and SlotActivated events. Each slot has an independent tree."}
              >
                <div className="w-full overflow-x-auto pb-2">
                  <div className="min-w-full">
                    <ContractSlotTree wallet={rootUser.wallet} slot={selectedSlot} />
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[620px] divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-white/[0.03]">
                      <tr>
                        <Th>Matrix position</Th>
                        <Th>User ID</Th>
                        <Th>Wallet address</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                      {displayedMatrixMembers.map((member) => (
                        <tr key={`${displayedIncomeCycle}-${member.position}-${member.wallet}`}>
                          <Td>{member.position === 0 ? "Tree owner" : `Position ${member.position}`}</Td>
                          <Td>{member.user ? member.user.userId.toString() : "Unknown"}</Td>
                          <Td mono>{member.wallet}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ComponentCard>
            )}

            {mode !== "slot" && (
              <ComponentCard title={mode === "direct" ? "Direct Income Sources" : "Level Income Sources"}>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="min-w-[760px] divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-white/[0.03]">
                      <tr>
                        <Th>Level</Th>
                        <Th>User ID</Th>
                        <Th>Wallet</Th>
                        <Th>Parent</Th>
                        <Th>{mode === "direct" ? "Referral Type" : "Projected Income"}</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                      {(mode === "direct" ? directRows : teamRows).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No income sources found for this wallet yet.
                          </td>
                        </tr>
                      ) : (
                        (mode === "direct" ? directRows : teamRows).map((row) => (
                          <tr key={`${row.level}-${row.user.wallet}`}>
                            <Td>{row.level}</Td>
                            <Td>{row.user.userId.toString()}</Td>
                            <Td mono>{row.user.wallet}</Td>
                            <Td mono>{row.parent}</Td>
                            <Td>
                              {mode === "direct"
                                ? directRows.indexOf(row) < 3
                                  ? `Matrix direct ${directRows.indexOf(row) + 1}`
                                  : `Commission direct ${directRows.indexOf(row) + 1}`
                                : formatSol(currentRule.perIdIncomeSol)}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </ComponentCard>
            )}
          </>
        )}
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 break-all text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function StatusMessage({ status, message }: { status: LoadState; message: string }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        status === "error"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
      }`}
    >
      {message}
    </div>
  );
}

function cycleRouting(
  source: string,
  recipient: string,
  amountSol: number,
  eventType: number,
  owner: string,
) {
  if (eventType === 8) {
    return { source, amountSol, label: "Historical membership restored", destination: "No duplicate USDT transfer", wallet: null as string | null };
  }
  if (eventType === 3) {
    return { source, amountSol, label: "Next-slot upgrade reserve", destination: "Contract upgrade reserve for this slot owner", wallet: null as string | null };
  }
  if (eventType === 6) {
    return { source, amountSol, label: "Royal pool allocation", destination: "Protocol royal pool", wallet: null as string | null };
  }
  if (eventType === 7) {
    return { source, amountSol, label: "Recycle reserve", destination: "Contract recycle reserve for this slot owner", wallet: null as string | null };
  }
  const paidToOwner = recipient === owner;
  const paidToRoot = recipient === DEFAULT_REFERRER.toBase58();
  const label = eventType === 5
    ? "Team allocation paid"
    : paidToOwner
      ? "Paid to slot owner"
      : paidToRoot
        ? "Paid to root wallet"
        : "Paid to routed upline wallet";
  const destination = paidToOwner
    ? "Slot owner's wallet"
    : paidToRoot
      ? "Root wallet"
      : "Eligible routed upline wallet";
  return { source, amountSol, label, destination, wallet: recipient };
}

function formatCycleWallet(wallet: string, usersByWallet: Map<string, SolTrustUserAccount>) {
  const user = usersByWallet.get(wallet);
  return user ? `User ID ${user.userId.toString()} · ${shortWallet(wallet)}` : shortWallet(wallet);
}

function shortWallet(wallet: string) {
  return wallet.length <= 15 ? wallet : `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400 sm:px-5">
      {children}
    </th>
  );
}

function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      className={`px-3 py-3 text-sm text-gray-700 dark:text-gray-300 sm:px-5 sm:py-4 ${
        mono ? "break-all font-mono" : ""
      }`}
    >
      {children}
    </td>
  );
}
