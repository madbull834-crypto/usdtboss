import { artifacts, ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");
  const V3 = await ethers.getContractFactory("UsdtBossEducationalV3");
  await upgrades.validateUpgrade(proxy, V3, { kind: "uups" });
  const artifact = await artifacts.readArtifact("UsdtBossEducationalV3");
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  if (bytes > 24_576) throw new Error(`Implementation is ${bytes} bytes, over EIP-170.`);
  const current: any = await ethers.getContractAt("UsdtBossEducational", proxy);
  const [signer] = await ethers.getSigners();
  console.log(`storage validation passed; implementation size ${bytes} bytes`);
  console.log(`proxy owner ${await current.owner()}; configured signer ${await signer.getAddress()}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
