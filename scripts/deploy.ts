import { ethers, upgrades } from "hardhat";

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const MAINNET_TREASURY = "0xEBD97f2695379F99E75bC5bddd48C0AAAC6E9f3d";
const MAINNET_ROOT = "0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployment signer configured. Set the private-key variable for the selected network.");
  }
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 31337n && chainId !== 97n && chainId !== 56n) {
    throw new Error("This deployment script supports local development and BSC networks only.");
  }
  const mainnet = chainId === 56n;
  if (mainnet && process.env.CONFIRM_MAINNET_DEPLOY !== "YES") {
    throw new Error("Set CONFIRM_MAINNET_DEPLOY=YES after completing the mainnet checklist.");
  }
  const bootstrap = process.env.BOSS_BOOTSTRAP_ADDRESS || (mainnet ? MAINNET_ROOT : deployer.address);
  const treasury = process.env.BOSS_TREASURY_ADDRESS || (mainnet ? MAINNET_TREASURY : deployer.address);
  // The requested mainnet authority model is deployer-controlled upgrades.
  // Any BOSS_OWNER_ADDRESS value is deliberately ignored on mainnet so the
  // initialized owner cannot accidentally differ from the signing account.
  const owner = mainnet ? deployer.address : process.env.BOSS_OWNER_ADDRESS || deployer.address;
  for (const [name, address] of Object.entries({ bootstrap, treasury, owner })) {
    if (!ethers.isAddress(address)) throw new Error(`Invalid ${name} address: ${address}`);
  }
  if (mainnet && ethers.getAddress(bootstrap) !== MAINNET_ROOT) {
    throw new Error(`BOSS_BOOTSTRAP_ADDRESS must be the approved root ${MAINNET_ROOT}.`);
  }
  if (mainnet && ethers.getAddress(treasury) !== MAINNET_TREASURY) {
    throw new Error(`BOSS_TREASURY_ADDRESS must be the approved treasury ${MAINNET_TREASURY}.`);
  }
  let tokenAddress: string;
  if (mainnet) {
    tokenAddress = process.env.BOSS_PAYMENT_TOKEN || BSC_USDT;
    if (!ethers.isAddress(tokenAddress) || await ethers.provider.getCode(tokenAddress) === "0x") {
      throw new Error("BOSS_PAYMENT_TOKEN is not a deployed contract.");
    }
    const token = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], ethers.provider);
    const decimals = Number(await token.decimals());
    if (decimals !== 18) throw new Error(`Expected 18-decimal BSC USDT, received ${decimals} decimals.`);
  } else {
    const token = await ethers.deployContract("MockUSDT");
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log(`MockUSDT deployed to ${tokenAddress}`);
  }
  const Boss = await ethers.getContractFactory("UsdtBossEducationalV6");
  const boss = await upgrades.deployProxy(Boss, [
    tokenAddress, treasury, bootstrap, owner
  ], { kind: "uups" });
  await boss.waitForDeployment();
  console.log(`Payment token: ${tokenAddress}`);
  console.log(`UsdtBossEducationalV6 deployed to ${await boss.getAddress()}`);
  const receipt = await boss.deploymentTransaction()!.wait();
  console.log(`VITE_CHAIN_ID=${chainId}`);
  console.log(`VITE_BOSS_ADDRESS=${await boss.getAddress()}`);
  console.log(`VITE_DEPLOYMENT_BLOCK=${receipt!.blockNumber}`);
  console.log(`BOSS_BOOTSTRAP_ADDRESS=${bootstrap}`);
  console.log(`BOSS_TREASURY_ADDRESS=${treasury}`);
  console.log(`BOSS_OWNER_ADDRESS=${owner}`);
  console.log("Migration is OPEN. Import legacy registrations, verify them, then call finalizeMigration().");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
