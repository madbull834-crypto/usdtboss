import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { evmProvider } from "../../evm/client";
import { formatSol } from "../../evm/plan";

type RawGrowth = {
  tree: 1 | 2; sourceId: number; account: string; parent: string;
  generationId: number; position: number; level: number;
  position1Income: number; position2Income: number;
};
type GrowthRow = RawGrowth & { depth: number; userId: string; directCount: number };
type Trees = Record<1 | 2, GrowthRow[]>;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function GlobalData() {
  const [wallet, setWallet] = useState(evmProvider()?.publicKey?.toString() ?? "");
  const [trees, setTrees] = useState<Trees>({ 1: [], 2: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const updated = () => setWallet(evmProvider()?.publicKey?.toString() ?? "");
    window.addEventListener("boss:updated", updated);
    updated();
    return () => window.removeEventListener("boss:updated", updated);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/data/legacy-growth-payload.json").then(response => {
        if (!response.ok) throw new Error("Could not load the verified growth payload.");
        return response.json() as Promise<{ records: RawGrowth[] }>;
      }),
      fetch("/data/legacy-identities-payload.json").then(response => {
        if (!response.ok) throw new Error("Could not load the legacy user identities.");
        return response.json() as Promise<{ wallet: string; userid: string }[]>;
      }),
    ]).then(([payload, identities]) => {
      const ids = new Map(identities.map(row => [row.wallet.toLowerCase(), row.userid]));
      const buildTree = (tree: 1 | 2): GrowthRow[] => {
        const records = payload.records.filter(record => record.tree === tree);
        const byParent = new Map<string, RawGrowth[]>();
        records.forEach(record => {
          const key = record.parent.toLowerCase();
          byParent.set(key, [...(byParent.get(key) ?? []), record]);
        });
        // Prefer the connected historical member's downline. New/unconnected
        // wallets still get the complete global tree instead of an empty page.
        const walletRoot = wallet
          ? records.find(record => record.account.toLowerCase() === wallet.toLowerCase())
          : undefined;
        const root = walletRoot
          ?? records.find(record => record.parent.toLowerCase() === ZERO_ADDRESS)
          ?? records[0];
        if (!root) return [];
        const rows: GrowthRow[] = [];
        const seen = new Set<string>();
        let frontier = [{ record: root, depth: 0 }];
        while (frontier.length) {
          const next: typeof frontier = [];
          frontier.forEach(({ record, depth }) => {
            const key = record.account.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const children = byParent.get(key) ?? [];
            rows.push({ ...record, depth, userId: ids.get(key) ?? "—", directCount: children.length });
            children.forEach(child => next.push({ record: child, depth: depth + 1 }));
          });
          frontier = next;
        }
        return rows;
      };
      if (active) setTrees({ 1: buildTree(1), 2: buildTree(2) });
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [wallet]);

  const usersByWallet = useMemo(
    () => new Map([...trees[1], ...trees[2]].map(row => [row.account.toLowerCase(), row])),
    [trees],
  );

  return (
    <>
      <PageMeta title="USDT BOSS — Global Data" description="Historical global growth genealogy" />
      <div className="min-h-screen space-y-6 bg-[#000806] p-4 text-white sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7FD3D9]">Genealogy</p>
          <h1 className="mt-1 text-2xl font-extrabold">Global Data</h1>
          <p className="mt-2 text-sm text-[#7FD3D9]">
            Previous-platform growth records stored on-chain by V5. Connected historical members see their downline; otherwise the complete global tree is shown.
          </p>
        </div>

        {loading && <Notice>Loading both global growth trees from BSC testnet…</Notice>}
        {error && <Notice error>{error}</Notice>}

        {([1, 2] as const).map(tree => {
          const rows = trees[tree];
          const root = rows[0];
          return (
            <section key={tree} className="overflow-hidden rounded-xl border border-[#1595A1] bg-[#0A1414]">
              <div className="border-b border-[#1595A1] bg-[#00505C] p-4">
                <h2 className="text-lg font-extrabold">Growth Tree {tree}</h2>
                {root ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Metric label={wallet && root.account.toLowerCase() === wallet.toLowerCase() ? "Your level" : "Root level"} value={String(root.level)} />
                    <Metric label={wallet && root.account.toLowerCase() === wallet.toLowerCase() ? "Your position" : "Root position"} value={String(root.position)} />
                    <Metric label="Direct growth" value={String(root.directCount)} />
                    <Metric label="Total downline" value={String(Math.max(0, rows.length - 1))} />
                    <Metric label="Position income" value={formatSol((root.position1Income + root.position2Income) / 1_000_000)} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[#B7DDE0]">
                    {wallet && !loading ? "This wallet has no historical record in this tree." : "Waiting for wallet data."}
                  </p>
                )}
              </div>

              {root && (
                <>
                  <div className="border-b border-[#123A3E] p-4">
                    <GrowthTree rows={rows} connectedWallet={wallet} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                    <thead className="bg-[#003D46] text-[#B7DDE0]">
                      <tr><Th>Depth</Th><Th>User ID</Th><Th>Wallet</Th><Th>Parent</Th><Th>Level</Th><Th>Position</Th><Th>Directs</Th><Th>Income</Th></tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const parent = usersByWallet.get(row.parent.toLowerCase());
                        return (
                          <tr key={`${tree}-${row.account}`} className="border-t border-[#123A3E] odd:bg-[#081111]">
                            <Td>{row.depth}</Td>
                            <Td>{row.userId}</Td>
                            <Td mono>{row.account}</Td>
                            <Td>{row.depth === 0 ? "Tree root" : parent?.userId ? `User ${parent.userId}` : row.parent}</Td>
                            <Td>{row.level}</Td><Td>{row.position}</Td><Td>{row.directCount}</Td>
                            <Td>{formatSol((row.position1Income + row.position2Income) / 1_000_000)}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#1595A1] bg-[#004E59] p-3"><p className="text-[10px] font-bold uppercase text-[#7FD3D9]">{label}</p><p className="mt-1 text-lg font-extrabold">{value}</p></div>;
}
function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div role="status" className={`rounded-lg border p-4 text-sm ${error ? "border-red-700 bg-red-950/30 text-red-300" : "border-[#1595A1] bg-[#004E59] text-[#B7DDE0]"}`}>{children}</div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 font-bold uppercase">{children}</th>; }
function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <td className={`px-4 py-3 ${mono ? "font-mono text-[10px]" : ""}`}>{children}</td>; }

type GrowthNode = GrowthRow & { children: GrowthNode[] };

function GrowthTree({ rows, connectedWallet }: { rows: GrowthRow[]; connectedWallet: string }) {
  const [focusWallet, setFocusWallet] = useState(rows[0]?.account ?? "");
  const rootWallet = rows[0]?.account ?? "";

  // Reset focus when switching wallet/account or when this tree is reloaded.
  useEffect(() => setFocusWallet(rootWallet), [rootWallet]);

  const { byWallet, childrenByParent } = useMemo(() => {
    const nodes = new Map(rows.map(row => [row.account.toLowerCase(), { ...row, children: [] } as GrowthNode]));
    const children = new Map<string, GrowthNode[]>();
    nodes.forEach(node => {
      const key = node.parent.toLowerCase();
      const siblings = children.get(key) ?? [];
      siblings.push(node);
      children.set(key, siblings);
    });
    children.forEach(siblings => siblings.sort((a, b) => a.position - b.position));
    return { byWallet: nodes, childrenByParent: children };
  }, [rows]);

  const focused = byWallet.get(focusWallet.toLowerCase()) ?? byWallet.get(rootWallet.toLowerCase());
  if (!focused) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Tree view</p>
          <p className="text-xs text-[#7FD3D9]">Select a member to open the next generations.</p>
        </div>
        {focused.account.toLowerCase() !== rootWallet.toLowerCase() && (
          <button type="button" onClick={() => setFocusWallet(rootWallet)} className="rounded-md border border-[#1595A1] px-3 py-1.5 text-xs font-bold hover:bg-[#004E59]">
            ← Back to tree root
          </button>
        )}
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max justify-center px-2 py-1">
          <GrowthBranch
            node={focused}
            childrenByParent={childrenByParent}
            connectedWallet={connectedWallet}
            level={0}
            maxDepth={3}
            root
            onOpen={setFocusWallet}
          />
        </div>
      </div>
    </div>
  );
}

function GrowthBranch({ node, childrenByParent, connectedWallet, level, maxDepth, root = false, onOpen }: {
  node: GrowthNode;
  childrenByParent: Map<string, GrowthNode[]>;
  connectedWallet: string;
  level: number;
  maxDepth: number;
  root?: boolean;
  onOpen: (wallet: string) => void;
}) {
  const children = childrenByParent.get(node.account.toLowerCase()) ?? [];
  const expanded = level < maxDepth && children.length > 0;
  const isConnected = Boolean(connectedWallet) && node.account.toLowerCase() === connectedWallet.toLowerCase();
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onOpen(node.account)}
        title={node.account}
        className={`flex w-36 flex-col items-center gap-1 rounded-lg border p-2.5 text-white transition hover:-translate-y-0.5 hover:border-[#7FD3D9] ${
          root ? "border-[#00C83C] bg-gradient-to-br from-[#008DFF] via-[#009E78] to-[#FFAB2E]" : isConnected ? "border-[#FFAB2E] bg-[#4B3510]" : "border-[#1595A1] bg-[#0A1414]"
        }`}
      >
        <span className="text-[10px] font-bold uppercase">{root ? "Tree root" : `Depth ${node.depth}`}{isConnected ? " · You" : ""}</span>
        <span className="text-sm font-extrabold">User {node.userId}</span>
        <span className="font-mono text-[10px] text-[#D5F2F4]">{shortWallet(node.account)}</span>
        <span className="text-[10px] text-[#FFE0A3]">Level {node.level} · Pos. {node.position} · {children.length} direct</span>
      </button>
      {!expanded && children.length > 0 && <span className="mt-1 text-[10px] text-[#7FD3D9]">Select to expand</span>}
      {expanded && (
        <>
          <div className="h-4 w-px bg-[#1595A1]" />
          <div className="flex">
            {children.map((child, index) => (
              <div key={child.account} className="relative flex flex-col items-center px-1.5">
                {index > 0 && <div className="absolute left-0 right-1/2 top-0 h-px bg-[#1595A1]" />}
                {index < children.length - 1 && <div className="absolute left-1/2 right-0 top-0 h-px bg-[#1595A1]" />}
                <div className="h-4 w-px bg-[#1595A1]" />
                <GrowthBranch node={child} childrenByParent={childrenByParent} connectedWallet={connectedWallet} level={level + 1} maxDepth={maxDepth} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}
