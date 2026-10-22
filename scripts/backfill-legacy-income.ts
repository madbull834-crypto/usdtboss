import { ethers } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Imports prior-platform income totals into `legacyIncome` for display.
 *
 * This writes a counter only. It does not touch `withdrawable`, so it creates
 * no token liability and nothing becomes claimable through withdraw().
 *
 *   BOSS_PROXY_ADDRESS=0x...  LEGACY_INCOME_FILE=./payload.json \
 *     npx hardhat run scripts/backfill-legacy-income.ts --network bscTestnet
 *
 * Set LEGACY_FINALIZE=1 to close imports permanently once verified.
 */
async function main() {
  const proxyAddress = process.env.BOSS_PROXY_ADDRESS;
  const payloadFile = process.env.LEGACY_INCOME_FILE;
  if (!proxyAddress) throw new Error("Set BOSS_PROXY_ADDRESS.");
  if (!payloadFile) throw new Error("Set LEGACY_INCOME_FILE to the payload JSON.");

  const payload = JSON.parse(readFileSync(payloadFile, "utf8")) as {
    wallet: string;
    userid: string;
    usdt: string;
    units6: number;
  }[];

  const boss = await ethers.getContractAt("UsdtBossEducational", proxyAddress);
  const [signer] = await ethers.getSigners();
  const owner = await boss.owner();
  if (owner.toLowerCase() !== (await signer.getAddress()).toLowerCase()) {
    throw new Error(`Signer ${await signer.getAddress()} is not the owner ${owner}.`);
  }
  if (await boss.legacyBackfillFinalized()) throw new Error("Legacy backfill is already finalized.");
  const token = new ethers.Contract(await boss.paymentToken(), ["function decimals() view returns (uint8)"], ethers.provider);
  const decimals = Number(await token.decimals());
  if (decimals !== 6 && decimals !== 18) throw new Error(`Unsupported token decimals: ${decimals}.`);
  const scale = 10n ** BigInt(decimals - 6);

  const records = payload.map((row) => ({
    account: ethers.getAddress(row.wallet),
    amount: BigInt(row.units6) * scale,
  }));
  const expected = records.reduce((sum, r) => sum + r.amount, 0n);
  console.log(`payload: ${records.length} accounts, ${ethers.formatUnits(expected, decimals)} USDT total`);

  // Every account must already be a registered member, or the batch reverts.
  for (const record of records) {
    const member = await boss.members(record.account);
    if (!member.joined) throw new Error(`${record.account} is not a registered member.`);
  }
  console.log("all recipients verified as registered members");

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const tx = await boss.backfillLegacyIncome(batch);
    console.log(`batch ${i / 50 + 1}: ${batch.length} records, tx ${tx.hash}`);
    await tx.wait();
  }

  // Read back every figure rather than trusting the writes.
  let mismatches = 0;
  for (const record of records) {
    const onChain = await boss.legacyIncome(record.account);
    if (onChain !== record.amount) {
      mismatches += 1;
      console.log(`  MISMATCH ${record.account}: on-chain ${onChain}, expected ${record.amount}`);
    }
  }
  const total = await boss.legacyIncomeTotal();
  console.log(`verified: ${records.length - mismatches}/${records.length} exact`);
  console.log(`legacyIncomeTotal on-chain: ${ethers.formatUnits(total, decimals)} USDT`);
  if (mismatches > 0 || total !== expected) throw new Error("Verification failed; not finalizing.");

  if (process.env.LEGACY_FINALIZE === "1") {
    const tx = await boss.finalizeLegacyBackfill();
    await tx.wait();
    console.log(`legacy imports permanently closed (tx ${tx.hash})`);
  } else {
    console.log("not finalized (set LEGACY_FINALIZE=1 once the figures are confirmed)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
