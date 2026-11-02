import { ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  const dryRun = process.env.DRY_RUN_NTH_UPLINE_V15 === "YES";
  const execute = process.env.CONFIRM_NTH_UPLINE_V15 === "YES";
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");
  if (!dryRun && !execute) {
    throw new Error(
      "Set DRY_RUN_NTH_UPLINE_V15=YES to validate or CONFIRM_NTH_UPLINE_V15=YES to execute."
    );
  }

  const [signer] = await ethers.getSigners();
  const current: any = await ethers.getContractAt("UsdtBossEducationalV14", proxy);
  const [version, owner, token, treasury, root] = await Promise.all([
    current.version(),
    current.owner(),
    current.paymentToken(),
    current.treasury(),
    current.bootstrapAccount()
  ]);
  if (version !== 14n) throw new Error(`Expected V14 proxy, found V${version}.`);
  if (ethers.getAddress(owner) !== ethers.getAddress(signer.address)) {
    throw new Error(`Connected signer ${signer.address} is not proxy owner ${owner}.`);
  }

  const V15 = await ethers.getContractFactory("UsdtBossEducationalV15");
  await upgrades.validateUpgrade(proxy, V15, { kind: "uups" });
  if (dryRun && !execute) {
    console.log("V15 validation passed; no transaction sent.");
    return;
  }

  const upgraded: any = await upgrades.upgradeProxy(proxy, V15, { kind: "uups" });
  const upgradeTx = upgraded.deploymentTransaction();
  if (upgradeTx) await upgradeTx.wait();
  await upgraded.waitForDeployment();

  const [newVersion, newOwner, newToken, newTreasury, newRoot] = await Promise.all([
    upgraded.version(),
    upgraded.owner(),
    upgraded.paymentToken(),
    upgraded.treasury(),
    upgraded.bootstrapAccount()
  ]);
  if (newVersion !== 15n) throw new Error("Post-upgrade version verification failed.");
  if (
    newOwner !== owner || newToken !== token || newTreasury !== treasury || newRoot !== root
  ) {
    throw new Error("Immutable proxy configuration changed during upgrade.");
  }

  console.log(`V15 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  if (upgradeTx) console.log(`Upgrade transaction ${upgradeTx.hash}`);
  console.log(`Proxy ${proxy} now uses Nth-upline slot routing.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
