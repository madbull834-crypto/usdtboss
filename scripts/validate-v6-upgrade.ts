import { artifacts, ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
  await upgrades.validateUpgrade(proxy, V6, { kind: "uups" });

  const artifact = await artifacts.readArtifact("UsdtBossEducationalV6");
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  if (bytes > 24_576) throw new Error(`Implementation is ${bytes} bytes, over EIP-170.`);

  const current: any = await ethers.getContractAt("UsdtBossEducationalV5", proxy);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const owner = await current.owner();
  const gasBalance = await ethers.provider.getBalance(signerAddress);
  const tokenAddress = await current.paymentToken();
  const token = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address) view returns (uint256)"],
    ethers.provider
  );
  const poolBalance = await token.balanceOf(proxy);

  console.log(`storage validation passed; implementation size ${bytes} bytes`);
  console.log(`proxy ${proxy}; current version ${await current.version()}`);
  console.log(`pool payment-token balance ${poolBalance}`);
  console.log(`owner ${owner}; signer ${signerAddress}; gas ${ethers.formatEther(gasBalance)} BNB`);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error("Configured signer is not owner.");
  }
  if (gasBalance === 0n) throw new Error("Configured signer has no BNB for gas.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
