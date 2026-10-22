import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = process.env.BOSS_PROXY_ADDRESS;
  const implementationName = process.env.BOSS_IMPLEMENTATION || "UsdtBossEducational";
  if (!proxyAddress) throw new Error("Set BOSS_PROXY_ADDRESS to the existing proxy address.");

  const Implementation = await ethers.getContractFactory(implementationName);
  await upgrades.validateUpgrade(proxyAddress, Implementation, { kind: "uups" });
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Implementation, { kind: "uups" });
  await upgraded.waitForDeployment();
  console.log(`Upgraded proxy ${proxyAddress} using ${implementationName}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
