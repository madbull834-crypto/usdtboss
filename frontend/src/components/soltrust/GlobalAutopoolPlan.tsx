import { useEffect, useState } from "react";
import { getGlobalPoolLevelProgress, type GlobalPoolLevelProgress } from "../../evm/client";
import {
  formatSol,
  GLOBAL_AUTOPOOL_LEVELS,
  GLOBAL_AUTOPOOL_PLAN_TOTAL,
  type GlobalAutopoolLevelRule,
} from "../../evm/plan";

const LEVEL_COLORS = ["#00A58E", "#8A35B8", "#1478D4", "#F08A00", "#E52D82", "#0A8F48"];

type Props = {
  wallet: string;
  poolJoined: boolean;
  poolLevel: number;
  legacyPoolLevel: number;
};

export default function GlobalAutopoolPlan({ wallet, poolJoined, poolLevel, legacyPoolLevel }: Props) {
  const [openLevel, setOpenLevel] = useState(1);
  const [progress, setProgress] = useState<GlobalPoolLevelProgress[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (!wallet) {
        setProgress([]);
        setError("");
        return;
      }
      void getGlobalPoolLevelProgress(wallet).then(result => {
        if (live) { setProgress(result); setError(""); }
      }).catch(reason => {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("boss:updated", refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("boss:updated", refresh);
    };
  }, [wallet]);

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-[#1595A1] bg-[#071110] text-white shadow-[0_12px_38px_rgba(0,141,255,.14)]">
      <div className="bg-gradient-to-r from-[#006DFF] via-[#00A34A] to-[#F4A11B] px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/80">Direct · 2 + 5 Growth System</p>
            <h2 className="mt-1 text-2xl font-black sm:text-3xl">Auto Global Pool Income Plan</h2>
            <p className="mt-2 text-sm font-semibold text-white/90">Level 1 to Level 6 · Starting amount 20 USDT</p>
          </div>
          <div className="rounded-xl border border-white/35 bg-black/25 px-4 py-3 text-right backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Plan income shown</p>
            <p className="text-xl font-black">{formatSol(GLOBAL_AUTOPOOL_PLAN_TOTAL)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-5">
        {GLOBAL_AUTOPOOL_LEVELS.map(rule => {
          const detailsOpen = openLevel === rule.level;
          const liveProgress = progress.find(item => item.level === rule.level);
          const status = levelStatus(rule.level, poolJoined, poolLevel, legacyPoolLevel);
          const color = LEVEL_COLORS[rule.level - 1];
          return (
            <article key={rule.level} className="overflow-hidden rounded-xl border bg-[#0A1414]" style={{ borderColor: color }}>
              <div className="grid items-center gap-3 p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl font-black" style={{ background: color }}>
                    {rule.level}
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase text-[#B7DDE0]">Level {rule.level}</p>
                    <p className="text-lg font-black">{formatSol(rule.entry)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                  <MiniMetric label="Tree 1 target" value={formatSol(rule.growthTree1Total)} />
                  <MiniMetric label="Plan income" value={formatSol(rule.planIncome)} />
                  <MiniMetric label="Net after fee" value={formatSol(rule.netWalletIncome)} className="col-span-2 sm:col-span-1" />
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-extrabold uppercase ${status.className}`}>
                  {status.label}
                </span>
                <button
                  type="button"
                  aria-expanded={detailsOpen}
                  aria-controls={`global-autopool-level-${rule.level}`}
                  onClick={() => setOpenLevel(detailsOpen ? 0 : rule.level)}
                  className="rounded-lg border px-4 py-2 text-sm font-extrabold transition hover:bg-white/10"
                  style={{ borderColor: color, color }}
                >
                  {detailsOpen ? "Close" : "Open Level"}
                </button>
              </div>

              {detailsOpen && (
                <div id={`global-autopool-level-${rule.level}`} className="border-t border-white/10 bg-black/20 p-3 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <GrowthStage
                      title="Growth Tree 1"
                      subtitle="2 positions complete this tree"
                      count={2}
                      filled={liveProgress?.growthTree1Filled ?? 0}
                      amount={rule.entry}
                      total={rule.growthTree1Total}
                      color={color}
                    />
                    <GrowthStage
                      title="Growth Tree 2"
                      subtitle="5 positions complete the income cycle"
                      count={5}
                      filled={liveProgress?.growthTree2Filled ?? 0}
                      amount={rule.growthTree2Position}
                      total={rule.grossCycle}
                      color={color}
                    />
                  </div>
                  <IncomeBreakdown rule={rule} color={color} />
                  {rule.level > poolLevel && (
                    <p className="mt-4 rounded-lg border border-[#765D22] bg-[#2B240F] px-3 py-2 text-xs text-[#FFE0A3]">
                      {poolJoined
                        ? `This level opens automatically after Level ${rule.level - 1} completes. No manual payment is required.`
                        : rule.level === 1
                          ? "Join the Global Pool from Wallet & Income to activate Level 1."
                          : "Join Level 1 first. Later levels open automatically as each previous cycle completes."}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <p role="status" className="mx-5 mb-5 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">Live tree progress could not be refreshed: {error}</p>}
      <p className="border-t border-[#123A3E] px-5 py-3 text-[11px] text-[#7FD3D9]">
        Plan income is the artwork figure before the contract's 10% admin fee. “Net after fee” is the amount credited to the wallet when that level completes.
      </p>
    </section>
  );
}

function levelStatus(level: number, joined: boolean, liveLevel: number, legacyLevel: number) {
  if (joined && level < liveLevel) return { label: "Completed", className: "bg-blue-500/20 text-blue-200" };
  if (joined && level === liveLevel) return { label: "Active", className: "bg-emerald-500/20 text-emerald-300" };
  if (!joined && level <= legacyLevel) return { label: "Historical", className: "bg-cyan-500/20 text-cyan-200" };
  if ((joined && level === liveLevel + 1) || (!joined && level === 1)) {
    return { label: "Next", className: "bg-amber-500/20 text-amber-200" };
  }
  return { label: "Locked", className: "bg-slate-500/20 text-slate-300" };
}

function MiniMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className={`rounded-lg bg-white/5 px-2 py-2 ${className}`}><p className="text-[9px] font-bold uppercase text-[#7FD3D9]">{label}</p><p className="mt-1 text-xs font-extrabold sm:text-sm">{value}</p></div>;
}

function GrowthStage({ title, subtitle, count, filled, amount, total, color }: {
  title: string; subtitle: string; count: number; filled: number; amount: number; total: number; color: string;
}) {
  return (
    <div className="rounded-xl border border-[#123A3E] bg-[#071110] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-black">{title}</h3><p className="text-xs text-[#7FD3D9]">{subtitle}</p></div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-extrabold">{Math.min(filled, count)}/{count}</span>
      </div>
      <div className="mt-5 flex flex-col items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full text-xs font-black text-white" style={{ background: color }}>YOU</span>
        <span className="h-5 w-px" style={{ background: color }} />
        <div className="flex w-full max-w-md justify-center gap-3 sm:gap-5">
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className="flex min-w-0 flex-col items-center gap-1">
              <span className="h-3 w-px" style={{ background: color }} />
              <span className="h-7 w-7 rounded-full border-2" style={{ borderColor: color, background: index < filled ? color : "#101D1C" }} />
              <span className="text-[9px] font-bold text-[#B7DDE0]">{formatSol(amount)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-extrabold" style={{ color }}>Total: {formatSol(total)}</p>
    </div>
  );
}

function IncomeBreakdown({ rule, color }: { rule: GlobalAutopoolLevelRule; color: string }) {
  return (
    <div className="mt-4 grid gap-2 rounded-xl border border-[#123A3E] bg-[#071110] p-4 sm:grid-cols-4">
      <MiniMetric label="Cycle gross" value={formatSol(rule.grossCycle)} />
      <MiniMetric label={rule.nextLevelReserve ? "Next-level reserve" : "Final-level reserve"} value={formatSol(rule.nextLevelReserve)} />
      <MiniMetric label="Admin fee (10%)" value={formatSol(rule.adminFee)} />
      <div className="rounded-lg px-3 py-2 text-center" style={{ background: `${color}22` }}>
        <p className="text-[9px] font-bold uppercase text-[#B7DDE0]">Wallet income</p>
        <p className="mt-1 text-sm font-black" style={{ color }}>{formatSol(rule.netWalletIncome)}</p>
      </div>
    </div>
  );
}
