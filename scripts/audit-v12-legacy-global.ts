import { readFileSync } from "node:fs";
import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const ACTIVATION_TRANSACTION = "0xe99d233b88fd43f3315ceb2a2d65d33d48fef54e4484d3957168138fd5c882f1";
const QUEUE_LENGTH_BEFORE = 14n;

type LegacyGlobalRecord = { wallet: string; userid: string; level: number };

async function main() {
  const records = JSON.parse(readFileSync("legacy-global-payload.json", "utf8")) as LegacyGlobalRecord[];
  const boss: any = await ethers.getContractAt("UsdtBossEducationalV12", PROXY);
  const [version, queueLength, tokenAddress, implementation] = await Promise.all([
    boss.version(), boss.globalQueueLengthA(1), boss.paymentToken(),
    upgrades.erc1967.getImplementationAddress(PROXY),
  ]);
  if (version !== 12n) throw new Error(`Expected V12, found V${version}.`);
  if (queueLength !== 82n) throw new Error(`Expected queue length 82, found ${queueLength}.`);

  const receipt = await ethers.provider.getTransactionReceipt(ACTIVATION_TRANSACTION);
  if (!receipt || receipt.status !== 1) throw new Error("Activation transaction did not succeed.");
  const activationTopic = boss.interface.getEvent("LegacyGlobalPoolMemberActivated").topicHash;
  const activationLogs = receipt.logs.filter(log =>
    log.address.toLowerCase() === PROXY.toLowerCase() && log.topics[0] === activationTopic);
  if (activationLogs.length !== 68) throw new Error(`Expected 68 activation events, found ${activationLogs.length}.`);

  const activated = activationLogs.map(log => boss.interface.parseLog(log));
  for (let index = 0; index < activated.length; index += 1) {
    const event = activated[index];
    if (!event) throw new Error(`Could not decode activation event ${index}.`);
    const account = event.args.account as string;
    const [queued, global, filledA, filledB] = await Promise.all([
      boss.globalQueueAccountA(1, QUEUE_LENGTH_BEFORE + BigInt(index)),
      boss.globalMembers(account), boss.gpFilledA(1, account), boss.gpFilledB(1, account),
    ]);
    if (queued.toLowerCase() !== account.toLowerCase()
      || !global.joined || global.highestLevel !== 1n || filledA !== 0n || filledB !== 0n) {
      throw new Error(`Invalid live state for activated account ${account}.`);
    }
  }

  for (const record of records) {
    const [member, global, historicalLevel] = await Promise.all([
      boss.members(record.wallet), boss.globalMembers(record.wallet), boss.legacyGlobalLevel(record.wallet),
    ]);
    if (!member.joined || !global.joined || global.highestLevel < 1n
      || historicalLevel !== BigInt(record.level)) {
      throw new Error(`Historical/live reconciliation failed for user ${record.userid}.`);
    }
  }

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const tokenTransfers = receipt.logs.filter(log =>
    log.address.toLowerCase() === tokenAddress.toLowerCase() && log.topics[0] === transferTopic);
  if (tokenTransfers.length !== 0) throw new Error("Activation receipt contains a USDT transfer.");

  console.log(`V12 implementation ${implementation}`);
  console.log(`Activation transaction ${ACTIVATION_TRANSACTION}`);
  console.log(`Block ${receipt.blockNumber}; status ${receipt.status}; gas used ${receipt.gasUsed}`);
  console.log("Verified 72/72 historical users live, 68 clean queue additions, and zero USDT transfers.");
  console.log("Live Global Pool: 82 positions total (81 real users plus bootstrap)." );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
