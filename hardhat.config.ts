import { HardhatUserConfig, subtask } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const deploymentEnv = resolve(__dirname, ".env");
const mainnetDeploymentEnv = resolve(__dirname, ".env.mainnet.local");
const networkArgument = process.argv.indexOf("--network");
const selectedNetwork = networkArgument >= 0 ? process.argv[networkArgument + 1] : process.env.HARDHAT_NETWORK;
if (selectedNetwork === "bscMainnet" && existsSync(mainnetDeploymentEnv)) {
  loadEnvFile(mainnetDeploymentEnv);
}
if (existsSync(deploymentEnv)) loadEnvFile(deploymentEnv);

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion === "0.8.26") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.26",
      longVersion: "0.8.26+commit.8a97fa7a"
    };
  }
  return runSuper();
});

const config: HardhatUserConfig = {
  // Without the optimizer this contract compiles to ~23.5KB, leaving barely
  // 1KB under the 24,576-byte EIP-170 limit; any addition overflows it.
  solidity: {
    compilers: [{
      version: "0.8.26",
      settings: { optimizer: { enabled: true, runs: 200 } }
    }],
    overrides: {
      // This state-correction implementation is intentionally optimized for
      // deployment size; its one-time migration loops are not user hot paths.
      "contracts/UsdtBossEducationalV10.sol": {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 1 } }
      },
      "contracts/UsdtBossEducationalV11.sol": {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 1 } }
      },
      "contracts/UsdtBossEducationalV12.sol": {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 1 } }
      },
      "contracts/UsdtBossEducationalV13.sol": {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 1 } }
      },
      "contracts/UsdtBossEducationalV14.sol": {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 1 } }
      }
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  networks: {
    // BSC is not in Hardhat's built-in hardfork history, so forking chain 97
    // for migration dry-runs needs this mapping. In-memory network only.
    hardhat: {
      chains: { 97: { hardforkHistory: { shanghai: 0 } } },
      ...(process.env.FORK_RPC_URL
        ? { forking: { url: process.env.FORK_RPC_URL } }
        : {})
    },
    localhost: { url: "http://127.0.0.1:8545" },
    bscTestnet: {
      chainId: 97,
      url: process.env.BSC_TESTNET_RPC_URL || "https://bsc-prebsc-dataseed.bnbchain.org",
      accounts: process.env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY
        ? [process.env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY]
        : []
    },
    bscMainnet: {
      chainId: 56,
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      accounts: process.env.BSC_MAINNET_DEPLOYER_PRIVATE_KEY
        ? [process.env.BSC_MAINNET_DEPLOYER_PRIVATE_KEY]
        : []
    }
  }
};

export default config;
