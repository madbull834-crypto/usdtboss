import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "../../evm/address";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import PlacementTreeView from "../../components/soltrust/PlacementTreeView";
import {
  DEFAULT_REFERRER,
  PROGRAM_ID,
  RPC_URL,
  buildPlacementTree,
  countPlacementTreeUsers,
  matrixPlacementOf,
  matrixPlacementsForWallet,
  isLegacyMatrixWallet,
  connection,
  formatUserOrdinal,
  getAllSolTrustUsers,
  getAllPaymentEvents,
  getMatrixPlacements,
  getUserMatrixProfile,
  evmProvider,
  type MatrixProfile,
  type MatrixPlacement,
  type PlacementTreeNode,
  type SolTrustUserAccount,
  type SolTrustPaymentEvent,
} from "../../evm/client";
import {
  CONTRIBUTION_SPLIT,
  SLOT_RULES,
  activeSlotNumbers,
  formatSol,
} from "../../evm/plan";

type LoadState = "idle" | "loading" | "success" | "error";

export default function LineChart() {
  const [wallet, setWallet] = useState("");
  const [lookupWallet, setLookupWallet] = useState(DEFAULT_REFERRER.toBase58());
  const [profile, setProfile] = useState<MatrixProfile | null>(null);
  const [matrixTree, setMatrixTree] = useState<PlacementTreeNode | null>(null);
  const [matrixUserCount, setMatrixUserCount] = useState(0);
  const [allMatrixUsers, setAllMatrixUsers] = useState<SolTrustUserAccount[]>([]);
  const [placements, setPlacements] = useState<MatrixPlacement[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<SolTrustPaymentEvent[]>([]);
  const [selectedMatrixSlot, setSelectedMatrixSlot] = useState(1);
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");

  const rpc = useMemo(() => connection(), []);
  const matrixUsersByWallet = useMemo(
    () => new Map(allMatrixUsers.map((user) => [user.wallet, user])),
    [allMatrixUsers],
  );
  // The owner's three real matrix positions in the selected slot. The sponsor
  // column is shown beside the matrix parent because spillover can make them
  // different users.
  const placementRows = useMemo(() => {
    const owner = profile?.user;
    if (!owner) return [];
    return matrixPlacementsForWallet(placements, owner.wallet)
      .filter((placement) => placement.slot === selectedMatrixSlot && placement.parent === owner.wallet)
      .sort((left, right) => left.position - right.position)
      .map((placement) => {
        const user = matrixUsersByWallet.get(placement.member) ?? null;
        const sponsorWallet = user?.referrer ?? "";
        return {
          position: placement.position,
          memberWallet: placement.member,
          user,
          sponsorWallet,
          sponsor: matrixUsersByWallet.get(sponsorWallet) ?? null,
          spillover: sponsorWallet !== owner.wallet,
        };
      });
  }, [placements, matrixUsersByWallet, profile?.user, selectedMatrixSlot]);

  // Where the looked-up wallet itself sits: the matrix parent whose cycle
  // received its payment for this slot.
  const ownPlacement = useMemo(() => {
    const owner = profile?.user;
    if (!owner) return null;
    const placement = matrixPlacementOf(placements, owner.wallet, selectedMatrixSlot);
    if (!placement) return null;
    return {
      placement,
      parent: matrixUsersByWallet.get(placement.parent) ?? null,
      sponsorMatches: placement.parent === owner.referrer,
    };
  }, [placements, matrixUsersByWallet, profile?.user, selectedMatrixSlot]);
  const selectedIncomeEvents = useMemo(() => {
    const selectedWallet = profile?.user.wallet;
    if (!selectedWallet) return [];
    return paymentEvents.filter(
      (event) =>
        event.slotNumber === selectedMatrixSlot &&
        event.recipient === selectedWallet,
    );
  }, [paymentEvents, profile?.user.wallet, selectedMatrixSlot]);

  const selectedIncomeSol = selectedIncomeEvents.reduce(
    (total, event) => total + event.amountSol,
    0,
  );

  useEffect(() => {
    const phantom = evmProvider();
    const connectedWallet = phantom?.publicKey?.toString();
    if (connectedWallet) {
      setWallet(connectedWallet);
      setLookupWallet(connectedWallet);
      // Load the connected wallet's tree straight away. Leaving the page idle
      // behind a button reads as "the matrix is not showing", because an empty
      // page looks identical to a member who has no placements.
      void loadMatrix(connectedWallet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectWallet() {
    const phantom = evmProvider();
    if (!phantom) {
      setStatus("error");
      setMessage(
        "EVM wallet was not found. Open this site over HTTPS in a browser with an EVM wallet installed."
      );
      return;
    }

    try {
      const response = await phantom.connect();
      const address = response.publicKey.toString();
      setWallet(address);
      setLookupWallet(address);
      setMessage("Wallet connected.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function loadMatrix(target = lookupWallet) {
    setStatus("loading");
    setMessage("");
    setProfile(null);
    setMatrixTree(null);
    setMatrixUserCount(0);
    setAllMatrixUsers([]);
    setPlacements([]);
    setPaymentEvents([]);

    let walletKey: PublicKey;
    try {
      walletKey = new PublicKey(target.trim());
    } catch {
      setStatus("error");
      setMessage("Enter a valid wallet public key.");
      return;
    }

    try {
      const [matrixProfile, allUsers, allPaymentEvents, allPlacements] = await Promise.all([
        getUserMatrixProfile(rpc, walletKey),
        getAllSolTrustUsers(rpc),
        getAllPaymentEvents(rpc),
        getMatrixPlacements(),
      ]);
      if (!matrixProfile) {
        setStatus("error");
        setMessage("This wallet is not registered in the current SolTrust program.");
        return;
      }
      setProfile(matrixProfile);
      setAllMatrixUsers(allUsers);
      setPaymentEvents(allPaymentEvents);
      setPlacements(allPlacements);
      showSlotMatrix(allUsers, allPlacements, selectedMatrixSlot, matrixProfile.user.wallet);
      setStatus("success");
      setMessage(isLegacyMatrixWallet(matrixProfile.user.wallet)
        ? "Account loaded. Legacy members use the referral-derived three-child matrix; new members use confirmed contract placements."
        : "Account loaded. The placement tree contains confirmed paid positions from the contract's three-child matrix.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not load matrix data.");
    }
  }

  function showSlotMatrix(
    users: SolTrustUserAccount[],
    allPlacements: MatrixPlacement[],
    slot: number,
    rootWallet: string,
  ) {
    const tree = buildPlacementTree(users, allPlacements, rootWallet, slot);
    setSelectedMatrixSlot(slot);
    setMatrixTree(tree);
    setMatrixUserCount(countPlacementTreeUsers(tree));
  }

  function changeMatrixSlot(slot: number) {
    if (!profile) return;
    showSlotMatrix(allMatrixUsers, placements, slot, profile.user.wallet);
    setMessage(`Showing the Slot ${slot} placement tree rooted at ${profile.user.wallet}.`);
  }

  return (
    <>
      <PageMeta
        title="SolTrust Matrix Team"
        description="SolTrust on-chain matrix team view"
      />
      <div className="solvault-theme">
        <PageBreadcrumb pageTitle="Matrix Team" />

        <div className="space-y-6">
        <ComponentCard
          title="Matrix Lookup"
          desc="View live contract placements or the referral-derived legacy three-child matrix for each active slot."
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
              onClick={() => void loadMatrix()}
              disabled={status === "loading"}
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {status === "loading" ? "Loading" : "Load Matrix"}
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

          {status === "error" && message && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {message}
            </div>
          )}
        </ComponentCard>

        {profile && (
          <>
            <ComponentCard title="On-chain member status">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="User ID" value={formatUserOrdinal(profile.user.userId)} />
                <Metric label="Highest slot" value={String(profile.user.currentSlot)} />
                <Metric label="Direct referrals" value={String(profile.user.directReferralCount)} />
                <Metric
                  label="Active Slots"
                  value={activeSlotNumbers(profile.user.activeSlotBitmap).join(", ") || "None"}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <AddressBlock title="Wallet" value={profile.user.wallet} />
                <AddressBlock title="Sponsor" value={profile.user.referrer} />
              </div>
            </ComponentCard>

            <ComponentCard title="30 USDT Contribution Split">
              <div className="grid gap-4 md:grid-cols-2">
                {CONTRIBUTION_SPLIT.map((item) => (
                  <div key={item.label} className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                    <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                      {item.percent}% / {formatSol(item.sol)}
                    </p>
                  </div>
                ))}
              </div>
            </ComponentCard>

            <ComponentCard
              title="Matrix Placement"
              desc={`Tree owner: ${formatUserOrdinal(profile.user.userId)}. Positions come from contract state and SlotActivated events for Slot ${selectedMatrixSlot}.`}
            >
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <Metric label="Matrix users shown" value={String(matrixUserCount)} />
                <Metric label="Income transactions" value={String(selectedIncomeEvents.length)} />
                <Metric label="Confirmed received" value={formatSol(selectedIncomeSol)} />
              </div>
              <div className="mb-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  This wallet's own position in Slot {selectedMatrixSlot}
                </p>
                {ownPlacement ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <Metric
                      label="Matrix parent (paid by this join)"
                      value={
                        ownPlacement.parent
                          ? formatUserOrdinal(ownPlacement.parent.userId)
                          : shortMatrixWallet(ownPlacement.placement.parent)
                      }
                    />
                    <Metric
                      label="Sponsor (referrer)"
                      value={
                        matrixUsersByWallet.get(profile.user.referrer)
                          ? formatUserOrdinal(matrixUsersByWallet.get(profile.user.referrer)!.userId)
                          : shortMatrixWallet(profile.user.referrer)
                      }
                    />
                    <Metric label="Position under parent" value={`${ownPlacement.placement.position} of 3`} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {formatUserOrdinal(profile.user.userId)} is not placed in Slot {selectedMatrixSlot}
                    {profile.user.referrer === "0x0000000000000000000000000000000000000000"
                      ? " (bootstrap account — it seeds every queue rather than being placed)."
                      : "."}
                  </p>
                )}
                {ownPlacement && !ownPlacement.sponsorMatches && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Spillover: this slot payment went toward the matrix parent's cycle. The sponsor relationship
                    remains recorded separately.
                  </p>
                )}
              </div>
              <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
                {SLOT_RULES.map((rule) => (
                  <button
                    key={rule.slot}
                    type="button"
                    onClick={() => changeMatrixSlot(rule.slot)}
                    disabled={allMatrixUsers.length === 0}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      selectedMatrixSlot === rule.slot
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Slot {rule.slot}
                  </button>
                ))}
              </div>
              <div className="w-full overflow-x-auto pb-2">
                <div className="min-w-full">
                  {matrixTree ? (
                    <PlacementTreeView
                      tree={matrixTree}
                      usersByWallet={matrixUsersByWallet}
                      ownerWallet={profile.user.wallet}
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {formatUserOrdinal(profile.user.userId)} is not active in Slot {selectedMatrixSlot}.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                <strong>Important:</strong> <code>join(sponsor)</code> records the direct sponsor. The paid
                matrix position starts under that sponsor, or uses the first open position in that sponsor's
                downline when its three positions are full. Automatic higher-slot placement can use the nearest
                active sponsor-chain ancestor. The connecting lines show matrix parents.
              </div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-[900px] divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-white/[0.03]">
                    <tr>
                      {['Position', 'User', 'Wallet', 'Matrix parent', 'Sponsor (referrer)', 'Relationship'].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                    {placementRows.map((row) => (
                      <tr key={row.memberWallet}>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">{row.position} of 3</td>
                        <td className="px-4 py-3 text-sm">{row.user ? formatUserOrdinal(row.user.userId) : "Unknown"}</td>
                        <td className="px-4 py-3 font-mono text-xs">{shortMatrixWallet(row.memberWallet)}</td>
                        <td className="px-4 py-3 text-sm">{formatUserOrdinal(profile.user.userId)}</td>
                        <td className="px-4 py-3 text-sm">{row.sponsor ? formatUserOrdinal(row.sponsor.userId) : shortMatrixWallet(row.sponsorWallet)}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.spillover ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Spillover</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Own referral</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {placementRows.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">Nobody has been placed under this wallet in Slot {selectedMatrixSlot} yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ComponentCard>

            <ComponentCard title="12-Slot Model">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                {SLOT_RULES.map((rule) => {
                  const active = activeSlotNumbers(profile.user.activeSlotBitmap).includes(rule.slot);
                  return (
                    <div
                      key={rule.slot}
                      className={`rounded-lg border p-4 ${
                        active
                          ? "border-brand-200 bg-brand-50 dark:border-brand-900/60 dark:bg-brand-950/20"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Slot {rule.slot}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Price: {formatSol(30 * 2 ** (rule.slot - 1))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </ComponentCard>
          </>
        )}
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-lg bg-gray-50 p-4 dark:bg-white/[0.03]"}>
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-medium text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function AddressBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <p className="mt-2 break-all font-mono text-sm text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function shortMatrixWallet(wallet: string) {
  if (wallet.length <= 13) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}
