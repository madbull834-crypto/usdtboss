import { ethers } from "hardhat";
import { readFileSync } from "node:fs";

type GrowthRecord = {
  tree: number;
  sourceId: number;
  account: string;
  parent: string;
  generationId: number;
  position: number;
  level: number;
  position1Income: number;
  position2Income: number;
};

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  const payloadFile = process.env.LEGACY_GROWTH_FILE;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");
  if (!payloadFile) throw new Error("Set LEGACY_GROWTH_FILE.");

  const payload = JSON.parse(readFileSync(payloadFile, "utf8")) as {
    trees: Record<string, number>;
    records: GrowthRecord[];
  };
  const boss: any = await ethers.getContractAt("UsdtBossEducationalV5", proxy);
  const [signer] = await ethers.getSigners();
  const owner = await boss.owner();
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer ${await signer.getAddress()} is not owner ${owner}.`);
  }
  if (Number(await boss.version()) !== 5) throw new Error("Proxy is not running V5.");
  const token = new ethers.Contract(await boss.paymentToken(), ["function decimals() view returns (uint8)"], ethers.provider);
  const decimals = Number(await token.decimals());
  if (decimals !== 6 && decimals !== 18) throw new Error(`Unsupported token decimals: ${decimals}.`);
  const scale = 10n ** BigInt(decimals - 6);

  for (const tree of [1, 2]) {
    const records = payload.records.filter(record => record.tree === tree);
    if (records.length !== payload.trees[String(tree)]) {
      throw new Error(`Tree ${tree}: expected ${payload.trees[String(tree)]}, got ${records.length}.`);
    }

    if (!(await boss.legacyGrowthFinalized(tree))) {
      const pending: GrowthRecord[] = [];
      for (const record of records) {
        const stored = await boss.legacyGrowth(tree, record.account);
        if (!stored.imported) pending.push(record);
      }
      for (let offset = 0; offset < pending.length; offset += 50) {
        const batch = pending.slice(offset, offset + 50).map(record => ({
          ...record,
          position1Income: BigInt(record.position1Income) * scale,
          position2Income: BigInt(record.position2Income) * scale,
        }));
        const tx = await boss.backfillLegacyGrowth(batch);
        console.log(`tree ${tree} batch ${Math.floor(offset / 50) + 1}: ${batch.length}, tx ${tx.hash}`);
        await tx.wait();
      }
    }

    let mismatches = 0;
    for (const record of records) {
      const stored = await boss.legacyGrowth(tree, record.account);
      const matches = stored.imported
        && stored.parent.toLowerCase() === record.parent.toLowerCase()
        && Number(stored.sourceId) === record.sourceId
        && Number(stored.generationId) === record.generationId
        && Number(stored.position) === record.position
        && Number(stored.level) === record.level
        && stored.position1Income === BigInt(record.position1Income) * scale
        && stored.position2Income === BigInt(record.position2Income) * scale;
      if (!matches) mismatches += 1;
    }
    const count = Number(await boss.legacyGrowthCount(tree));
    console.log(`tree ${tree}: verified ${records.length - mismatches}/${records.length}; count ${count}`);
    if (mismatches || count !== records.length) throw new Error(`Tree ${tree} verification failed.`);

    if (process.env.LEGACY_GROWTH_FINALIZE === "1" && !(await boss.legacyGrowthFinalized(tree))) {
      const tx = await boss.finalizeLegacyGrowth(tree);
      await tx.wait();
      console.log(`tree ${tree}: finalized in ${tx.hash}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
