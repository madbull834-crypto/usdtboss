import { ethers } from "hardhat";
import { readFileSync } from "node:fs";

type Identity = { wallet: string; userid: string };
type GlobalIncome = { wallet: string; userid: string; units6: number };

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  if (!proxy) throw new Error("Set BOSS_PROXY_ADDRESS.");

  const identities = JSON.parse(readFileSync(
    process.env.LEGACY_IDENTITIES_FILE || "legacy-identities-payload.json", "utf8"
  )) as Identity[];
  const globalIncome = JSON.parse(readFileSync(
    process.env.LEGACY_GLOBAL_INCOME_FILE || "legacy-global-income-payload.json", "utf8"
  )) as GlobalIncome[];

  if (identities.length !== 106) throw new Error(`Expected 106 identities, got ${identities.length}.`);
  const expectedGlobalUnits6 = globalIncome.reduce((sum, row) => sum + BigInt(row.units6), 0n);
  if (globalIncome.length !== 7 || expectedGlobalUnits6 !== 504_000_000n) {
    throw new Error("Expected seven proven Global Pool credits totalling 504 USDT.");
  }

  const boss: any = await ethers.getContractAt("UsdtBossEducationalV3", proxy);
  const [signer] = await ethers.getSigners();
  const owner = await boss.owner();
  if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer ${await signer.getAddress()} is not owner ${owner}.`);
  }
  if (!(await boss.migrationFinalized())) throw new Error("Registration migration is not finalized.");
  const token = new ethers.Contract(await boss.paymentToken(), ["function decimals() view returns (uint8)"], ethers.provider);
  const decimals = Number(await token.decimals());
  if (decimals !== 6 && decimals !== 18) throw new Error(`Unsupported token decimals: ${decimals}.`);
  const scale = 10n ** BigInt(decimals - 6);
  const expectedGlobalTotal = expectedGlobalUnits6 * scale;
  if (!(await boss.legacyBackfillFinalized())) throw new Error("Working-income import is not finalized.");
  if ((await boss.legacyIncomeTotal()) !== 2_601_000_000n * scale) {
    throw new Error("Working-income total is not the reconciled 2,601 USDT.");
  }

  if (!(await boss.legacyIdentityFinalized())) {
    for (let i = 0; i < identities.length; i += 50) {
      const batch = identities.slice(i, i + 50).map(row => ({
        account: ethers.getAddress(row.wallet), userId: BigInt(row.userid)
      }));
      const tx = await boss.backfillLegacyIdentities(batch);
      console.log(`identity batch ${Math.floor(i / 50) + 1}: ${tx.hash}`);
      await tx.wait();
    }
  }

  if (!(await boss.legacyGlobalIncomeFinalized())) {
    const tx = await boss.backfillLegacyGlobalIncome(globalIncome.map(row => ({
      account: ethers.getAddress(row.wallet), amount: BigInt(row.units6) * scale
    })));
    console.log(`Global income batch: ${tx.hash}`);
    await tx.wait();
  }

  let identityMismatches = 0;
  for (const row of identities) {
    const account = ethers.getAddress(row.wallet);
    if ((await boss.legacyUserId(account)) !== BigInt(row.userid)) identityMismatches += 1;
    if ((await boss.legacyIdAccount(BigInt(row.userid))) !== account) identityMismatches += 1;
  }
  let incomeMismatches = 0;
  for (const row of globalIncome) {
    if ((await boss.legacyGlobalIncome(row.wallet)) !== BigInt(row.units6) * scale) incomeMismatches += 1;
  }
  if (identityMismatches || incomeMismatches) {
    throw new Error(`Verification failed: identity=${identityMismatches}, income=${incomeMismatches}.`);
  }
  if ((await boss.legacyIdentityCount()) !== 106n) throw new Error("Legacy identity count mismatch.");
  if ((await boss.legacyGlobalIncomeTotal()) !== expectedGlobalTotal) throw new Error("Global income total mismatch.");
  if ((await boss.legacyGlobalCount()) !== 72n) throw new Error("Global level count mismatch.");
  console.log("verified: 106 identities, 2,601 working USDT, 504 Global USDT, 72 Global levels");

  if (process.env.LEGACY_COMPLETION_FINALIZE === "1") {
    if (!(await boss.legacyIdentityFinalized())) await (await boss.finalizeLegacyIdentities()).wait();
    if (!(await boss.legacyGlobalIncomeFinalized())) await (await boss.finalizeLegacyGlobalIncome()).wait();
    if (!(await boss.legacyGlobalFinalized())) await (await boss.finalizeLegacyGlobal()).wait();
    console.log("all legacy imports permanently finalized");
  } else {
    console.log("not finalized; set LEGACY_COMPLETION_FINALIZE=1 only after verification");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
