import { artifacts, ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const V4 = await ethers.getContractFactory("UsdtBossEducationalV4");
  await upgrades.validateUpgrade(proxy, V4, { kind: "uups" });

  const artifact = await artifacts.readArtifact("UsdtBossEducationalV4");
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  if (bytes > 24_576) throw new Error(`Implementation is ${bytes} bytes, over EIP-170.`);

  const current: any = await ethers.getContractAt("UsdtBossEducationalV3", proxy);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const owner = await current.owner();
  const implementation = await upgrades.erc1967.getImplementationAddress(proxy);
  const version = await current.version().then((value: bigint) => value.toString(), () => "pre-V2");
  const gasBalance = await ethers.provider.getBalance(signerAddress);
  const latestBlock = await ethers.provider.getBlockNumber();
  const latestUpgrade = await ethers.provider.getLogs({
    address: proxy,
    topics: [ethers.id("Upgraded(address)")],
    fromBlock: Math.max(0, latestBlock - 20),
    toBlock: latestBlock
  }).then(logs => logs.at(-1), () => undefined);

  console.log(`storage validation passed; implementation size ${bytes} bytes`);
  console.log(`proxy ${proxy}`);
  console.log(`current implementation ${implementation}; version ${version}`);
  console.log(`proxy owner ${owner}; configured signer ${signerAddress}`);
  console.log(`configured signer gas balance ${ethers.formatEther(gasBalance)} tBNB`);
  if (latestUpgrade) {
    console.log(`latest upgrade transaction ${latestUpgrade.transactionHash}; block ${latestUpgrade.blockNumber}`);
  }

  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (gasBalance === 0n) throw new Error("Configured signer has no test BNB for gas.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
