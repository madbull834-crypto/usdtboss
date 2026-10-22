import { ethers, upgrades } from "hardhat";

const SPONSOR = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
const ACCOUNTS = [
  "0xB59717583D6401dB907E76A09026c6e586Af838c",
  "0xaee81e154c995De728f4Eece7e8175aF6537A9A8",
  "0x95b2015747AFBFAEC90A7a9A19B1729d94F0CDb6",
  "0x693Ec52a03A0068204A819856028251759b5cFB1",
  "0x49c9cFe47Cbc37388D772e7B155031D2dF21c228"
];

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const current: any = await ethers.getContractAt("UsdtBossEducationalV7", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, bootstrap, sponsorMember, sponsorGlobal] = await Promise.all([
    current.owner(), current.version(), current.bootstrapAccount(),
    current.members(SPONSOR), current.globalMembers(SPONSOR)
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 7n) throw new Error(`Expected V7 proxy, found V${version}.`);
  if (!sponsorMember.joined || sponsorMember.highestSlot !== 2n || sponsorGlobal.joined) {
    throw new Error("Sponsor preconditions changed.");
  }
  if (!(await current.globalMembers(bootstrap)).joined) {
    throw new Error("Bootstrap is not an active Global Pool member.");
  }

  for (const account of ACCOUNTS) {
    const [member, global, amount] = await Promise.all([
      current.members(account), current.globalMembers(account), current.activatedAmount(account)
    ]);
    if (!member.joined || member.highestSlot !== 1n || amount !== await current.slotPrice(1) || global.joined) {
      throw new Error(`Member preconditions changed for ${account}.`);
    }
  }

  const V8 = await ethers.getContractFactory("UsdtBossEducationalV8");
  await upgrades.validateUpgrade(proxy, V8, { kind: "uups" });
  console.log(`V8 validation passed for proxy ${proxy}.`);
  console.log("Validated sponsor plus five members; no transaction was sent.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
