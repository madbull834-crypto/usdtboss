import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const SPONSOR = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
const ACCOUNTS = [
  "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
  "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
  "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
  "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
  "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4",
];

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  if (process.env.CONFIRM_GLOBAL_POOL_V11 !== "YES") {
    throw new Error("Set CONFIRM_GLOBAL_POOL_V11=YES to execute the mainnet activation.");
  }

  const current: any = await ethers.getContractAt("UsdtBossEducationalV10", proxy);
  const token = new ethers.Contract(
    await current.paymentToken(), ["function balanceOf(address) view returns(uint256)"], ethers.provider,
  );
  const [signer] = await ethers.getSigners();
  const [owner, version, treasury, queueLengthBefore] = await Promise.all([
    current.owner(), current.version(), current.treasury(), current.globalQueueLengthA(1),
  ]);
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 10n) throw new Error(`Expected V10 proxy, found V${version}.`);
  if (!(await current.globalMembers(SPONSOR)).joined) {
    throw new Error("The approved sponsor is not active in the Global Pool.");
  }

  const protectedAccounts = [proxy, owner, treasury, SPONSOR, ...ACCOUNTS];
  const balancesBefore = new Map<string, bigint>();
  for (const account of protectedAccounts) {
    balancesBefore.set(account.toLowerCase(), await token.balanceOf(account));
  }
  const snapshots = new Map<string, {
    member: any; amount: bigint; matrixIncome: bigint; globalIncome: bigint; savings: bigint;
  }>();
  for (const account of ACCOUNTS) {
    const [member, global, amount, matrixIncome, globalIncome, savings] = await Promise.all([
      current.members(account), current.globalMembers(account), current.activatedAmount(account),
      current.matrixIncome(account), current.globalIncome(account), current.upgradeSavings(account),
    ]);
    if (!member.joined || member.sponsor.toLowerCase() !== SPONSOR.toLowerCase()
      || member.highestSlot !== 1n || global.joined) {
      throw new Error(`Activation preconditions changed for ${account}.`);
    }
    snapshots.set(account.toLowerCase(), { member, amount, matrixIncome, globalIncome, savings });
  }

  const startBlock = await ethers.provider.getBlockNumber();
  const V11 = await ethers.getContractFactory("UsdtBossEducationalV11");
  await upgrades.validateUpgrade(proxy, V11, { kind: "uups" });
  const upgraded: any = await upgrades.upgradeProxy(proxy, V11, {
    kind: "uups",
    call: { fn: "activateApprovedGlobalPoolMembers", args: [] },
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();

  let confirmedVersion = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await ethers.provider.getBlockNumber();
    if (await upgraded.version() === 11n) { confirmedVersion = true; break; }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (!confirmedVersion) throw new Error("Post-upgrade version verification failed.");
  if (await upgraded.globalQueueLengthA(1) !== queueLengthBefore + 5n) {
    throw new Error("The Stage-A queue length did not increase by five.");
  }

  for (let index = 0; index < ACCOUNTS.length; index += 1) {
    const account = ACCOUNTS[index];
    const before = snapshots.get(account.toLowerCase());
    if (!before) throw new Error(`Missing snapshot for ${account}.`);
    const [member, global, amount, matrixIncome, globalIncome, savings, queued] = await Promise.all([
      upgraded.members(account), upgraded.globalMembers(account), upgraded.activatedAmount(account),
      upgraded.matrixIncome(account), upgraded.globalIncome(account), upgraded.upgradeSavings(account),
      upgraded.globalQueueAccountA(1, queueLengthBefore + BigInt(index)),
    ]);
    if (!global.joined || global.highestLevel !== 1n
      || queued.toLowerCase() !== account.toLowerCase()
      || member.sponsor !== before.member.sponsor || member.highestSlot !== before.member.highestSlot
      || amount !== before.amount || matrixIncome !== before.matrixIncome
      || globalIncome !== before.globalIncome || savings !== before.savings) {
      throw new Error(`Post-upgrade verification failed for ${account}.`);
    }
  }
  for (const [account, balance] of balancesBefore) {
    if (await token.balanceOf(account) !== balance) {
      throw new Error(`USDT balance changed for ${account}.`);
    }
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
  if (!upgradeHash) throw new Error("Could not identify the atomic proxy upgrade transaction.");
  const receipt = await ethers.provider.getTransactionReceipt(upgradeHash);
  const activationTopic = upgraded.interface.getEvent("ApprovedGlobalPoolMemberActivated").topicHash;
  const activationEvents = receipt.logs.filter(log =>
    log.address.toLowerCase() === proxy.toLowerCase() && log.topics[0] === activationTopic);
  if (activationEvents.length !== 5) throw new Error("Expected five activation events.");
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  if (receipt.logs.some(log => log.address.toLowerCase() === (token.target as string).toLowerCase()
    && log.topics[0] === transferTopic)) {
    throw new Error("The atomic activation transaction unexpectedly emitted a USDT transfer.");
  }

  console.log(`V11 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Proxy ${proxy}; atomic upgrade transaction ${upgradeHash}`);
  console.log(`Upgrade block ${receipt.blockNumber}; gas used ${receipt.gasUsed}`);
  console.log("Activated five approved wallets at Global Pool Level 1 with no USDT movement.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
