import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const SPONSOR = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
const ACCOUNTS = [
  "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
  "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
  "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
  "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
  "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4"
];

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  const current: any = await ethers.getContractAt("UsdtBossEducationalV8", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, sponsorMember] = await Promise.all([
    current.owner(), current.version(), current.members(SPONSOR)
  ]);

  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 8n) throw new Error(`Expected V8 proxy, found V${version}.`);
  if (!sponsorMember.joined) throw new Error("The approved sponsor is not registered.");

  for (const account of ACCOUNTS) {
    const member = await current.members(account);
    if (member.joined) throw new Error(`${account} is already registered.`);
  }

  const V9 = await ethers.getContractFactory("UsdtBossEducationalV9");
  await upgrades.validateUpgrade(proxy, V9, { kind: "uups" });
  console.log(`V9 validation passed for proxy ${proxy}.`);
  console.log("Validated the registered sponsor and five unregistered approved wallets; no transaction was sent.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
