import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const ACCOUNTS = [
  "0x4de3bdF7fAE0E6b65080d03D615e389109Beaf0b",
  "0xe2054Ed8e010618501838d6116BfdCDC4955CfdA",
  "0x3476BA0F301301C6E430C7d51742Dc326ecF9310",
  "0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18",
  "0x8f43A3b2cF8eE64Cb1A2F81E37DeC53c231cbE9D",
];

async function main() {
  const execute = process.env.CONFIRM_GLOBAL_LEVEL_ONE_V13 === "YES";
  const dryRun = process.env.DRY_RUN_GLOBAL_LEVEL_ONE_V13 === "YES";
  if (!execute && !dryRun) {
    throw new Error("Set DRY_RUN_GLOBAL_LEVEL_ONE_V13=YES to validate or CONFIRM_GLOBAL_LEVEL_ONE_V13=YES to execute.");
  }

  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  const current: any = await ethers.getContractAt("UsdtBossEducationalV12", proxy);
  const [signer] = await ethers.getSigners();
  const [owner, version, tokenAddress, queue1, queue2] = await Promise.all([
    current.owner(), current.version(), current.paymentToken(),
    current.globalQueueLengthA(1), current.globalQueueLengthA(2),
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 12n) throw new Error(`Expected V12 proxy, found V${version}.`);
  if (queue1 !== 82n || queue2 !== 1n) {
    throw new Error(`Unexpected queue lengths: Level 1=${queue1}, Level 2=${queue2}.`);
  }

  for (const account of ACCOUNTS) {
    const [member, global, historical, filledA, filledB, income] = await Promise.all([
      current.members(account), current.globalMembers(account), current.legacyGlobalLevel(account),
      current.gpFilledA(1, account), current.gpFilledB(1, account), current.globalIncome(account),
    ]);
    if (!member.joined || !global.joined || global.highestLevel !== 1n || historical !== 2n
      || filledA !== 0n || filledB !== 0n || income !== 0n) {
      throw new Error(`Correction preconditions changed for ${account}.`);
    }
  }

  const V13 = await ethers.getContractFactory("UsdtBossEducationalV13");
  await upgrades.validateUpgrade(proxy, V13, { kind: "uups" });
  if (!execute) {
    console.log("V13 dry run passed: five verified legacy Level-2 users are eligible.");
    console.log("Storage layout is upgrade-safe. No transaction was sent.");
    return;
  }

  const token = new ethers.Contract(
    tokenAddress, ["function balanceOf(address) view returns(uint256)"], ethers.provider,
  );
  const protectedAccounts = [proxy, owner, ...ACCOUNTS];
  const balancesBefore = new Map<string, bigint>();
  for (const account of protectedAccounts) {
    balancesBefore.set(account.toLowerCase(), await token.balanceOf(account));
  }

  const upgraded: any = await upgrades.upgradeProxy(proxy, V13, {
    kind: "uups", call: { fn: "completeApprovedLegacyGlobalLevelOne", args: [] },
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (!transaction) throw new Error("Upgrade transaction is unavailable.");
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Upgrade transaction failed.");

  // Read through a second endpoint if the configured RPC briefly serves stale
  // state immediately after the transaction is mined.
  let confirmed = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await upgraded.version() === 13n) { confirmed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (!confirmed) throw new Error("Post-upgrade version verification failed.");
  if (await upgraded.globalQueueLengthA(1) !== queue1
    || await upgraded.globalQueueLengthA(2) !== queue2 + 5n) {
    throw new Error("Global Pool queue lengths changed unexpectedly.");
  }

  for (let index = 0; index < ACCOUNTS.length; index += 1) {
    const account = ACCOUNTS[index];
    const [global, historical, filledA, filledB, income, queued] = await Promise.all([
      upgraded.globalMembers(account), upgraded.legacyGlobalLevel(account),
      upgraded.gpFilledA(1, account), upgraded.gpFilledB(1, account),
      upgraded.globalIncome(account), upgraded.globalQueueAccountA(2, queue2 + BigInt(index)),
    ]);
    if (!global.joined || global.highestLevel !== 2n || historical !== 2n
      || filledA !== 2n || filledB !== 5n || income !== 0n
      || queued.toLowerCase() !== account.toLowerCase()) {
      throw new Error(`Post-upgrade verification failed for ${account}.`);
    }
  }
  for (const [account, balance] of balancesBefore) {
    if (await token.balanceOf(account) !== balance) throw new Error(`USDT balance changed for ${account}.`);
  }

  const completionTopic = upgraded.interface.getEvent("LegacyGlobalLevelOneCompleted").topicHash;
  const completions = receipt.logs.filter((log: any) =>
    log.address.toLowerCase() === proxy.toLowerCase() && log.topics[0] === completionTopic);
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transfers = receipt.logs.filter((log: any) =>
    log.address.toLowerCase() === tokenAddress.toLowerCase() && log.topics[0] === transferTopic);
  if (completions.length !== 5 || transfers.length !== 0) {
    throw new Error(`Unexpected receipt: ${completions.length} completions, ${transfers.length} USDT transfers.`);
  }

  console.log(`V13 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Transaction ${receipt.hash}; block ${receipt.blockNumber}; gas used ${receipt.gasUsed}`);
  console.log("Five legacy users now show Level 1 complete and live Level 2; zero USDT transfers.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
