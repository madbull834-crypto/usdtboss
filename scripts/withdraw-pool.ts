import { ethers } from "hardhat";

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  const amountInput = process.env.BOSS_POOL_WITHDRAW_AMOUNT;
  if (!proxy || !ethers.isAddress(proxy)) throw new Error("Set a valid BOSS_PROXY_ADDRESS.");
  if (!amountInput) throw new Error("Set BOSS_POOL_WITHDRAW_AMOUNT in whole-token units, for example 100.5.");
  if (process.env.CONFIRM_POOL_WITHDRAW !== "YES") {
    throw new Error("Set CONFIRM_POOL_WITHDRAW=YES after checking the remaining pool solvency.");
  }

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No owner signer configured.");

  const boss: any = await ethers.getContractAt("UsdtBossEducationalV7", proxy, signer);
  if (await boss.version() !== 7n) throw new Error("Proxy is not running V7.");

  const owner = await boss.owner();
  const signerAddress = await signer.getAddress();
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Configured signer ${signerAddress} is not owner ${owner}.`);
  }

  const recipientInput = process.env.BOSS_POOL_WITHDRAW_RECIPIENT || signerAddress;
  if (!ethers.isAddress(recipientInput) || recipientInput === ethers.ZeroAddress) {
    throw new Error("Set a valid non-zero BOSS_POOL_WITHDRAW_RECIPIENT.");
  }
  const recipient = ethers.getAddress(recipientInput);

  const tokenAddress = await boss.paymentToken();
  const token = new ethers.Contract(
    tokenAddress,
    ["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"],
    ethers.provider
  );
  const decimals = Number(await token.decimals());
  const amount = ethers.parseUnits(amountInput, decimals);
  if (amount === 0n) throw new Error("Withdrawal amount must be greater than zero.");

  const before = await token.balanceOf(proxy);
  if (amount > before) {
    throw new Error(`Requested ${amount} base units, but the proxy holds only ${before}.`);
  }

  console.log(`proxy ${proxy}`);
  console.log(`owner ${owner}`);
  console.log(`recipient ${recipient}`);
  console.log(`withdrawing ${ethers.formatUnits(amount, decimals)} payment tokens`);
  console.log(`pool before ${ethers.formatUnits(before, decimals)}`);
  console.log(`pool after ${ethers.formatUnits(before - amount, decimals)}`);

  const tx = await boss.withdrawPoolFunds(recipient, amount);
  console.log(`submitted ${tx.hash}`);
  await tx.wait();
  console.log("pool withdrawal confirmed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
