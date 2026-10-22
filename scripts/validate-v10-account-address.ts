import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const SOURCE = "0x8451866ccC54ABc2f49D1e2bb2041C46035FE8f6";
const REPLACEMENT = "0xaF9168210B45EB0F660dEF7D08cA0BA7E2272BEf";
const SPONSOR = "0xe2054Ed8e010618501838d6116BfdCDC4955CfdA";
const DIRECTS = [
  "0x24D9DBa9ab961d258545F01650D02f71549032a8",
  "0x666fD2C19Dd6F0de63e75Cd17aA5310e2AC299b0",
  "0x7B88734fe780bF583eFD60D662de1D67cad4d373",
  "0x3F3a42dc8288B5a80aAaF1e1386993074be79522",
];

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  const current: any = await ethers.getContractAt("UsdtBossEducationalV9", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, sourceMember, replacementMember, sourceGlobal, replacementGlobal] = await Promise.all([
    current.owner(), current.version(), current.members(SOURCE), current.members(REPLACEMENT),
    current.globalMembers(SOURCE), current.globalMembers(REPLACEMENT),
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 9n) throw new Error(`Expected V9 proxy, found V${version}.`);
  if (!sourceMember.joined || sourceMember.sponsor.toLowerCase() !== SPONSOR.toLowerCase()
    || sourceMember.directCount !== 4n || sourceMember.highestSlot !== 2n) {
    throw new Error("Source membership does not match the approved snapshot.");
  }
  if (replacementMember.joined || sourceGlobal.joined || replacementGlobal.joined) {
    throw new Error("Source/replacement live-plan state does not match the approved snapshot.");
  }
  if (await current.legacyUserId(SOURCE) !== 139875n
    || (await current.legacyIdAccount(139875)).toLowerCase() !== SOURCE.toLowerCase()
    || await current.legacyUserId(REPLACEMENT) !== 0n) {
    throw new Error("Legacy identity state does not match the approved snapshot.");
  }
  if (await current.legacyIncome(SOURCE) !== ethers.parseUnits("57", 18)
    || await current.legacyGlobalLevel(SOURCE) !== 1n) {
    throw new Error("Legacy income/level state does not match the approved snapshot.");
  }
  for (const direct of DIRECTS) {
    if ((await current.members(direct)).sponsor.toLowerCase() !== SOURCE.toLowerCase()) {
      throw new Error(`Direct sponsor changed for ${direct}.`);
    }
  }
  for (let slot = 1; slot <= 12; slot += 1) {
    const [sourceParent, replacementParent, sourceChildren, replacementChildren] = await Promise.all([
      current.matrixParent(slot, SOURCE), current.matrixParent(slot, REPLACEMENT),
      current.matrixChildren(slot, SOURCE), current.matrixChildren(slot, REPLACEMENT),
    ]);
    if (sourceParent !== ethers.ZeroAddress || replacementParent !== ethers.ZeroAddress
      || sourceChildren.length || replacementChildren.length) {
      throw new Error(`Unexpected live Matrix placement at Slot ${slot}.`);
    }
  }
  const V10 = await ethers.getContractFactory("UsdtBossEducationalV10");
  await upgrades.validateUpgrade(proxy, V10, { kind: "uups" });
  console.log(`V10 validation passed for proxy ${proxy}.`);
  console.log("Validated the exact source identity, empty replacement wallet, four directs, queues, and zero live placement; no transaction was sent.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
