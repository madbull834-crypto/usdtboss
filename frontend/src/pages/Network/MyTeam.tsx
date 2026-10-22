import { useAccountData } from "../../evm/useAccountData";
import PageMeta from "../../components/common/PageMeta";
import SponsorTreeView from "../../components/soltrust/SponsorTreeView";

export default function MyIncomeTree() {
  const { user, users, directs, descendants, error, matrixParentOf, wallet } = useAccountData();
  const incomeTreeData = descendants.map(({user:member},index)=>{
    // The sponsor chain and paid matrix parent are separate relationships:
    // placement can spill into the sponsor's downline once direct positions fill.
    const placement = matrixParentOf(member.wallet);
    const parentUser = placement ? users.find(u=>u.wallet===placement.parent) : undefined;
    return {
      position:index+1,userId:member.userId.toString(),walletAddress:member.wallet,
      referredBy:users.find(u=>u.wallet===member.referrer)?.userId.toString() ?? "Root / System",
      firstUpline:member.referrer,
      secondUpline:users.find(u=>u.wallet===member.referrer)?.referrer ?? "—",
      matrixParent:parentUser ? parentUser.userId.toString() : placement ? placement.parent : "—",
      matrixParentWallet:placement?.parent ?? "",
      matrixPosition:placement ? `${placement.position} of 3` : "—",
      spillover:Boolean(placement) && placement!.parent !== member.referrer,
      registeredAt:member.registeredAt ? new Date(Number(member.registeredAt)*1000).toISOString().replace("T"," ").slice(0,19) : "—"
    };
  });
  const summaryStats={rootUser:user?.userId.toString() ?? "—",directTeam:String(directs.length),totalTeam:String(descendants.length),teamLevels:String(Math.max(0,...descendants.map(d=>d.depth)))};
  // Navigation items
  const navItems = [
    "Genealogy",
    "Global Tree-1",
    "Global Tree-2",
    "Deposit History",
    "Income History",
    "Withdrawal History",
    "Logout"
  ];

  return (
    <>
      {error && <p role="status" className="text-red-500">{error}</p>}
      <PageMeta title="USDT BOSS — Income Tree" description="USDT BOSS income tree management" />
      
      <div 
        style={{ 
          background: "#000806", 
          minHeight: "100vh", 
          padding: "10px 16px 30px",
          color: "#FFFFFF"
        }}
      >
        {/* USDT BOSS Header */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          padding: "10px 0 15px",
          borderBottom: "1px solid #006875",
          marginBottom: "15px"
        }}>
          <div>
            <h1 style={{ 
              fontSize: "20px", 
              fontWeight: 800,
              background: "linear-gradient(105deg, #008DFF 0%, #00C83C 54%, #FFAB2E 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              margin: 0
            }}>
              USDT BOSS
            </h1>
            <p style={{ 
              fontSize: "10px", 
              color: "#7FD3D9",
              fontWeight: 600,
              letterSpacing: "2px",
              margin: 0
            }}>
              USDTBOSS
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", color: "#7FD3D9" }}>MENU</span>
            <button style={{
              background: "transparent",
              border: "1px solid #1595A1",
              color: "white",
              padding: "4px 12px",
              borderRadius: "6px",
              fontSize: "18px",
              cursor: "pointer"
            }}>
              ☰
            </button>
          </div>
        </div>

        {/* Dashboard & Income Tree Links */}
        <div style={{ 
          display: "flex", 
          gap: "20px", 
          marginBottom: "20px",
          borderBottom: "1px solid #006875",
          paddingBottom: "10px"
        }}>
          <span style={{ color: "#7FD3D9", fontSize: "14px", fontWeight: 600 }}>Dashboard</span>
          <span style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600, borderBottom: "2px solid #008DFF", paddingBottom: "10px" }}>Income Tree</span>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "20px"
        }}>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Root User</p>
            <p style={summaryValueStyle}>{summaryStats.rootUser}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Direct Team</p>
            <p style={summaryValueStyle}>{summaryStats.directTeam}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Total Team</p>
            <p style={summaryValueStyle}>{summaryStats.totalTeam}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Team Levels</p>
            <p style={summaryValueStyle}>{summaryStats.teamLevels}</p>
          </div>
        </div>

        {/* Genealogy tree */}
        <div style={{
          borderRadius: "8px",
          border: "1px solid #006875",
          background: "#000806",
          padding: "14px",
          marginBottom: "20px"
        }}>
          <p style={{ ...summaryLabelStyle, textAlign: "left" }}>Team Tree (by sponsor)</p>
          {user ? (
            <SponsorTreeView users={users} rootWallet={wallet} />
          ) : (
            <p style={{ color: "#7FD3D9", fontSize: "13px", margin: 0 }}>
              {wallet ? "Loading your team…" : "Connect your wallet to see your team tree."}
            </p>
          )}
        </div>

        {/* Table */}
        <div style={{ 
          overflowX: "auto",
          borderRadius: "8px",
          border: "1px solid #006875",
          marginBottom: "20px"
        }}>
          <table style={{ 
            width: "100%", 
            minWidth: "1500px",
            borderCollapse: "collapse",
            fontSize: "12px"
          }}>
            <thead>
              <tr style={{ background: "#00505C" }}>
                <th style={thStyle}>Income Position</th>
                <th style={thStyle}>Entry User / Source</th>
                <th style={thStyle}>Wallet</th>
                <th style={thStyle}>Referred By (sponsor)</th>
                <th style={thStyle}>Matrix Parent</th>
                <th style={thStyle}>Position</th>
                <th style={thStyle}>First Upline</th>
                <th style={thStyle}>Second Upline</th>
                <th style={thStyle}>Registered At</th>
              </tr>
            </thead>
            <tbody>
              {incomeTreeData.map((row, index) => (
                <tr 
                  key={row.position}
                  style={{ 
                    background: index === 0 ? "#004E59" : "#0A1414",
                    borderBottom: "1px solid #006875"
                  }}
                >
                  <td style={tdStyle}>{row.position}</td>
                  <td style={{ ...tdStyle, fontWeight: index === 0 ? 700 : 400 }}>
                    {row.userId}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px" }}>{row.walletAddress}</td>
                  <td style={tdStyle}>
                    {row.referredBy === "Root / System" ? (
                      <span style={{ color: "#7FD3D9" }}>Root / System</span>
                    ) : (
                      <div>
                        <span style={{ fontWeight: 600 }}>{row.referredBy}</span>
                        <span style={{ display: "block", fontSize: "10px", color: "#7FD3D9", fontFamily: "monospace" }}>
                          {row.firstUpline}
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{row.matrixParent}</span>
                      {row.spillover && (
                        <span style={{ display: "block", fontSize: "10px", color: "#FFAB2E" }}>
                          spillover — not the sponsor
                        </span>
                      )}
                      {row.matrixParentWallet && (
                        <span style={{ display: "block", fontSize: "10px", color: "#7FD3D9", fontFamily: "monospace" }}>
                          {row.matrixParentWallet}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>{row.matrixPosition}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px" }}>{row.firstUpline}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px" }}>{row.secondUpline}</td>
                  <td style={tdStyle}>{row.registeredAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Navigation Grid - Like Image */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "8px",
          marginBottom: "20px"
        }}>
          {navItems.map((item) => (
            <button
              key={item}
              style={{
                padding: "10px 8px",
                background: item === "Logout" ? "rgba(255, 0, 0, 0.1)" : "#0A1414",
                border: item === "Logout" ? "1px solid rgba(255, 0, 0, 0.3)" : "1px solid #1595A1",
                borderRadius: "8px",
                color: item === "Logout" ? "#FF4444" : "#FFFFFF",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s",
                textAlign: "center"
              }}
              onMouseEnter={(e) => {
                if (item !== "Logout") {
                  e.currentTarget.style.background = "#004E59";
                } else {
                  e.currentTarget.style.background = "rgba(255, 0, 0, 0.2)";
                }
              }}
              onMouseLeave={(e) => {
                if (item !== "Logout") {
                  e.currentTarget.style.background = "#0A1414";
                } else {
                  e.currentTarget.style.background = "rgba(255, 0, 0, 0.1)";
                }
              }}
            >
              {item}
            </button>
          ))}
        </div>


        {/* Footer */}
        <div style={{
          textAlign: "center",
          padding: "15px 0 5px",
          borderTop: "1px solid #006875",
          color: "#7FD3D9",
          fontSize: "12px",
          fontWeight: 600
        }}>
          2026 USDTBOSS
        </div>
      </div>
    </>
  );
}

// Styles
const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  textAlign: "left",
  color: "#7FD3D9",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #006875"
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  color: "#FFFFFF",
  fontSize: "12px",
  whiteSpace: "nowrap"
};

const summaryCardStyle: React.CSSProperties = {
  background: "#0A1414",
  border: "1px solid rgba(0, 141, 255, 0.3)",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center"
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#7FD3D9",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 8px 0"
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#FFFFFF",
  margin: 0
};
