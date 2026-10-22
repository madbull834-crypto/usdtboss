import { Contract, JsonRpcProvider, formatUnits, getAddress } from "ethers";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL
  || "https://bsc-testnet-rpc.publicnode.com";
const TESTNET_PROXY = "0x50BB5f822E69130b95408EFE3E156b50c322a4D6";
const PREVIOUS_ROOT = getAddress("0x676c28c70b27E64C7b72203821f0db66BF022d65");
const MAINNET_ROOT = getAddress("0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f");
const OUTPUT = resolve("mainnet-registration-payload.json");

const abi = [
  "function queueLength(uint8) view returns(uint256)",
  "function queueAccount(uint8,uint256) view returns(address)",
  "function members(address) view returns(bool joined,address sponsor,uint32 directCount,uint8 highestSlot,uint256 withdrawable)",
  "function activatedAmount(address) view returns(uint256)",
  "function wasMigrated(address) view returns(bool)",
  "function slotPrice(uint8) view returns(uint256)",
];

async function main() {
  const provider = new JsonRpcProvider(TESTNET_RPC, 97, { staticNetwork: true });
  const boss = new Contract(TESTNET_PROXY, abi, provider);
  const queueCount = Number(await boss.queueLength(1));

  const accounts = await Promise.all(
    Array.from({ length: queueCount }, (_, index) => boss.queueAccount(1, index) as Promise<string>)
  );
  if (getAddress(accounts[0]) !== PREVIOUS_ROOT) throw new Error("Unexpected previous-platform root.");
  if (new Set(accounts.map(account => account.toLowerCase())).size !== queueCount) {
    throw new Error("Duplicate account in the testnet registration queue.");
  }

  const migratedFlags = await Promise.all(
    accounts.map(account => boss.wasMigrated(account) as Promise<boolean>)
  );
  const historicalAccounts = accounts.filter((_, index) => index === 0 || migratedFlags[index]);
  if (historicalAccounts.length !== 106) {
    throw new Error(`Expected the root plus 105 migrated accounts, received ${historicalAccounts.length}.`);
  }

  const records = [];
  const available = new Set([MAINNET_ROOT.toLowerCase()]);
  const [states, prices] = await Promise.all([
    Promise.all(historicalAccounts.map(async account => ({
      member: await boss.members(account),
      amount: await boss.activatedAmount(account) as bigint,
    }))),
    Promise.all(Array.from({ length: 12 }, (_, index) => boss.slotPrice(index + 1) as Promise<bigint>)),
  ]);
  for (let index = 0; index < historicalAccounts.length; index += 1) {
    const rawAccount = historicalAccounts[index];
    const account = getAddress(rawAccount);
    const { member, amount } = states[index];
    const level = Number(member.highestSlot);
    if (!member.joined || level < 1 || level > 12) throw new Error(`${account}: invalid member state.`);
    if (amount !== prices[level - 1]) throw new Error(`${account}: activated amount mismatch.`);

    const sponsor = account === PREVIOUS_ROOT ? MAINNET_ROOT : getAddress(member.sponsor);
    if (!available.has(sponsor.toLowerCase())) {
      throw new Error(`${account}: sponsor ${sponsor} is not available earlier in the import.`);
    }
    records.push({
      walletaddress: account,
      refaladdress: sponsor,
      level,
      amount: formatUnits(amount, 6),
    });
    available.add(account.toLowerCase());
  }

  const payload = {
    bootstrap: MAINNET_ROOT,
    tokenDecimals: 6,
    source: `BSC testnet proxy ${TESTNET_PROXY}`,
    previousRootMapping: `${PREVIOUS_ROOT} -> ${MAINNET_ROOT}`,
    records,
  };
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote ${records.length} sponsor-first records to ${OUTPUT}.`);
  console.log(`Previous root ${PREVIOUS_ROOT} is a direct child of ${MAINNET_ROOT}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
