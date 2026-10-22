export type MobileWalletLinks = {
  metamask: string;
  trustWallet: string;
  isLocal: boolean;
};

/** Build links that open the current dapp inside a mobile wallet's browser. */
export function mobileWalletLinks(dappUrl: string): MobileWalletLinks {
  const url = new URL(dappUrl);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const withoutProtocol = dappUrl.replace(/^https?:\/\//i, "");

  return {
    // MetaMask's universal link expects the dapp URL without its protocol.
    metamask: "https://metamask.app.link/dapp/" + withoutProtocol,
    // Trust Wallet documents coin_id=60 for opening an EVM dapp browser.
    trustWallet: "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(dappUrl),
    isLocal,
  };
}
