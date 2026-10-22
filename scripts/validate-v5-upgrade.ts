import { artifacts, ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const V5 = await ethers.getContractFactory("UsdtBossEducationalV5");
  await upgrades.validateUpgrade(proxy, V5, { kind: "uups" });
  const artifact = await artifacts.readArtifact("UsdtBossEducationalV5");
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  if (bytes > 24_576) throw new Error(`Implementation is ${bytes} bytes, over EIP-170.`);

  const current: any = await ethers.getContractAt("UsdtBossEducationalV4", proxy);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const owner = await current.owner();
  const gasBalance = await ethers.provider.getBalance(signerAddress);
  console.log(`storage validation passed; implementation size ${bytes} bytes`);
  console.log(`proxy ${proxy}; current version ${await current.version()}`);
  console.log(`owner ${owner}; signer ${signerAddress}; gas ${ethers.formatEther(gasBalance)} tBNB`);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) throw new Error("Configured signer is not owner.");
  if (gasBalance === 0n) throw new Error("Configured signer has no test BNB.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
