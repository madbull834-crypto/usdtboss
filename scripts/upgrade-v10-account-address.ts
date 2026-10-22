import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const SOURCE = "0x8451866ccC54ABc2f49D1e2bb2041C46035FE8f6";
const REPLACEMENT = "0xaF9168210B45EB0F660dEF7D08cA0BA7E2272BEf";
const DIRECTS = [
  "0x24D9DBa9ab961d258545F01650D02f71549032a8",
  "0x666fD2C19Dd6F0de63e75Cd17aA5310e2AC299b0",
  "0x7B88734fe780bF583eFD60D662de1D67cad4d373",
  "0x3F3a42dc8288B5a80aAaF1e1386993074be79522",
];

async function queue(current: any, slot: number) {
  const length = Number(await current.queueLength(slot));
  const accounts: string[] = [];
  // Public BSC endpoints reject large bursts of eth_call even when each read
  // is valid. Keep this safety snapshot deliberately sequential.
  for (let index = 0; index < length; index += 1) {
    accounts.push(await current.queueAccount(slot, index));
  }
  return accounts;
}

async function growthChildren(current: any, tree: number, account: string) {
  const length = Number(await current.legacyGrowthChildrenLength(tree, account));
  return Promise.all(Array.from({ length }, (_, index) => current.legacyGrowthChild(tree, account, index) as Promise<string>));
}

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  if (process.env.CONFIRM_ACCOUNT_ADDRESS_MIGRATION !== "YES") {
    throw new Error("Set CONFIRM_ACCOUNT_ADDRESS_MIGRATION=YES to execute the mainnet correction.");
  }
  const current: any = await ethers.getContractAt("UsdtBossEducationalV9", proxy);
  const token = new ethers.Contract(await current.paymentToken(), ["function balanceOf(address) view returns(uint256)"], ethers.provider);
  const [signer] = await ethers.getSigners();
  const owner = await current.owner();
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (await current.version() !== 9n) throw new Error("Expected the live proxy to be V9.");

  const [sourceMember, sourceActivated, sourceLegacyIncome, sourceLegacyLevel, sourceUserId] = await Promise.all([
    current.members(SOURCE), current.activatedAmount(SOURCE), current.legacyIncome(SOURCE),
    current.legacyGlobalLevel(SOURCE), current.legacyUserId(SOURCE),
  ]);
  const replacementMember = await current.members(REPLACEMENT);
  if (!sourceMember.joined || replacementMember.joined || sourceUserId !== 139875n) {
    throw new Error("Approved source/replacement preconditions changed.");
  }
  for (const direct of DIRECTS) {
    if ((await current.members(direct)).sponsor.toLowerCase() !== SOURCE.toLowerCase()) {
      throw new Error(`Direct sponsor changed for ${direct}.`);
    }
  }
  for (let slot = 1; slot <= 12; slot += 1) {
    if ((await current.matrixChildren(slot, SOURCE)).length
      || (await current.matrixChildren(slot, REPLACEMENT)).length) {
      throw new Error(`Unexpected Matrix children at Slot ${slot}.`);
    }
  }

  const queuesBefore = await Promise.all(Array.from({ length: 12 }, (_, index) => queue(current, index + 1)));
  const growthBefore = await Promise.all([1, 2].map(async tree => ({
    tree,
    source: await current.legacyGrowth(tree, SOURCE),
    sourceChildren: await growthChildren(current, tree, SOURCE),
  })));
  const treasury = await current.treasury();
  const protectedAccounts = [proxy, owner, treasury, SOURCE, REPLACEMENT, ...DIRECTS];
  const balancesBefore = new Map<string, bigint>();
  for (const account of protectedAccounts) balancesBefore.set(account.toLowerCase(), await token.balanceOf(account));

  const V10 = await ethers.getContractFactory("UsdtBossEducationalV10");
  await upgrades.validateUpgrade(proxy, V10, { kind: "uups" });
  const upgraded: any = await upgrades.upgradeProxy(proxy, V10, {
    kind: "uups",
    call: { fn: "migrateApprovedAccountAddress", args: [] },
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();
  let confirmedVersion = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await ethers.provider.getBlockNumber();
    if (await upgraded.version() === 10n) { confirmedVersion = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!confirmedVersion) throw new Error("Post-upgrade version verification failed.");

  const [moved, cleared] = await Promise.all([upgraded.members(REPLACEMENT), upgraded.members(SOURCE)]);
  if (!moved.joined || cleared.joined || moved.sponsor !== sourceMember.sponsor
    || moved.directCount !== sourceMember.directCount || moved.highestSlot !== sourceMember.highestSlot
    || await upgraded.activatedAmount(REPLACEMENT) !== sourceActivated
    || await upgraded.legacyIncome(REPLACEMENT) !== sourceLegacyIncome
    || await upgraded.legacyGlobalLevel(REPLACEMENT) !== sourceLegacyLevel
    || await upgraded.legacyIdAccount(139875) !== REPLACEMENT) {
    throw new Error("Post-upgrade identity verification failed.");
  }
  for (const direct of DIRECTS) {
    if ((await upgraded.members(direct)).sponsor.toLowerCase() !== REPLACEMENT.toLowerCase()) {
      throw new Error(`Replacement sponsor verification failed for ${direct}.`);
    }
  }
  for (let slot = 1; slot <= 12; slot += 1) {
    const after = await queue(upgraded, slot);
    const expected = queuesBefore[slot - 1].map(account => account.toLowerCase() === SOURCE.toLowerCase() ? REPLACEMENT : account);
    if (after.some((account, index) => account.toLowerCase() !== expected[index].toLowerCase())) {
      throw new Error(`Queue order changed unexpectedly at Slot ${slot}.`);
    }
  }
  for (const snapshot of growthBefore) {
    const movedGrowth = await upgraded.legacyGrowth(snapshot.tree, REPLACEMENT);
    const movedChildren = await growthChildren(upgraded, snapshot.tree, REPLACEMENT);
    if (!movedGrowth.imported || movedGrowth.sourceId !== snapshot.source.sourceId
      || movedChildren.length !== snapshot.sourceChildren.length
      || movedChildren.some((account, index) => account.toLowerCase() !== snapshot.sourceChildren[index].toLowerCase())) {
      throw new Error(`Growth Tree ${snapshot.tree} verification failed.`);
    }
    for (const child of movedChildren) {
      if ((await upgraded.legacyGrowth(snapshot.tree, child)).parent.toLowerCase() !== REPLACEMENT.toLowerCase()) {
        throw new Error(`Growth Tree ${snapshot.tree} child parent was not replaced.`);
      }
    }
  }
  for (const [account, balance] of balancesBefore) {
    if (await token.balanceOf(account) !== balance) throw new Error(`Token balance changed for ${account}.`);
  }

  console.log(`V10 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Proxy ${proxy}; upgrade transaction ${transaction?.hash ?? "submitted"}`);
  console.log(`Replaced ${SOURCE} with ${REPLACEMENT}; no payment-token movement.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
