import { useMemo, useState, type CSSProperties } from "react";
import type { SolTrustUserAccount } from "../../evm/client";

/** Genealogy (sponsor) tree: each member drawn under the wallet that referred
 * them, built from contract state so it does not depend on event history.
 * This is the referral relationship. It is distinct from paid matrix placement,
 * which can spill into the sponsor's downline. */
export default function SponsorTreeView({ users, rootWallet, depth = 3 }: {
  users: SolTrustUserAccount[];
  rootWallet: string;
  depth?: number;
}) {
  const [focus, setFocus] = useState(rootWallet);
  const byWallet = useMemo(() => new Map(users.map((u) => [u.wallet, u])), [users]);
  const directsOf = useMemo(() => {
    const map = new Map<string, SolTrustUserAccount[]>();
    for (const user of users) {
      if (user.wallet === user.referrer) continue;
      const list = map.get(user.referrer) ?? [];
      list.push(user);
      map.set(user.referrer, list);
    }
    return map;
  }, [users]);

  const root = byWallet.get(focus) ?? byWallet.get(rootWallet);
  if (!root) return <p style={{ color: "#7FD3D9", fontSize: "13px" }}>This wallet is not registered.</p>;

  return (
    <div>
      {root.wallet !== rootWallet && (
        <button type="button" onClick={() => setFocus(rootWallet)} style={backButton}>
          ← Back to my tree
        </button>
      )}
      <div style={{ overflowX: "auto", paddingBottom: "8px" }}>
        <div style={{ display: "flex", justifyContent: "center", minWidth: "max-content", padding: "4px 8px" }}>
          <Branch user={root} directsOf={directsOf} level={0} depth={depth} isRoot onOpen={setFocus} />
        </div>
      </div>
    </div>
  );
}

function Branch({ user, directsOf, level, depth, isRoot = false, onOpen }: {
  user: SolTrustUserAccount;
  directsOf: Map<string, SolTrustUserAccount[]>;
  level: number;
  depth: number;
  isRoot?: boolean;
  onOpen: (wallet: string) => void;
}) {
  const directs = directsOf.get(user.wallet) ?? [];
  const expanded = level < depth && directs.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => !isRoot && onOpen(user.wallet)}
        title={user.wallet}
        style={{ ...card, ...(isRoot ? rootCard : {}), cursor: isRoot ? "default" : "pointer" }}
      >
        <span style={{ fontSize: "10px", color: isRoot ? "#FFFFFF" : "#7FD3D9", fontWeight: 700, textTransform: "uppercase" }}>
          {isRoot ? "You / Root" : `Level ${level}`}
        </span>
        <span style={{ fontSize: "15px", fontWeight: 800 }}>ID {user.userId.toString()}</span>
        <span style={{ fontFamily: "monospace", fontSize: "10px", color: isRoot ? "#FFFFFF" : "#B8E6EA" }}>
          {user.wallet.slice(0, 6)}…{user.wallet.slice(-4)}
        </span>
        <span style={{ fontSize: "10px", color: isRoot ? "#FFFFFF" : "#FFB52E" }}>
          Slot {user.currentSlot} · {directs.length} direct{directs.length === 1 ? "" : "s"}
        </span>
      </button>
      {!expanded && directs.length > 0 && (
        <span style={{ marginTop: "4px", fontSize: "10px", color: "#7FD3D9" }}>Click to open</span>
      )}
      {expanded && (
        <>
          <div style={vLine} />
          <div style={{ display: "flex" }}>
            {directs.map((child, index) => (
              <div key={child.wallet} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 5px" }}>
                {index > 0 && <div style={{ ...hLine, left: 0, right: "50%" }} />}
                {index < directs.length - 1 && <div style={{ ...hLine, left: "50%", right: 0 }} />}
                <div style={vLine} />
                <Branch user={child} directsOf={directsOf} level={level + 1} depth={depth} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const card: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
  width: "132px", padding: "10px 8px", borderRadius: "8px",
  background: "#0A1414", border: "1px solid #1595A1", color: "#FFFFFF",
};
const rootCard: CSSProperties = {
  background: "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
  border: "1px solid #008DFF",
};
const vLine: CSSProperties = { width: "1px", height: "14px", background: "#1595A1" };
const hLine: CSSProperties = { position: "absolute", top: 0, height: "1px", background: "#1595A1" };
const backButton: CSSProperties = {
  marginBottom: "10px", padding: "6px 12px", borderRadius: "6px",
  background: "transparent", border: "1px solid #1595A1", color: "#FFFFFF", fontSize: "12px", cursor: "pointer",
};
