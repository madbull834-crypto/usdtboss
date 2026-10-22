import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "../../evm/address";
import PageMeta from "../../components/common/PageMeta";
import {
  calculateRoyalPoolPayouts,
  connection,
  getAllSolTrustUsers,
  getProtocolConfig,
  getRoyalPool,
  isRoyalPoolEligible,
  evmProvider,
  ROYAL_POOL_SLOTS,
  type SolTrustRoyalPool,
  type SolTrustUserAccount,
} from "../../evm/client";

const sol = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 9 })} USDT`;
const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;

export default function RoyalPoolPage() {
  const rpc = useMemo(() => connection(), []);
  const [users, setUsers] = useState<SolTrustUserAccount[]>([]);
  const [pool, setPool] = useState<SolTrustRoyalPool | null>(null);
  const [authority, setAuthority] = useState("");
  const [rootWallet, setRootWallet] = useState("");
  const [wallet, setWallet] = useState<PublicKey | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [allUsers, royalPool, config] = await Promise.all([
        getAllSolTrustUsers(rpc), getRoyalPool(rpc), getProtocolConfig(rpc),
      ]);
      setUsers(allUsers);
      setPool(royalPool);
      setAuthority(config.authority);
      setRootWallet(config.creator);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [rpc]);

  useEffect(() => { void load(); }, [load]);

  const candidates = users.filter((user) => isRoyalPoolEligible(user, rootWallet));
  const payouts = useMemo(() => calculateRoyalPoolPayouts(
    BigInt(Math.round((pool?.currentBalanceSol ?? 0) * 1_000_000_000)),
    users,
    rootWallet,
  ), [pool?.currentBalanceSol, rootWallet, users]);
  const slotGroups = useMemo(() => ROYAL_POOL_SLOTS.map((slotNumber) => {
    const slotMask = 1 << (slotNumber - 1);
    const eligible = users
      .filter((user) =>
        user.wallet !== rootWallet
        && !user.exited
        && (user.activeSlotBitmap & slotMask) !== 0
      )
      .sort((left, right) => left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0);
    const root = users.find((user) => user.wallet === rootWallet) ?? null;
    return {
      slotNumber,
      wallets: eligible.length > 0 ? eligible : root ? [root] : [],
      fallbackToRoot: eligible.length === 0,
    };
  }), [rootWallet, users]);
  const isAdmin = Boolean(wallet && authority && wallet.toBase58() === authority);

  const connect = async () => {
    const provider = evmProvider();
    if (!provider) return setMessage("EVM wallet was not found.");
    const connected = await provider.connect();
    setWallet(new PublicKey(connected.publicKey.toString()));
  };

  const distribute = async () => {
    setMessage("Royal Pool distribution is not available in the EVM contract.");
  };

  return (
    <>
      <PageMeta title="Royal Pool | SolVault" description="Recycle deposits, qualification and distribution" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Royal Pool</h1><p className="text-sm text-gray-500">All recycle deposits and distribution controls in one place.</p></div>
          <div className="flex gap-2"><button className="rounded-lg border px-4 py-2 text-sm dark:border-gray-700" onClick={() => void load()}>{busy ? "Loading…" : "Refresh"}</button><button className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white" onClick={() => void connect()}>{wallet ? short(wallet.toBase58()) : "Connect admin"}</button></div>
        </div>

        {message && <div className="break-all rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700 dark:border-brand-900 dark:bg-brand-950/30 dark:text-brand-300">{message}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Pool balance" value={sol(pool?.currentBalanceSol ?? 0)} />
          <Metric label="Recycle deposits" value={sol(pool?.totalDepositedSol ?? 0)} />
          <Metric label="Distributed" value={sol(pool?.totalDistributedSol ?? 0)} />
          <Metric label="Qualification candidates" value={String(candidates.length)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {slotGroups.map((group) => (
            <section
              key={group.slotNumber}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">Slot {group.slotNumber}</p>
                  <p className="text-xs text-gray-500">25% Royal Pool allocation</p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  {group.wallets.length} wallet{group.wallets.length === 1 ? "" : "s"}
                </span>
              </div>
              {group.fallbackToRoot && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  No eligible member — allocation goes to root
                </p>
              )}
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {group.wallets.map((user) => (
                  <div key={user.wallet} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      User ID {user.userId.toString()}{user.wallet === rootWallet ? " · Root" : ""}
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                      {user.wallet}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pool qualification candidates</h2>
          <p className="mb-4 text-sm text-amber-600">The pool is split equally across Slots 3, 6, 9 and 12. A wallet receives one share for every milestone slot it has activated; empty groups go to root.</p>
          <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="border-b dark:border-gray-800"><tr><Th>User ID</Th><Th>Wallet</Th><Th>Directs</Th><Th>Current slot</Th></tr></thead><tbody>{candidates.map((user) => <tr className="border-b dark:border-gray-800" key={user.wallet}><Td>{user.userId.toString()}</Td><Td>{short(user.wallet)}</Td><Td>{user.directReferralCount}</Td><Td>{user.currentSlot}</Td></tr>)}</tbody></table></div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Admin distribution</h2>
          <p className="mb-4 text-sm text-gray-500">Only the on-chain authority can distribute. All {payouts.length} calculated slot payment(s) are simulated and sent in safe transaction batches.</p>
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" disabled={!isAdmin || payouts.length === 0} onClick={() => void distribute()}>Distribute complete pool</button>
        </section>

      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs uppercase text-gray-500">{label}</p><p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-3 py-3 text-xs uppercase text-gray-500">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{children}</td>; }
