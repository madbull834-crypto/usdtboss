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
  if (process.env.CONFIRM_GLOBAL_POOL_MIGRATION !== "YES") {
    throw new Error("Set CONFIRM_GLOBAL_POOL_MIGRATION=YES to execute the mainnet migration.");
  }

  const current: any = await ethers.getContractAt("UsdtBossEducationalV7", proxy);
  const token = new ethers.Contract(
    await current.paymentToken(),
    ["function balanceOf(address) view returns (uint256)"],
    ethers.provider
  );
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const [owner, version, bootstrap, queueLengthBefore, proxyBalanceBefore] = await Promise.all([
    current.owner(), current.version(), current.bootstrapAccount(),
    current.globalQueueLengthA(1), token.balanceOf(proxy)
  ]);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 7n) throw new Error(`Expected V7 proxy, found V${version}.`);
  if (!(await current.globalMembers(bootstrap)).joined) {
    throw new Error("Bootstrap is not an active Global Pool member.");
  }

  const allAccounts = [SPONSOR, ...ACCOUNTS];
  const snapshots = new Map<string, {
    highestSlot: bigint; activatedAmount: bigint; globalIncome: bigint;
    filledA: bigint; filledB: bigint; tokenBalance: bigint;
  }>();
  for (let index = 0; index < allAccounts.length; index += 1) {
    const account = allAccounts[index];
    const [member, global, activatedAmount, globalIncome, filledA, filledB, tokenBalance] =
      await Promise.all([
        current.members(account), current.globalMembers(account), current.activatedAmount(account),
        current.globalIncome(account), current.gpFilledA(1, account), current.gpFilledB(1, account),
        token.balanceOf(account)
      ]);
    const expectedSlot = index === 0 ? 2n : 1n;
    if (!member.joined || member.highestSlot !== expectedSlot || global.joined) {
      throw new Error(`Migration preconditions changed for ${account}.`);
    }
    if (activatedAmount !== await current.slotPrice(Number(expectedSlot))) {
      throw new Error(`Package amount changed for ${account}.`);
    }
    snapshots.set(account.toLowerCase(), {
      highestSlot: member.highestSlot, activatedAmount, globalIncome, filledA, filledB, tokenBalance
    });
  }

  const V8 = await ethers.getContractFactory("UsdtBossEducationalV8");
  await upgrades.validateUpgrade(proxy, V8, { kind: "uups" });
  const upgraded: any = await upgrades.upgradeProxy(proxy, V8, {
    kind: "uups",
    call: { fn: "migrateApprovedGlobalPoolMembers", args: [] }
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();

  if (await upgraded.version() !== 8n) throw new Error("Post-upgrade version verification failed.");
  if (await upgraded.globalQueueLengthA(1) !== queueLengthBefore + 6n) {
    throw new Error("Post-upgrade Global Pool queue length is wrong.");
  }
  if (await token.balanceOf(proxy) !== proxyBalanceBefore) {
    throw new Error("Migration unexpectedly changed the proxy token balance.");
  }

  for (let index = 0; index < allAccounts.length; index += 1) {
    const account = allAccounts[index];
    const before = snapshots.get(account.toLowerCase());
    if (!before) throw new Error(`Missing snapshot for ${account}.`);
    const [member, global, activatedAmount, globalIncome, filledA, filledB, tokenBalance, queued] =
      await Promise.all([
        upgraded.members(account), upgraded.globalMembers(account), upgraded.activatedAmount(account),
        upgraded.globalIncome(account), upgraded.gpFilledA(1, account), upgraded.gpFilledB(1, account),
        token.balanceOf(account), upgraded.globalQueueAccountA(1, queueLengthBefore + BigInt(index))
      ]);
    if (!global.joined || global.highestLevel !== 1n || queued.toLowerCase() !== account.toLowerCase()) {
      throw new Error(`Global Pool verification failed for ${account}.`);
    }
    if (
      member.highestSlot !== before.highestSlot || activatedAmount !== before.activatedAmount
      || globalIncome !== before.globalIncome || filledA !== before.filledA || filledB !== before.filledB
      || tokenBalance !== before.tokenBalance
    ) throw new Error(`Migration changed protected state for ${account}.`);
  }

  console.log(`V8 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Proxy ${proxy}; upgrade transaction ${transaction?.hash ?? "submitted"}`);
  console.log("Migrated sponsor plus five members into Global Pool Level 1 with no token movement.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
