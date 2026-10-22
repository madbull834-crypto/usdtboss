import { ethers } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Imports prior-platform Global Pool standing into `legacyGlobalLevel`.
 *
 * Display only: it does not enrol anyone in `globalMembers`, creates no Stage A
 * or Stage B queue position, and makes nothing claimable. Those entry fees were
 * paid to the old platform, not to this contract.
 *
 *   BOSS_PROXY_ADDRESS=0x... LEGACY_GLOBAL_FILE=./payload.json \
 *     npx hardhat run scripts/backfill-legacy-global.ts --network bscTestnet
 *
 * Set LEGACY_GLOBAL_FINALIZE=1 to close imports permanently once verified.
 */
async function main() {
  const proxyAddress = process.env.BOSS_PROXY_ADDRESS;
  const payloadFile = process.env.LEGACY_GLOBAL_FILE;
  if (!proxyAddress) throw new Error("Set BOSS_PROXY_ADDRESS.");
  if (!payloadFile) throw new Error("Set LEGACY_GLOBAL_FILE to the payload JSON.");

  const payload = JSON.parse(readFileSync(payloadFile, "utf8")) as
    { wallet: string; userid: string; gpack: string; level: number }[];

  const boss = await ethers.getContractAt("UsdtBossEducational", proxyAddress);
  const [signer] = await ethers.getSigners();
  const owner = await boss.owner();
  if (owner.toLowerCase() !== (await signer.getAddress()).toLowerCase()) {
    throw new Error(`Signer ${await signer.getAddress()} is not the owner ${owner}.`);
  }
  if (await boss.legacyGlobalFinalized()) throw new Error("Global import is already finalized.");

  const records = payload.map((row) => ({
    account: ethers.getAddress(row.wallet),
    level: Number(row.level),
  }));
  console.log(`payload: ${records.length} accounts`);

  for (const record of records) {
    if (record.level < 1 || record.level > 6) throw new Error(`${record.account}: bad level ${record.level}`);
    const member = await boss.members(record.account);
    if (!member.joined) throw new Error(`${record.account} is not a registered member.`);
  }
  console.log("all recipients verified as registered members");

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const tx = await boss.backfillLegacyGlobal(batch);
    console.log(`batch ${Math.floor(i / 50) + 1}: ${batch.length} records, tx ${tx.hash}`);
    await tx.wait();
  }

  let mismatches = 0;
  for (const record of records) {
    const onChain = Number(await boss.legacyGlobalLevel(record.account));
    if (onChain !== record.level) {
      mismatches += 1;
      console.log(`  MISMATCH ${record.account}: on-chain ${onChain}, expected ${record.level}`);
    }
  }
  const count = await boss.legacyGlobalCount();
  console.log(`verified: ${records.length - mismatches}/${records.length} exact`);
  console.log(`legacyGlobalCount on-chain: ${count}`);
  if (mismatches > 0 || Number(count) !== records.length) throw new Error("Verification failed; not finalizing.");

  // The point of the display-only design: confirm nobody got enrolled.
  const enrolled = (await Promise.all(
    records.map(async (r) => (await boss.globalMembers(r.account)).joined)
  )).filter(Boolean).length;
  console.log(`live pool enrolments created: ${enrolled} (must be 0)`);
  if (enrolled !== 0) throw new Error("Import created live pool positions; aborting.");

  if (process.env.LEGACY_GLOBAL_FINALIZE === "1") {
    const tx = await boss.finalizeLegacyGlobal();
    await tx.wait();
    console.log(`Global Pool imports permanently closed (tx ${tx.hash})`);
  } else {
    console.log("not finalized (set LEGACY_GLOBAL_FINALIZE=1 once confirmed)");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
