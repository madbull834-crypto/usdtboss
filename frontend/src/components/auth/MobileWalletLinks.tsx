import { mobileWalletLinks } from "../../evm/mobileWallet";

export default function MobileWalletLinks() {
  const links = mobileWalletLinks(window.location.href);

  if (links.isLocal) {
    return (
      <p style={{ margin: "10px 0 0", color: "#f3c85b", fontSize: 12, lineHeight: 1.5 }}>
        A phone wallet cannot open localhost from your computer. Use the HTTPS deployment URL to test on mobile.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="Open in a mobile wallet">
      <a
        href={links.metamask}
        style={walletLinkStyle}
        rel="noreferrer"
      >
        Open in MetaMask
      </a>
      <a
        href={links.trustWallet}
        style={walletLinkStyle}
        rel="noreferrer"
      >
        Open in Trust Wallet
      </a>
      <p style={{ flexBasis: "100%", margin: 0, color: "#9ca3af", fontSize: 11, lineHeight: 1.5 }}>
        The wallet app will reopen this page in its built-in browser. Then press Connect Wallet again.
      </p>
    </div>
  );
}

const walletLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 12px",
  border: "1px solid #1595A1",
  borderRadius: 8,
  background: "#003e46",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
} as const;
