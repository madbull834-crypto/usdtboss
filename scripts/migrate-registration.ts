import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers } from "hardhat";

type InputRecord = {
  walletaddress: string;
  refaladdress: string;
  level: number;
  amount: string;
};

type MigrationFile = {
  bootstrap: string;
  tokenDecimals: number;
  records: InputRecord[];
};

async function main() {
  const proxyAddress = process.env.BOSS_PROXY_ADDRESS;
  const inputPath = process.env.MIGRATION_FILE;
  if (!proxyAddress) throw new Error("Set BOSS_PROXY_ADDRESS to the deployed proxy address.");
  if (!inputPath) throw new Error("Set MIGRATION_FILE to the prepared migration JSON path.");

  const payload = JSON.parse(await readFile(resolve(inputPath), "utf8")) as MigrationFile;
  const boss: any = await ethers.getContractAt("UsdtBossEducational", proxyAddress);
  const onChainBootstrap = await boss.bootstrapAccount();
  if (onChainBootstrap.toLowerCase() !== payload.bootstrap.toLowerCase()) {
    throw new Error(`Bootstrap mismatch: file=${payload.bootstrap}, contract=${onChainBootstrap}`);
  }
  if (await boss.migrationFinalized()) throw new Error("Migration has already been finalized.");
  const token = new ethers.Contract(await boss.paymentToken(), ["function decimals() view returns (uint8)"], ethers.provider);
  const onChainDecimals = Number(await token.decimals());
  if (payload.tokenDecimals !== 6) throw new Error(`Unsupported payload decimals: ${payload.tokenDecimals}.`);
  if (onChainDecimals !== 6 && onChainDecimals !== 18) throw new Error(`Unsupported contract token decimals: ${onChainDecimals}.`);

  const pending: InputRecord[] = [];
  for (const record of payload.records) {
    if (!(await boss.members(record.walletaddress)).joined) pending.push(record);
  }

  const batchSize = 25;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize).map((record) => ({
      account: record.walletaddress,
      sponsor: record.refaladdress,
      level: record.level,
      amount: ethers.parseUnits(record.amount, onChainDecimals)
    }));
    const transaction = await boss.migrateMembers(batch);
    const receipt = await transaction.wait();
    console.log(`Migrated ${batch.length} registrations in ${receipt.hash}`);
  }

  for (const record of payload.records) {
    const member = await boss.members(record.walletaddress);
    const expectedAmount = ethers.parseUnits(record.amount, onChainDecimals);
    if (!member.joined || member.sponsor.toLowerCase() !== record.refaladdress.toLowerCase()) {
      throw new Error(`Verification failed for ${record.walletaddress}`);
    }
    if (Number(member.highestSlot) !== record.level || await boss.activatedAmount(record.walletaddress) !== expectedAmount) {
      throw new Error(`Level/amount verification failed for ${record.walletaddress}`);
    }
  }
  console.log(`Verified ${payload.records.length} registrations.`);

  if (process.env.FINALIZE_MIGRATION === "true") {
    const transaction = await boss.finalizeMigration();
    await transaction.wait();
    console.log("Migration permanently finalized; live joins are now enabled.");
  } else {
    console.log("Migration remains open. Re-run with FINALIZE_MIGRATION=true only after client verification.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
