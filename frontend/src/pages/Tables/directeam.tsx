import { useAccountData } from "../../evm/useAccountData";
import { formatSol } from "../../evm/plan";
import PageMeta from "../../components/common/PageMeta";

export default function DirectTeam() {
  const { user, users, directs, error } = useAccountData();
  const directTeamData = directs.map((member,index)=>({
    id:index+1,userId:member.userId.toString(),walletAddress:member.wallet,
    package:formatSol(30 * 2 ** (member.currentSlot-1)),
    totalPackage:formatSol(30 * (2 ** member.currentSlot-1)),status:"Active",
    joinDate:member.registeredAt ? new Date(Number(member.registeredAt)*1000).toISOString().slice(0,10) : "—",
    activeDate:member.registeredAt ? new Date(Number(member.registeredAt)*1000).toISOString().slice(0,10) : "—",
    totalTeam:String(users.filter(u=>u.referrer===member.wallet).length)
  }));
  const summaryStats={userId:user?.userId.toString() ?? "—",directTeam:String(directs.length),referralCount:String(user?.directReferralCount ?? 0),currentSlot:String(user?.currentSlot ?? 0)};
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
      <PageMeta title="USDT BOSS — Direct Team" description="USDT BOSS direct team management" />
      
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

        {/* Dashboard & Direct Team Links */}
        <div style={{ 
          display: "flex", 
          gap: "20px", 
          marginBottom: "20px",
          borderBottom: "1px solid #006875",
          paddingBottom: "10px"
        }}>
          <span style={{ color: "#7FD3D9", fontSize: "14px", fontWeight: 600 }}>Dashboard</span>
          <span style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600, borderBottom: "2px solid #008DFF", paddingBottom: "10px" }}>Direct Team</span>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "20px"
        }}>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>User ID</p>
            <p style={summaryValueStyle}>{summaryStats.userId}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Direct Team</p>
            <p style={summaryValueStyle}>{summaryStats.directTeam}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Referral Count</p>
            <p style={summaryValueStyle}>{summaryStats.referralCount}</p>
          </div>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Current Slot</p>
            <p style={summaryValueStyle}>{summaryStats.currentSlot}</p>
          </div>
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
            minWidth: "1100px",
            borderCollapse: "collapse",
            fontSize: "12px"
          }}>
            <thead>
              <tr style={{ background: "#00505C" }}>
                <th style={thStyle}>Sr.No.</th>
                <th style={thStyle}>UserID</th>
                <th style={thStyle}>WalletAddress</th>
                <th style={thStyle}>Package</th>
                <th style={thStyle}>Total Package</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Join Date</th>
                <th style={thStyle}>Active Date</th>
                <th style={thStyle}>Total Team</th>
              </tr>
            </thead>
            <tbody>
              {directTeamData.map((row, index) => (
                <tr 
                  key={row.id}
                  style={{ 
                    background: index === 0 ? "#004E59" : "#0A1414",
                    borderBottom: "1px solid #006875"
                  }}
                >
                  <td style={tdStyle}>{row.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{row.userId}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px" }}>{row.walletAddress}</td>
                  <td style={tdStyle}>{row.package}</td>
                  <td style={tdStyle}>{row.totalPackage}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(0, 200, 60, 0.15)",
                      padding: "3px 12px",
                      borderRadius: "20px",
                      color: "#00E676",
                      fontSize: "11px",
                      fontWeight: 600
                    }}>
                      <span style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#00E676",
                        boxShadow: "0 0 10px #00E676"
                      }}></span>
                      {row.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{row.joinDate}</td>
                  <td style={tdStyle}>{row.activeDate}</td>
                  <td style={tdStyle}>{row.totalTeam}</td>
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
