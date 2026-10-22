import { ethers, upgrades, network } from "hardhat";
import { readFileSync } from "node:fs";

const PROXY = "0x50BB5f822E69130b95408EFE3E156b50c322a4D6";
const PAYLOAD = "/private/tmp/claude-501/-Users-singhrajnish-Desktop-solidity-react-counter-dapp/95fb6ca8-18c8-4679-9869-0a8e881fc30d/scratchpad/legacy/income-backfill.json";

async function main() {
  // Calls at the fork block itself count as "historical"; mine one local block
  // so everything executes on top of it with the configured hardfork.
  await network.provider.send("evm_mine");
  console.log("forked BSC testnet at block", await ethers.provider.getBlockNumber());

  const boss = await ethers.getContractAt("UsdtBossEducational", PROXY);
  const owner = await boss.owner();
  console.log("owner:", owner);

  // Snapshot pre-upgrade invariants we must not disturb.
  const before = {
    queue1: await boss.queueLength(1),
    rootMember: await boss.members(owner),
    treasury: await boss.treasury(),
    token: await boss.paymentToken(),
  };
  console.log("pre  : queueLength(1) =", before.queue1.toString());

  await network.provider.send("hardhat_impersonateAccount", [owner]);
  await network.provider.send("hardhat_setBalance", [owner, "0x56BC75E2D63100000"]);
  const ownerSigner = await ethers.getSigner(owner);

  // Upgrade the proxy explicitly: deploy the new implementation and point the
  // proxy at it via UUPS, rather than relying on the plugin's manifest state.
  const F = await ethers.getContractFactory("UsdtBossEducational", ownerSigner);
  const impl = await F.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  const uups = new ethers.Contract(PROXY, ["function upgradeToAndCall(address,bytes) payable"], ownerSigner);
  await (await uups.upgradeToAndCall(implAddr, "0x")).wait();
  const slot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const now = ethers.getAddress("0x" + (await ethers.provider.getStorage(PROXY, slot)).slice(26));
  console.log("implementation now   :", now, now === ethers.getAddress(implAddr) ? "(new) OK" : "MISMATCH");

  const b = (await ethers.getContractAt("UsdtBossEducational", PROXY)).connect(ownerSigner) as any;

  // Invariants survived?
  console.log("post : queueLength(1) =", (await b.queueLength(1)).toString());
  const rootAfter = await b.members(owner);
  console.log("root member intact   :",
    before.rootMember.joined === rootAfter.joined &&
    before.rootMember.highestSlot === rootAfter.highestSlot &&
    before.rootMember.directCount === rootAfter.directCount);
  console.log("treasury/token intact:",
    before.treasury === (await b.treasury()) && before.token === (await b.paymentToken()));

  // Run the backfill.
  const payload = JSON.parse(readFileSync(PAYLOAD, "utf8")) as any[];
  const records = payload.map(r => ({ account: ethers.getAddress(r.wallet), amount: BigInt(r.units6) }));
  const expected = records.reduce((s, r) => s + r.amount, 0n);
  for (let i = 0; i < records.length; i += 50) {
    await (await b.backfillLegacyIncome(records.slice(i, i + 50))).wait();
  }
  let bad = 0;
  for (const r of records) if ((await b.legacyIncome(r.account)) !== r.amount) bad++;
  console.log(`backfill verified    : ${records.length - bad}/${records.length} exact`);
  console.log("legacyIncomeTotal    :", ethers.formatUnits(await b.legacyIncomeTotal(), 6), "USDT (expected", ethers.formatUnits(expected, 6) + ")");

  // The critical safety property: no token liability was created.
  let wd = 0n;
  for (const r of records) wd += (await b.members(r.account)).withdrawable;
  console.log("sum(withdrawable) of recipients:", ethers.formatUnits(wd, 6), "USDT  <-- must be 0");
  console.log("matrixIncome of top earner     :", ethers.formatUnits(await b.matrixIncome(records[0].account), 6), " <-- must be 0");

  // Idempotency: re-sending the same batch must not double anything.
  await (await b.backfillLegacyIncome(records.slice(0, 50))).wait();
  console.log("after re-send total  :", ethers.formatUnits(await b.legacyIncomeTotal(), 6), "USDT  <-- must be unchanged");

  // Finalize closes the door.
  await (await b.finalizeLegacyBackfill()).wait();
  const closed = await b.backfillLegacyIncome(records.slice(0, 1)).then(() => false, () => true);
  console.log("blocked after finalize:", closed);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
