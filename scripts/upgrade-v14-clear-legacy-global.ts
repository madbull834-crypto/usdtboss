import { readFileSync } from "node:fs";
import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
type LegacyGlobalRecord = { wallet: string; userid: string; level: number };

async function main() {
  const execute = process.env.CONFIRM_CLEAR_LEGACY_GLOBAL_V14 === "YES";
  const dryRun = process.env.DRY_RUN_CLEAR_LEGACY_GLOBAL_V14 === "YES";
  if (!execute && !dryRun) {
    throw new Error("Set DRY_RUN_CLEAR_LEGACY_GLOBAL_V14=YES to validate or CONFIRM_CLEAR_LEGACY_GLOBAL_V14=YES to execute.");
  }

  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  const records = JSON.parse(readFileSync(
    process.env.LEGACY_GLOBAL_FILE || "legacy-global-payload.json", "utf8",
  )) as LegacyGlobalRecord[];
  if (records.length !== 72) throw new Error(`Expected 72 records, found ${records.length}.`);
  if (new Set(records.map(record => record.wallet.toLowerCase())).size !== records.length) {
    throw new Error("Legacy Global Pool payload contains duplicate wallets.");
  }

  const current: any = await ethers.getContractAt("UsdtBossEducationalV13", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, tokenAddress, legacyCount, queue1, queue2] = await Promise.all([
    current.owner(), current.version(), current.paymentToken(), current.legacyGlobalCount(),
    current.globalQueueLengthA(1), current.globalQueueLengthA(2),
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 13n) throw new Error(`Expected V13 proxy, found V${version}.`);
  if (legacyCount !== 72n || queue1 !== 82n || queue2 !== 6n) {
    throw new Error(`Unexpected counts: legacy=${legacyCount}, Level1=${queue1}, Level2=${queue2}.`);
  }

  for (const record of records) {
    const [historical, global] = await Promise.all([
      current.legacyGlobalLevel(record.wallet), current.globalMembers(record.wallet),
    ]);
    if (historical !== BigInt(record.level) || !global.joined) {
      throw new Error(`State mismatch for historical user ${record.userid}.`);
    }
  }

  const V14 = await ethers.getContractFactory("UsdtBossEducationalV14");
  await upgrades.validateUpgrade(proxy, V14, { kind: "uups" });
  if (!execute) {
    console.log("V14 dry run passed: 72 unique duplicate historical records are eligible for clearing.");
    console.log("All 72 wallets are live; storage layout is upgrade-safe. No transaction was sent.");
    return;
  }

  const token = new ethers.Contract(
    tokenAddress, ["function balanceOf(address) view returns(uint256)"], ethers.provider,
  );
  const balancesBefore = new Map<string, bigint>();
  for (const account of [proxy, owner, ...records.map(record => record.wallet)]) {
    balancesBefore.set(account.toLowerCase(), await token.balanceOf(account));
  }
  const liveBefore = new Map<string, {
    level: bigint; income: bigint; a1: bigint; b1: bigint; a2: bigint; b2: bigint;
  }>();
  for (const record of records) {
    const [global, income, a1, b1, a2, b2] = await Promise.all([
      current.globalMembers(record.wallet), current.globalIncome(record.wallet),
      current.gpFilledA(1, record.wallet), current.gpFilledB(1, record.wallet),
      current.gpFilledA(2, record.wallet), current.gpFilledB(2, record.wallet),
    ]);
    liveBefore.set(record.wallet.toLowerCase(), {
      level: global.highestLevel, income, a1, b1, a2, b2,
    });
  }

  const startBlock = await ethers.provider.getBlockNumber();
  const upgraded: any = await upgrades.upgradeProxy(proxy, V14, {
    kind: "uups",
    call: { fn: "clearAllLegacyGlobalPoolRecords", args: [records.map(record => record.wallet)] },
  });
  await upgraded.waitForDeployment();

  let confirmed = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await upgraded.version() === 14n) { confirmed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (!confirmed) throw new Error("Post-upgrade version verification failed.");
  if (await upgraded.legacyGlobalCount() !== 0n
    || await upgraded.globalQueueLengthA(1) !== queue1
    || await upgraded.globalQueueLengthA(2) !== queue2) {
    throw new Error("Post-upgrade counts are incorrect.");
  }

  for (const record of records) {
    const before = liveBefore.get(record.wallet.toLowerCase());
    if (!before) throw new Error(`Missing snapshot for ${record.userid}.`);
    const [historical, global, income, a1, b1, a2, b2] = await Promise.all([
      upgraded.legacyGlobalLevel(record.wallet), upgraded.globalMembers(record.wallet),
      upgraded.globalIncome(record.wallet), upgraded.gpFilledA(1, record.wallet),
      upgraded.gpFilledB(1, record.wallet), upgraded.gpFilledA(2, record.wallet),
      upgraded.gpFilledB(2, record.wallet),
    ]);
    if (historical !== 0n || !global.joined || global.highestLevel !== before.level
      || income !== before.income || a1 !== before.a1 || b1 !== before.b1
      || a2 !== before.a2 || b2 !== before.b2) {
      throw new Error(`Live state changed for user ${record.userid}.`);
    }
  }
  for (const [account, balance] of balancesBefore) {
    if (await token.balanceOf(account) !== balance) throw new Error(`USDT balance changed for ${account}.`);
  }

  const endBlock = await ethers.provider.getBlockNumber();
  const selector = ethers.id("upgradeToAndCall(address,bytes)").slice(0, 10);
  let upgradeHash = "";
  for (let blockNumber = endBlock; blockNumber >= startBlock && !upgradeHash; blockNumber -= 1) {
    const block = await ethers.provider.getBlock(blockNumber, true);
    if (!block) continue;
    const match = block.prefetchedTransactions.find(candidate =>
      candidate.to?.toLowerCase() === proxy.toLowerCase()
      && candidate.from.toLowerCase() === owner.toLowerCase()
      && candidate.data.startsWith(selector));
    if (match) upgradeHash = match.hash;
  }
  if (!upgradeHash) throw new Error("Could not identify the atomic upgrade transaction.");
  const receipt = await ethers.provider.getTransactionReceipt(upgradeHash);
  if (!receipt || receipt.status !== 1) throw new Error("Upgrade receipt did not succeed.");
  const clearTopic = upgraded.interface.getEvent("LegacyGlobalRecordCleared").topicHash;
  const clearEvents = receipt.logs.filter(log =>
    log.address.toLowerCase() === proxy.toLowerCase() && log.topics[0] === clearTopic);
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transfers = receipt.logs.filter(log =>
    log.address.toLowerCase() === tokenAddress.toLowerCase() && log.topics[0] === transferTopic);
  if (clearEvents.length !== 72 || transfers.length !== 0) {
    throw new Error(`Unexpected receipt: ${clearEvents.length} clears, ${transfers.length} USDT transfers.`);
  }

  console.log(`V14 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Transaction ${receipt.hash}; block ${receipt.blockNumber}; gas used ${receipt.gasUsed}`);
  console.log("Cleared 72 legacy Global Pool records; preserved 82 live positions; zero USDT transfers.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
