import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "../../evm/address";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import {
  DEFAULT_REFERRER,
  PROGRAM_ID,
  RPC_URL,
  connection,
  getSolTrustUserAccount,
  getAllSolTrustUsers,
  evmProvider,
  type SolTrustUserAccount,
} from "../../evm/client";
import {
  activeSlotNumbers,
  formatSol,
} from "../../evm/plan";

type LoadState = "idle" | "loading" | "success" | "error";

type TeamRow = {
  level: number;
  side: string;
  parent: string;
  user: SolTrustUserAccount;
};

export default function BasicLevel() {
  const [wallet, setWallet] = useState("");
  const [lookupWallet, setLookupWallet] = useState(DEFAULT_REFERRER.toBase58());
  const [rootUser, setRootUser] = useState<SolTrustUserAccount | null>(null);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [maxDepth, setMaxDepth] = useState(6);
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");
  const rpc = useMemo(() => connection(), []);

  useEffect(() => {
    const connectedWallet = evmProvider()?.publicKey?.toString();
    if (connectedWallet) {
      setWallet(connectedWallet);
      setLookupWallet(connectedWallet);
    }
  }, []);

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
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function loadLevelTeam() {
    setStatus("loading");
    setMessage("");
    setRootUser(null);
    setRows([]);

    let walletKey: PublicKey;
    try {
      walletKey = new PublicKey(lookupWallet.trim());
    } catch {
      setStatus("error");
      setMessage("Enter a valid wallet public key.");
      return;
    }

    try {
      const root = await getSolTrustUserAccount(rpc, walletKey);
      if (!root) {
        setStatus("error");
        setMessage("This wallet is not registered in the current SolTrust program.");
        return;
      }

      const loadedRows = await fetchLevels(root, maxDepth);
      setRootUser(root);
      setRows(loadedRows);
      setStatus("success");
      setMessage("Level team loaded from EVM contract events.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not load level team.");
    }
  }

  async function fetchLevels(root: SolTrustUserAccount, depth: number) {
    const loadedRows: TeamRow[] = [];
    const visited = new Set([root.wallet]);
    let frontier: SolTrustUserAccount[] = [root];
    const allUsers = await getAllSolTrustUsers(rpc);

    for (let level = 1; level <= depth && frontier.length > 0; level += 1) {
      const nextFrontier: SolTrustUserAccount[] = [];

      for (const parent of frontier) {
        const children = allUsers.filter(u=>u.referrer===parent.wallet).map((u,index)=>({wallet:u.wallet,side:String(index+1)}));

        for (const child of children) {
          if (!child.wallet || visited.has(child.wallet)) {
            continue;
          }
          const childUser = await getSolTrustUserAccount(rpc, new PublicKey(child.wallet));
          if (!childUser) {
            continue;
          }
          visited.add(child.wallet);
          loadedRows.push({
            level,
            side: child.side,
            parent: parent.wallet,
            user: childUser,
          });
          nextFrontier.push(childUser);
        }
      }

      frontier = nextFrontier;
    }

    return loadedRows;
  }

  const levelCounts = rows.reduce<Record<number, number>>((counts, row) => {
    counts[row.level] = (counts[row.level] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <>
      <PageMeta title="SolTrust Level Team" description="SolTrust level team view" />
      <div className="solvault-theme">
        <PageBreadcrumb pageTitle="Level Team" />
        <div className="space-y-6">
        <ComponentCard
          title="Level Team Lookup"
          desc="Load downstream users by recursively following each registered user's sponsor relationships."
        >
          <div className="grid gap-4 xl:grid-cols-[1fr_120px_auto_auto]">
            <input
              value={lookupWallet}
              onChange={(event) => setLookupWallet(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              placeholder="Wallet public key"
            />
            <select
              value={maxDepth}
              onChange={(event) => setMaxDepth(Number(event.target.value))}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((level) => (
                <option key={level} value={level}>
                  {level} levels
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadLevelTeam()}
              disabled={status === "loading"}
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {status === "loading" ? "Loading" : "Load Level Team"}
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
            <ComponentCard title="Level Summary">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Root User ID" value={rootUser.userId.toString()} />
                <Metric label="Total Team" value={String(rows.length)} />
                <Metric label="Loaded Levels" value={String(maxDepth)} />
                <Metric
                  label="Immediate Referrals"
                  value={String(rows.filter(row => row.parent === rootUser.wallet).length)}
                />
                <Metric
                  label="Current Slot Price"
                  value={formatSol(30 * 2 ** Math.max(0, rootUser.currentSlot - 1))}
                />
                <Metric
                  label="Active Slots"
                  value={activeSlotNumbers(rootUser.activeSlotBitmap).join(", ") || "None"}
                />
                <Metric label="Next Slot" value={rootUser.currentSlot < 12 ? String(rootUser.currentSlot + 1) : "Maximum reached"} />
              </div>

              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                {Array.from({ length: maxDepth }, (_, index) => index + 1).map((level) => (
                  <div
                    key={level}
                    className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                  >
                    <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      Level {level}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                      {levelCounts[level] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </ComponentCard>

            <ComponentCard title="Level Team Users">
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="min-w-[900px] divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-white/[0.03]">
                    <tr>
                      <Th>Level</Th>
                      <Th>Side</Th>
                      <Th>User ID</Th>
                      <Th>Wallet</Th>
                      <Th>Parent</Th>
                      <Th>Direct Referrals</Th>
                      <Th>Registered At</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                          No level team users found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={`${row.level}-${row.user.wallet}`}>
                          <Td>{row.level}</Td>
                          <Td>{row.side}</Td>
                          <Td>{row.user.userId.toString()}</Td>
                          <Td mono>{row.user.wallet}</Td>
                          <Td mono>{row.parent}</Td>
                          <Td>{rows.filter(child => child.parent === row.user.wallet).length}</Td>
                          <Td>{formatUnix(row.user.registeredAt)}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </ComponentCard>
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
      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
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

function formatUnix(value: bigint | undefined) {
  if (!value || value <= 0n) {
    return "-";
  }
  return new Date(Number(value) * 1000).toLocaleString();
}
