import { ethers, upgrades } from "hardhat";

const TARGET = "0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");
  if (process.env.CONFIRM_SLOT3_CORRECTION !== "YES") {
    throw new Error("Set CONFIRM_SLOT3_CORRECTION=YES to execute the mainnet correction.");
  }

  const current: any = await ethers.getContractAt("UsdtBossEducationalV6", proxy);
  const token = new ethers.Contract(
    await current.paymentToken(),
    ["function balanceOf(address) view returns (uint256)"],
    ethers.provider
  );
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const [owner, version, member, migrated, proxyBalanceBefore, targetBalanceBefore] = await Promise.all([
    current.owner(), current.version(), current.members(TARGET), current.wasMigrated(TARGET),
    token.balanceOf(proxy), token.balanceOf(TARGET)
  ]);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) throw new Error("Configured signer is not owner.");
  if (version !== 6n || !member.joined || !migrated || member.highestSlot !== 2n) {
    throw new Error("Target preconditions changed; refusing correction.");
  }

  const V7 = await ethers.getContractFactory("UsdtBossEducationalV7");
  await upgrades.validateUpgrade(proxy, V7, { kind: "uups" });
  const upgraded: any = await upgrades.upgradeProxy(proxy, V7, {
    kind: "uups",
    call: { fn: "correctMigratedMemberToSlot3", args: [] }
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();

  const [newVersion, corrected, activated, parent, filled, gross, proxyBalanceAfter, targetBalanceAfter] =
    await Promise.all([
      upgraded.version(), upgraded.members(TARGET), upgraded.activatedAmount(TARGET),
      upgraded.matrixParent(3, TARGET), upgraded.childrenFilled(3, TARGET),
      upgraded.cycleGross(3, TARGET), token.balanceOf(proxy), token.balanceOf(TARGET)
    ]);
  if (newVersion !== 7n || corrected.highestSlot !== 3n) throw new Error("Post-upgrade Slot-3 verification failed.");
  if (activated !== await upgraded.slotPrice(3)) throw new Error("Post-upgrade activated amount is wrong.");
  if (parent !== ethers.ZeroAddress || filled !== 0n || gross !== 0n) {
    throw new Error("Correction unexpectedly created live matrix state.");
  }
  if (proxyBalanceAfter !== proxyBalanceBefore || targetBalanceAfter !== targetBalanceBefore) {
    throw new Error("Correction unexpectedly changed payment-token balances.");
  }

  console.log(`V7 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`proxy ${proxy}; upgrade transaction ${transaction?.hash ?? "submitted"}`);
  console.log(`corrected ${TARGET} from Slot 2 to Slot 3 with no token movement`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
