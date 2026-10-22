import { describe, expect, it } from "vitest";
import { mobileWalletLinks } from "../../src/evm/mobileWallet";

describe("mobileWalletLinks", () => {
  it("preserves the referral URL when opening a mobile wallet", () => {
    const url = "https://example.com/register?ref=0x123";
    const links = mobileWalletLinks(url);

    expect(links.metamask).toBe("https://metamask.app.link/dapp/example.com/register?ref=0x123");
    expect(links.trustWallet).toContain(encodeURIComponent(url));
    expect(links.isLocal).toBe(false);
  });

  it("identifies localhost, which a wallet on another device cannot reach", () => {
    expect(mobileWalletLinks("http://127.0.0.1:5173/register").isLocal).toBe(true);
    expect(mobileWalletLinks("http://localhost:5173/login").isLocal).toBe(true);
  });
});
