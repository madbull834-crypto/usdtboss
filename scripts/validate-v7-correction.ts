import { artifacts, ethers, upgrades } from "hardhat";

const TARGET = "0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const V7 = await ethers.getContractFactory("UsdtBossEducationalV7");
  await upgrades.validateUpgrade(proxy, V7, { kind: "uups" });

  const artifact = await artifacts.readArtifact("UsdtBossEducationalV7");
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  if (bytes > 24_576) throw new Error(`Implementation is ${bytes} bytes, over EIP-170.`);

  const current: any = await ethers.getContractAt("UsdtBossEducationalV6", proxy);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const [owner, version, member, migrated, amount, queue3, gasBalance] = await Promise.all([
    current.owner(), current.version(), current.members(TARGET), current.wasMigrated(TARGET),
    current.activatedAmount(TARGET), current.queueLength(3), ethers.provider.getBalance(signerAddress)
  ]);

  if (version !== 6n) throw new Error(`Expected proxy V6, received V${version}.`);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) throw new Error("Configured signer is not owner.");
  if (gasBalance === 0n) throw new Error("Configured owner has no BNB for gas.");
  if (!member.joined || !migrated || member.highestSlot !== 2n) {
    throw new Error("Target is not an eligible migrated Slot-2 member.");
  }
  if (amount !== await current.slotPrice(2)) throw new Error("Target activated amount is not Slot 2.");
  for (let i = 0n; i < queue3; ++i) {
    if ((await current.queueAccount(3, i)).toLowerCase() === TARGET.toLowerCase()) {
      throw new Error("Target is already present in the Slot-3 queue.");
    }
  }

  console.log(`V7 storage validation passed; implementation size ${bytes} bytes`);
  console.log(`proxy ${proxy}; owner/signer ${signerAddress}; gas ${ethers.formatEther(gasBalance)} BNB`);
  console.log(`target ${TARGET}; current slot 2; Slot-3 queue length ${queue3}`);
  console.log("correction creates no placement, cycle fill, income, or token transfer");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
