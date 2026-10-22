import { ethers, upgrades } from "hardhat";

const PROXY = "0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040";
const SPONSOR = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
const ACCOUNTS = [
  "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
  "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
  "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
  "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
  "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4"
];

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS || PROXY;
  if (process.env.CONFIRM_FREE_MATRIX_REGISTRATION !== "YES") {
    throw new Error("Set CONFIRM_FREE_MATRIX_REGISTRATION=YES to execute the mainnet upgrade and registration.");
  }

  const current: any = await ethers.getContractAt("UsdtBossEducationalV8", proxy);
  const token = new ethers.Contract(
    await current.paymentToken(),
    ["function balanceOf(address) view returns (uint256)"],
    ethers.provider
  );
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const [owner, version, sponsorBefore, queueLengthBefore, proxyBalanceBefore] = await Promise.all([
    current.owner(), current.version(), current.members(SPONSOR),
    current.queueLength(1), token.balanceOf(proxy)
  ]);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error("Configured signer is not the proxy owner.");
  }
  if (version !== 8n) throw new Error(`Expected V8 proxy, found V${version}.`);
  if (!sponsorBefore.joined) throw new Error("The approved sponsor is not registered.");

  const protectedBalances = new Map<string, bigint>();
  for (const account of [owner, await current.treasury(), SPONSOR, ...ACCOUNTS]) {
    protectedBalances.set(account.toLowerCase(), await token.balanceOf(account));
  }
  for (const account of ACCOUNTS) {
    const member = await current.members(account);
    if (member.joined) throw new Error(`${account} is already registered.`);
  }

  const V9 = await ethers.getContractFactory("UsdtBossEducationalV9");
  await upgrades.validateUpgrade(proxy, V9, { kind: "uups" });
  const upgraded: any = await upgrades.upgradeProxy(proxy, V9, {
    kind: "uups",
    call: { fn: "registerApprovedMatrixMembers", args: [] }
  });
  await upgraded.waitForDeployment();
  const transaction = upgraded.deploymentTransaction();
  if (transaction) await transaction.wait();

  // deploymentTransaction() can refer to the implementation deployment rather
  // than the later proxy upgrade. Poll fresh blocks until the proxy read catches up.
  let confirmedVersion = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await ethers.provider.getBlockNumber();
    if (await upgraded.version() === 9n) { confirmedVersion = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!confirmedVersion) {
    throw new Error("Post-upgrade version verification failed.");
  }
  if (await upgraded.queueLength(1) !== queueLengthBefore + 5n) {
    throw new Error("Post-upgrade Slot-1 queue length is wrong.");
  }
  if (await token.balanceOf(proxy) !== proxyBalanceBefore) {
    throw new Error("Registration unexpectedly changed the proxy token balance.");
  }
  const sponsorAfter = await upgraded.members(SPONSOR);
  if (sponsorAfter.directCount !== sponsorBefore.directCount + 5n) {
    throw new Error("Sponsor direct count did not increase by five.");
  }

  const price = await upgraded.slotPrice(1);
  for (let index = 0; index < ACCOUNTS.length; index += 1) {
    const account = ACCOUNTS[index];
    const [member, amount, parent, filled, gross, income, queued] = await Promise.all([
      upgraded.members(account), upgraded.activatedAmount(account),
      upgraded.matrixParent(1, account), upgraded.childrenFilled(1, account),
      upgraded.cycleGross(1, account), upgraded.matrixIncome(account),
      upgraded.queueAccount(1, queueLengthBefore + BigInt(index))
    ]);
    if (!member.joined || member.sponsor.toLowerCase() !== SPONSOR.toLowerCase()
      || member.highestSlot !== 1n || amount !== price
      || parent !== ethers.ZeroAddress || filled !== 0n || gross !== 0n || income !== 0n
      || queued.toLowerCase() !== account.toLowerCase()) {
      throw new Error(`Post-upgrade registration verification failed for ${account}.`);
    }
  }
  for (const [account, balance] of protectedBalances) {
    if (await token.balanceOf(account) !== balance) {
      throw new Error(`Registration unexpectedly changed token balance for ${account}.`);
    }
  }

  console.log(`V9 implementation ${await upgrades.erc1967.getImplementationAddress(proxy)}`);
  console.log(`Proxy ${proxy}; upgrade transaction ${transaction?.hash ?? "submitted"}`);
  console.log("Registered five approved wallets at Slot 1 with no payment-token movement.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
