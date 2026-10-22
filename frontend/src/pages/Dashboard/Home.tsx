import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PublicKey } from "../../evm/address";
import { useAccountData } from "../../evm/useAccountData";
import PageMeta from "../../components/common/PageMeta";
import ContractActions from "../../components/soltrust/ContractActions";
import GlobalAutopoolPlan from "../../components/soltrust/GlobalAutopoolPlan";
import {
  connection,
  getAllPaymentEvents,
  getSolTrustUserAccount,
  evmProvider,
  type SolTrustPaymentEvent,
  type SolTrustUserAccount,
} from "../../evm/client";
import { formatSol } from "../../evm/plan";

export default function Home() {
  const account = useAccountData();
  const rpc = useMemo(() => connection(), []);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [wallet, setWallet] = useState<PublicKey | null>(null);
  const [currentUser, setCurrentUser] = useState<SolTrustUserAccount | null>(null);
  const [referrer, setReferrer] = useState("");
  const [copied, setCopied] = useState(false);
  const [paymentEvents, setPaymentEvents] = useState<SolTrustPaymentEvent[]>([]);

  const isMobile = windowWidth < 768;

  useEffect(() => {
    setCurrentUser(account.user);
    setPaymentEvents((account.data?.payments ?? []).filter(e=>e.recipient===account.wallet));
    setWallet(account.wallet ? new PublicKey(account.wallet) : null);
  },[account.data,account.wallet,account.user]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);

    // Set body background to black
    document.body.style.backgroundColor = "#000000";
    document.documentElement.style.backgroundColor = "#000000";
    document.body.style.margin = "0";
    document.body.style.padding = "0";

    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.style.backgroundColor = "";
      document.documentElement.style.backgroundColor = "";
      document.body.style.margin = "";
      document.body.style.padding = "";
    };
  }, []);

  useEffect(() => {
    const phantom = evmProvider();

    if (phantom?.publicKey) {
      setWallet(new PublicKey(phantom.publicKey.toString()));
    }

    const inviter = new URLSearchParams(window.location.search).get("ref");
    setReferrer(inviter?.trim() ?? "");
  }, []);

  useEffect(() => {
    let active = true;

    if (!wallet) {
      setCurrentUser(null);
      setPaymentEvents([]);
      return () => {
        active = false;
      };
    }

    void getSolTrustUserAccount(rpc, wallet)
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      });

    void getAllPaymentEvents(rpc)
      .then((all) => {
        if (active) {
          setPaymentEvents(
            all.filter((event) => event.recipient === wallet.toBase58())
          );
        }
      })
      .catch(() => {
        if (active) setPaymentEvents([]);
      });

    return () => {
      active = false;
    };
  }, [rpc, wallet]);

  // A user's referral link must always belong to the wallet that is connected
  // now. Never copy the root account, an incoming referral, or a stale wallet.
  const connectedWallet = account.wallet || wallet?.toBase58() || "";
  const inviteLink = connectedWallet
    ? `${window.location.origin}/register?ref=${encodeURIComponent(connectedWallet)}`
    : "";

  const handleCopy = () => {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const currentUserId = currentUser
    ? currentUser.userId.toString()
    : "—";

  // Credits are read from event history, which public RPCs sometimes refuse.
  // The on-chain pending balance is always readable. It can contain earnings
  // accrued before the immediate-payout upgrade.
  // Upgraded contracts keep lifetime income on-chain; use that when present.
  const onChainIncome = account.data?.income ?? null;
  const historyError = onChainIncome ? null : account.data?.historyError ?? null;
  const available = account.data?.available ?? 0;
  // Imported from the previous platform for display only. It is not
  // withdrawable and is never folded into totalIncome, which would imply the
  // contract owes it.
  const legacyIncome = account.data?.legacyIncome ?? 0;
  const legacyGlobalIncome = account.data?.legacyGlobalIncome ?? 0;
  const previousPlatformIncome = legacyIncome + legacyGlobalIncome;
  // Members who held a Global Pool position on the previous platform. They are
  // a historical record, not live pool positions, so they are shown beside the
  // live figure rather than added to it.
  const legacyPool = account.data?.legacyPool ?? 0;
  const legacyPoolLevel = account.data?.legacyPoolLevel ?? 0;
  const legacyGrowthTrees = account.data?.legacyGrowthTrees?.filter(tree => tree.imported) ?? [];
  const liveWorkingIncome = onChainIncome?.matrix ?? paymentEvents
    .filter((event) => event.cycleKind === 0)
    .reduce((sum, event) => sum + event.amountSol, 0);
  const liveNonWorkingIncome = onChainIncome?.global ?? paymentEvents
    .filter((event) => event.cycleKind === 2)
    .reduce((sum, event) => sum + event.amountSol, 0);
  const workingIncome = liveWorkingIncome + legacyIncome;
  const nonWorkingIncome = liveNonWorkingIncome + legacyGlobalIncome;
  // "Total Income" is the complete lifetime record: current-contract income
  // plus the explicitly imported previous-platform amount. Withdrawable stays
  // separate because imported history is not funded by this contract.
  const currentIncome = onChainIncome
    ? onChainIncome.matrix + onChainIncome.global
    : Math.max(liveWorkingIncome + liveNonWorkingIncome, available);
  const totalIncome = currentIncome + previousPlatformIncome;

  const levelHistory = [30, 60, 120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440];

  const activeSlots = currentUser
    ? levelHistory
        .map((_, index) => index + 1)
        .filter(
          (slot) =>
            (currentUser.activeSlotBitmap & (1 << (slot - 1))) !== 0
        )
    : [];

  return (
    <>
      <PageMeta
        title="USDT BOSS — Dashboard"
        description="USDT BOSS dashboard"
      />

      <div
        style={{
          minHeight: "100vh",
          background: "#000806",
          color: "#FFFFFF",
          padding: isMobile ? "10px" : "16px 20px 30px",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          overflowX: "hidden",
          margin: 0,
        }}
      >
        <div
          style={{
            color: "#FFFFFF",
            fontSize: isMobile ? "11px" : "13px",
            fontWeight: 800,
            marginBottom: "14px",
            letterSpacing: ".2px",
          }}
        >
          WELCOME TO USER ACCOUNT
        </div>

        {/* My Details + Invite Link */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1.25fr)",
            gap: isMobile ? "14px" : "18px",
            marginBottom: isMobile ? "18px" : "20px",
          }}
        >
          <div style={dashboardGradientCard(isMobile)}>
            <h1
              style={{
                margin: "0 0 10px",
                textAlign: "center",
                fontSize: isMobile ? "23px" : "28px",
                fontWeight: 800,
              }}
            >
              My Details
            </h1>

            <div
              style={{
                background: "#FFAA2F",
                border: "1px solid #008DFF",
                borderRadius: "8px",
                padding: isMobile ? "8px 12px" : "9px 14px",
              }}
            >
              <div style={detailRowStyle}>
                <span>User ID</span>
                <strong>{currentUserId}</strong>
              </div>
              <div style={detailRowStyle}>
                <span>Total Income</span>
                <strong>{formatSol(totalIncome)}</strong>
              </div>
              {previousPlatformIncome > 0 && (
                <div style={detailRowStyle}>
                  <span>Previous Platform</span>
                  <strong>{formatSol(previousPlatformIncome)}</strong>
                </div>
              )}
            </div>
          </div>

          <div style={dashboardInviteCard(isMobile)}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                background: "#050A09",
                border: "1px solid #008DFF",
                borderRadius: "15px",
                padding: "4px 6px 4px 10px",
              }}
            >
              <input
                type="text"
                value={inviteLink}
                placeholder="Connect wallet to create your referral link"
                readOnly
                aria-label="Invite link"
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#FFFFFF",
                  fontSize: isMobile ? "9px" : "11px",
                  fontWeight: 600,
                }}
              />

              <button
                type="button"
                onClick={handleCopy}
                disabled={!inviteLink}
                style={screenshotCopyButton(isMobile, copied)}
              >
                {copied ? "Copied" : inviteLink ? "Copy Link" : "Connect Wallet"}
              </button>
            </div>
          </div>
        </div>

        {/* Welcome */}
        <div style={welcomeBanner(isMobile)}>
          Welcome To USDT BOSS
        </div>

        {/* Four summary fields */}
        <ContractActions />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : previousPlatformIncome > 0
                ? "repeat(5, minmax(0, 1fr))"
                : "repeat(4, minmax(0, 1fr))",
            gap: isMobile ? "10px" : "18px",
            marginBottom: isMobile ? "26px" : "32px",
          }}
        >
          <SummaryCard
            title="Join Member"
            value={String(account.data?.totalMembers ?? account.users.length)}
          />
          <SummaryCard
            title="Live Global Pool Positions"
            value={String(account.data?.totalPool ?? 0)}
          />
          <SummaryCard title="WORKING INCOME" value={historyError ? "—" : formatSol(workingIncome)} />
          <SummaryCard title="NON-WORKING INCOME" value={historyError ? "—" : formatSol(nonWorkingIncome)} />
          {previousPlatformIncome > 0 && (
            <SummaryCard title="PREVIOUS PLATFORM" value={formatSol(previousPlatformIncome)} />
          )}
        </div>
        {legacyPool > 0 && (
          <p style={{ margin: "-14px 0 24px", color: "#7FD3D9", fontSize: "12px" }}>
            Previous-platform Global Pool records: <strong>{legacyPool}</strong>. Historical records are not added
            to the live position count, because the same wallet may exist in both categories.
          </p>
        )}
        {previousPlatformIncome > 0 && (
          <p style={{ margin: "-14px 0 24px", color: "#7FD3D9", fontSize: "12px" }}>
            <strong>Previous platform income ({formatSol(previousPlatformIncome)})</strong> is included in the
            Working and Non-Working totals: {formatSol(legacyIncome)} matrix + {formatSol(legacyGlobalIncome)} Global Pool.
            It is historical and is not withdrawable from this contract.
          </p>
        )}
        {historyError && (
          <p role="status" style={{ margin: "-14px 0 24px", color: "#FFB52E", fontSize: "12px" }}>
            The working / non-working split is read from contract event history, which has not loaded from
            this network endpoint. Your previous pending balance ({formatSol(available)}) is read directly from
            contract state and remains withdrawable. Note that a dash here does not imply missing earnings: if
            no three-payment cycle has completed yet, both figures are genuinely zero.
          </p>
        )}

        {/* Level History */}
        <HistorySection
          title="Level (History)"
          values={levelHistory}
          activeValues={activeSlots}
          isMobile={isMobile}
        />

        <GlobalAutopoolPlan
          wallet={connectedWallet}
          poolJoined={Boolean(account.data?.poolJoined)}
          poolLevel={account.data?.poolLevel ?? 0}
          legacyPoolLevel={legacyPoolLevel}
        />
        {legacyPoolLevel > 0 && !account.data?.poolJoined && (
          <p style={{ margin: "-20px 0 24px", color: "#7FD3D9", fontSize: "12px" }}>
            Previous-platform Global Pool level {legacyPoolLevel} is shown above. This is historical standing,
            not a funded position in the current contract.
          </p>
        )}

        {legacyGrowthTrees.length > 0 && (
          <div style={{ margin: "8px 0 28px" }}>
            <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? "18px" : "21px", fontWeight: 800 }}>
              Previous Platform Growth Report
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
              {legacyGrowthTrees.map(tree => {
                const parent = account.users.find(user => user.wallet.toLowerCase() === tree.parent.toLowerCase());
                return (
                  <div key={tree.tree} style={{
                    textAlign: "left", padding: "16px", borderRadius: "10px",
                    border: "1px solid #1595A1", background: "#0A1414",
                    color: "#FFFFFF", lineHeight: 1.8,
                  }}>
                    <strong style={{ display: "block", fontSize: "16px", marginBottom: "10px" }}>
                      Growth Tree {tree.tree}
                    </strong>
                    <span style={{ display: "block" }}>Level: {tree.level}</span>
                    <span style={{ display: "block" }}>Position: {tree.position}</span>
                    <span style={{ display: "block" }}>Direct growth members: {tree.directCount}</span>
                    <span style={{ display: "block" }}>
                      Parent: {tree.level === 1 ? "Root / System" : parent ? `User ${parent.userId}` : tree.parent}
                    </span>
                    {tree.position1Income + tree.position2Income > 0 && (
                      <span style={{ display: "block" }}>
                        Recorded position income: {formatSol(tree.position1Income + tree.position2Income)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My Business Status */}
        <div
          style={{
            marginTop: isMobile ? "30px" : "40px",
            marginBottom: "20px",
            borderRadius: "6px",
            padding: isMobile ? "16px 12px" : "28px 14px 14px",
            background:
              "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
            border: "1px solid #008DFF",
            boxShadow: "0 5px 14px rgba(0,141,255,.25)",
          }}
        >
          <h2
            style={{
              margin: "0 0 24px",
              textAlign: "center",
              fontSize: isMobile ? "19px" : "22px",
              fontWeight: 800,
            }}
          >
            My Business Status
          </h2>

          <div
            style={{
              overflow: "hidden",
              border: "1px solid #008DFF",
              background: "#20272C",
            }}
          >
            <BusinessRow
              label="My Package"
              value={account.user ? formatSol(30 * 2 ** (account.user.currentSlot-1)) : "—"}
              isMobile={isMobile}
            />
            <BusinessRow
              label="Direct Team"
              value={String(account.directs.length)}
              isMobile={isMobile}
            />
            <BusinessRow
              label="Total Team"
              value={String(account.descendants.length)}
              isMobile={isMobile}
            />
            <BusinessRow
              label="Status"
              value={currentUser ? "active" : "—"}
              isMobile={isMobile}
            />
            <BusinessRow
              label="Sponsor"
              value={account.user?.referrer || referrer || "—"}
              isMobile={isMobile}
              last
            />
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  /** Small qualifier under the figure, for context the number alone implies wrongly. */
  note?: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: "88px",
        padding: "16px",
        borderRadius: "6px",
        background:
          "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
        border: "1px solid #008DFF",
        boxShadow: "0 4px 12px rgba(0,141,255,.22)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#FFFFFF",
          fontSize: "12px",
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        <span>{title}</span>
        <span style={{ color: "#006DFF", fontSize: "17px" }}>⊙</span>
      </div>

      <div
        style={{
          marginTop: "13px",
          color: "#FFFFFF",
          fontSize: "21px",
          fontWeight: 500,
        }}
      >
        {value}
      </div>

      {note && (
        <div
          style={{
            marginTop: "4px",
            color: "rgba(255,255,255,.82)",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

function HistorySection({
  title,
  values,
  activeValues = [],
  isMobile,
}: {
  title: string;
  values: number[];
  activeValues?: number[];
  isMobile: boolean;
}) {
  return (
    <section
      style={{
        marginBottom: isMobile ? "34px" : "48px",
      }}
    >
      <h2
        style={{
          margin: "0 0 14px",
          color: "#FFB52E",
          fontSize: isMobile ? "18px" : "20px",
          fontWeight: 800,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(5, minmax(0, 1fr))",
          gap: isMobile ? "10px" : "16px",
        }}
      >
        {values.map((amount, index) => {
          const levelNumber = index + 1;
          const complete = activeValues.includes(levelNumber);

          return (
            <div key={`${title}-${amount}`} style={levelHistoryCard(isMobile)}>
              <div
                style={{
                  textAlign: "center",
                  color: "#FFFFFF",
                  fontSize: isMobile ? "12px" : "14px",
                  fontWeight: 800,
                }}
              >
                ${amount.toFixed(2)}
              </div>

              <div style={usdtCircle}>
                <span style={{ fontSize: "37px", fontWeight: 700 }}>T</span>
              </div>

              <div
                style={{
                  alignSelf: "center",
                  minWidth: isMobile ? "63px" : "72px",
                  padding: "5px 9px",
                  borderRadius: "5px",
                  textAlign: "center",
                  background: complete ? "#00C83C" : "#FFFFFF",
                  color: complete ? "#FFFFFF" : "#263238",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
              >
                {complete ? "Complete" : "Pending"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BusinessRow({
  label,
  value,
  isMobile,
  last = false,
}: {
  label: string;
  value: string;
  isMobile: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "58% 42%",
        minHeight: isMobile ? "42px" : "44px",
        borderBottom: last ? "none" : "1px solid #008DFF",
        color: "#FFFFFF",
        fontSize: isMobile ? "11px" : "12px",
        fontWeight: 600,
      }}
    >
      <div style={{ padding: "10px 7px" }}>{label}</div>
      <div style={{ padding: "10px 7px" }}>{value}</div>
    </div>
  );
}

function dashboardGradientCard(isMobile: boolean): CSSProperties {
  return {
    minWidth: 0,
    padding: isMobile ? "12px" : "14px 14px 16px",
    borderRadius: isMobile ? "10px" : "12px",
    background: "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
    border: "1px solid #008DFF",
    boxShadow: "0 5px 14px rgba(0,141,255,.30)",
  };
}

function dashboardInviteCard(isMobile: boolean): CSSProperties {
  return {
    minWidth: 0,
    padding: isMobile ? "10px" : "14px",
    borderRadius: isMobile ? "10px" : "12px",
    background: "rgba(2,9,7,.86)",
    border: "1px solid #008DFF",
    boxShadow: "0 5px 14px rgba(0,141,255,.16)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };
}

const detailRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  color: "#FFFFFF",
  fontSize: "14px",
  lineHeight: 1.9,
};

function screenshotCopyButton(isMobile: boolean, copied: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    minWidth: isMobile ? "58px" : "70px",
    padding: isMobile ? "8px 7px" : "9px 12px",
    border: "1px solid #FFB44A",
    borderRadius: "12px",
    background: copied
      ? "#00C83C"
      : "linear-gradient(135deg, #FF8D38, #FFB52E)",
    color: "#FFFFFF",
    fontSize: isMobile ? "10px" : "12px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(255,171,46,.25)",
  };
}

function welcomeBanner(isMobile: boolean): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    display: "grid",
    placeItems: "center",
    minHeight: isMobile ? "76px" : "106px",
    marginBottom: isMobile ? "16px" : "22px",
    padding: isMobile ? "14px" : "20px",
    borderRadius: isMobile ? "10px" : "12px",
    background: "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
    border: "1px solid #008DFF",
    boxShadow: "0 6px 18px rgba(0,141,255,.28)",
    color: "#FFFFFF",
    fontSize: isMobile ? "24px" : "34px",
    fontWeight: 800,
    textAlign: "center",
  };
}

function levelHistoryCard(isMobile: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: isMobile ? "148px" : "166px",
    padding: isMobile ? "10px" : "14px 12px",
    borderRadius: isMobile ? "10px" : "12px",
    background: "linear-gradient(145deg, #087DD8 0%, #075B82 44%, #FFAB2E 100%)",
    border: "2px solid #00CFFF",
    boxShadow: "0 4px 12px rgba(0,141,255,.20)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "7px",
  };
}

const usdtCircle: CSSProperties = {
  width: "52px",
  height: "52px",
  margin: "0 auto",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#12A67E",
  border: "2px solid rgba(255,255,255,.20)",
  boxShadow: "0 3px 10px rgba(0,0,0,.20)",
  color: "#FFFFFF",
};
