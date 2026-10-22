import { readFileSync } from "node:fs";
import { ethers, upgrades } from "hardhat";

const DEFAULT_PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";

type LegacyGlobalRecord = {
  wallet: string;
  userid: string;
  level: number;
};

async function main() {
  const execute = process.env.CONFIRM_GLOBAL_POOL_V12 === "YES";
  const dryRun = process.env.DRY_RUN_GLOBAL_POOL_V12 === "YES";
  if (!execute && !dryRun) {
    throw new Error("Set DRY_RUN_GLOBAL_POOL_V12=YES to validate or CONFIRM_GLOBAL_POOL_V12=YES to execute.");
  }

  const proxy = process.env.BOSS_PROXY_ADDRESS || DEFAULT_PROXY;
  const payloadFile = process.env.LEGACY_GLOBAL_FILE || "legacy-global-payload.json";
  const records = JSON.parse(readFileSync(payloadFile, "utf8")) as LegacyGlobalRecord[];
  if (records.length !== 72) throw new Error(`Expected 72 historical records, found ${records.length}.`);

  const current: any = await ethers.getContractAt("UsdtBossEducationalV11", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, tokenAddress, queueBefore, finalized] = await Promise.all([
    current.owner(), current.version(), current.paymentToken(),
    current.globalQueueLengthA(1), current.legacyGlobalFinalized(),
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 11n) throw new Error(`Expected V11 proxy, found V${version}.`);
  if (!finalized) throw new Error("Historical Global Pool import is not finalized.");

  const activate: LegacyGlobalRecord[] = [];
  let alreadyLive = 0;
  for (const record of records) {
    const [member, global, historicalLevel] = await Promise.all([
      current.members(record.wallet), current.globalMembers(record.wallet),
      current.legacyGlobalLevel(record.wallet),
    ]);
    if (!member.joined) throw new Error(`${record.userid}: matrix membership is missing.`);
    if (historicalLevel !== BigInt(record.level)) {
      throw new Error(`${record.userid}: historical Global Pool level mismatch.`);
    }
    if (global.joined) alreadyLive += 1;
    else activate.push(record);
  }
  if (alreadyLive !== 4 || activate.length !== 68) {
    throw new Error(`Expected 4 already live and 68 pending; found ${alreadyLive} and ${activate.length}.`);
  }

  const V12 = await ethers.getContractFactory("UsdtBossEducationalV12");
  await upgrades.validateUpgrade(proxy, V12, { kind: "uups" });
  if (!execute) {
    console.log(`Dry run passed for proxy ${proxy}.`);
    console.log(`V11 queue length ${queueBefore}; 4 historical members already live; 68 pending activation.`);
    console.log("Storage layout is upgrade-safe. No transaction was sent.");
    return;
  }

  const token = new ethers.Contract(
    tokenAddress, ["function balanceOf(address) view returns(uint256)"], ethers.provider,
  );
  const protectedAccounts = [proxy, owner, ...activate.map(record => record.wallet)];
  const balancesBefore = new Map<string, bigint>();
  const stateBefore = new Map<string, {
    member: any; matrixIncome: bigint; globalIncome: bigint; savings: bigint;
  }>();
  for (const account of protectedAccounts) {
    balancesBefore.set(account.toLowerCase(), await token.balanceOf(account));
  }
  for (const record of activate) {
    const [member, matrixIncome, globalIncome, savings] = await Promise.all([
      current.members(record.wallet), current.matrixIncome(record.wallet),
      current.globalIncome(record.wallet), current.upgradeSavings(record.wallet),
    ]);
    stateBefore.set(record.wallet.toLowerCase(), { member, matrixIncome, globalIncome, savings });
  }

  const upgraded: any = await upgrades.upgradeProxy(proxy, V12, {
    kind: "uups",
    call: {
      fn: "activateLegacyGlobalPoolMembers",
      args: [activate.map(record => record.wallet)],
    },
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();

  if (await upgraded.version() !== 12n) throw new Error("Post-upgrade version verification failed.");
  if (await upgraded.globalQueueLengthA(1) !== queueBefore + BigInt(activate.length)) {
    throw new Error("The live Level-1 queue length is incorrect after activation.");
  }

  for (let index = 0; index < activate.length; index += 1) {
    const record = activate[index];
    const before = stateBefore.get(record.wallet.toLowerCase());
    if (!before) throw new Error(`Missing snapshot for ${record.userid}.`);
    const [member, global, historicalLevel, queued, matrixIncome, globalIncome, savings] =
      await Promise.all([
        upgraded.members(record.wallet), upgraded.globalMembers(record.wallet),
        upgraded.legacyGlobalLevel(record.wallet),
        upgraded.globalQueueAccountA(1, queueBefore + BigInt(index)),
        upgraded.matrixIncome(record.wallet), upgraded.globalIncome(record.wallet),
        upgraded.upgradeSavings(record.wallet),
      ]);
    if (!global.joined || global.highestLevel !== 1n
      || historicalLevel !== BigInt(record.level)
      || queued.toLowerCase() !== record.wallet.toLowerCase()
      || member.sponsor !== before.member.sponsor
      || member.highestSlot !== before.member.highestSlot
      || matrixIncome !== before.matrixIncome || globalIncome !== before.globalIncome
      || savings !== before.savings) {
      throw new Error(`Post-upgrade verification failed for ${record.userid}.`);
    }
  }
  for (const [account, balance] of balancesBefore) {
    if (await token.balanceOf(account) !== balance) {
      throw new Error(`USDT balance changed for ${account}.`);
    }
  }

  const receipt = await transaction?.wait();
  if (!receipt) throw new Error("Upgrade transaction receipt is unavailable.");
  const activationTopic = upgraded.interface.getEvent("LegacyGlobalPoolMemberActivated").topicHash;
  const activationEvents = receipt.logs.filter((log: any) =>
    log.address.toLowerCase() === proxy.toLowerCase() && log.topics[0] === activationTopic);
  if (activationEvents.length !== activate.length) {
    throw new Error(`Expected ${activate.length} activation events, found ${activationEvents.length}.`);
  }
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  if (receipt.logs.some((log: any) =>
    log.address.toLowerCase() === tokenAddress.toLowerCase() && log.topics[0] === transferTopic)) {
    throw new Error("The activation transaction unexpectedly emitted a USDT transfer.");
  }

  console.log(`V12 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Proxy ${proxy}; transaction ${receipt.hash}`);
  console.log(`Activated ${activate.length} historical members at live Global Pool Level 1.`);
  console.log(`Skipped ${alreadyLive} historical members that were already active.`);
  console.log("Verified zero USDT movement and no changes to member income or matrix state.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
