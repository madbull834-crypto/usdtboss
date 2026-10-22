import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const UPGRADE_TRANSACTION = "0x64c5ebbd63f410589b955de35cec98ce8a296b904000fcc008ebe088de52b320";
const SPONSOR = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
const ACCOUNTS = [
  "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
  "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
  "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
  "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
  "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4",
];

async function main() {
  const current: any = await ethers.getContractAt("UsdtBossEducationalV11", PROXY);
  const [version, owner, tokenAddress, queueLength] = await Promise.all([
    current.version(), current.owner(), current.paymentToken(),
    current.globalQueueLengthA(1),
  ]);
  if (version !== 11n) throw new Error(`Expected V11, found V${version}.`);
  if (!(await current.globalMembers(SPONSOR)).joined) throw new Error("Sponsor is not active.");
  if (queueLength < 5n) throw new Error("Stage-A queue is too short.");

  for (let index = 0; index < ACCOUNTS.length; index += 1) {
    const account = ACCOUNTS[index];
    const [member, global, queued] = await Promise.all([
      current.members(account), current.globalMembers(account),
      current.globalQueueAccountA(1, queueLength - 5n + BigInt(index)),
    ]);
    if (!member.joined || member.sponsor.toLowerCase() !== SPONSOR.toLowerCase()
      || member.highestSlot !== 1n || !global.joined || global.highestLevel !== 1n
      || queued.toLowerCase() !== account.toLowerCase()) {
      throw new Error(`V11 state verification failed for ${account}.`);
    }
  }

  const activationTopic = current.interface.getEvent("ApprovedGlobalPoolMemberActivated").topicHash;
  const transaction = await ethers.provider.getTransaction(UPGRADE_TRANSACTION);
  if (!transaction || transaction.from.toLowerCase() !== owner.toLowerCase()
    || transaction.to?.toLowerCase() !== PROXY.toLowerCase()) {
    throw new Error("Activation transaction owner/proxy verification failed.");
  }
  const receipt = await ethers.provider.getTransactionReceipt(UPGRADE_TRANSACTION);
  if (!receipt || receipt.status !== 1) throw new Error("Upgrade receipt did not succeed.");
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const tokenTransfers = receipt.logs.filter(log =>
    log.address.toLowerCase() === tokenAddress.toLowerCase() && log.topics[0] === transferTopic,
  );
  if (tokenTransfers.length) throw new Error("Upgrade transaction emitted payment-token transfers.");
  const receiptActivationLogs = receipt.logs.filter(log =>
    log.address.toLowerCase() === PROXY.toLowerCase() && log.topics[0] === activationTopic,
  );
  if (receiptActivationLogs.length !== 5) throw new Error("Upgrade receipt does not contain five activation events.");

  console.log(`V11 implementation ${await upgrades.erc1967.getImplementationAddress(PROXY)}`);
  console.log(`Atomic upgrade transaction ${transaction.hash}`);
  console.log(`Upgrade block ${receipt.blockNumber}; status ${receipt.status}; gas used ${receipt.gasUsed}`);
  console.log(`Stage-A Level-1 queue length ${queueLength}`);
  console.log("Verified five final queue entries, five activation events, and zero USDT Transfer events.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
