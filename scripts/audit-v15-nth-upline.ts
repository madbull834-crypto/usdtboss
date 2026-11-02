import { ethers, upgrades } from "hardhat";
import { readFileSync } from "node:fs";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const boss: any = await ethers.getContractAt("UsdtBossEducationalV15", proxy);
  const [version, owner, token, treasury, root, implementation, latestBlock] = await Promise.all([
    boss.version(),
    boss.owner(),
    boss.paymentToken(),
    boss.treasury(),
    boss.bootstrapAccount(),
    upgrades.erc1967.getImplementationAddress(proxy),
    ethers.provider.getBlockNumber()
  ]);
  if (version !== 15n) throw new Error(`Expected V15 proxy, found V${version}.`);

  const expected: Array<[string, string | undefined, string]> = [
    ["payment token", process.env.BOSS_PAYMENT_TOKEN, token],
    ["treasury", process.env.BOSS_TREASURY_ADDRESS, treasury],
    ["root", process.env.BOSS_BOOTSTRAP_ADDRESS, root]
  ];
  for (const [label, configured, actual] of expected) {
    if (configured && ethers.getAddress(configured) !== ethers.getAddress(actual)) {
      throw new Error(`${label} changed: expected ${configured}, found ${actual}.`);
    }
  }

  const manifest = JSON.parse(readFileSync(".openzeppelin/bsc.json", "utf8"));
  const deployment = Object.values(manifest.impls as Record<string, any>)
    .find((item: any) => ethers.getAddress(item.address) === ethers.getAddress(implementation)) as
      { txHash?: string } | undefined;
  if (!deployment?.txHash) throw new Error("V15 implementation deployment transaction missing from manifest.");
  const deploymentReceipt = await ethers.provider.getTransactionReceipt(deployment.txHash);
  if (!deploymentReceipt) throw new Error("V15 implementation deployment receipt unavailable.");

  let upgradeTransaction: string | undefined;
  let upgradeBlock: number | undefined;
  const lastScanBlock = Math.min(latestBlock, deploymentReceipt.blockNumber + 50);
  for (let blockNumber = deploymentReceipt.blockNumber; blockNumber <= lastScanBlock; ++blockNumber) {
    const block = await ethers.provider.getBlock(blockNumber, true);
    if (!block) continue;
    for (const item of block.prefetchedTransactions) {
      if (
        item.to && ethers.getAddress(item.to) === ethers.getAddress(proxy)
          && ethers.getAddress(item.from) === ethers.getAddress(owner)
      ) {
        const receipt = await item.wait();
        if (receipt?.status === 1) {
          upgradeTransaction = item.hash;
          upgradeBlock = blockNumber;
          break;
        }
      }
    }
    if (upgradeTransaction) break;
  }
  if (!upgradeTransaction || upgradeBlock === undefined) {
    throw new Error("Recent successful owner-to-proxy upgrade transaction not found.");
  }

  console.log(`Proxy ${proxy}`);
  console.log(`Version ${version}`);
  console.log(`Implementation ${implementation}`);
  console.log(`Upgrade transaction ${upgradeTransaction}`);
  console.log(`Upgrade block ${upgradeBlock}`);
  console.log(`Owner ${owner}`);
  console.log(`Payment token ${token}`);
  console.log(`Treasury ${treasury}`);
  console.log(`Root ${root}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
