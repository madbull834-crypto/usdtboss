import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "hardhat";

const PROXY_DEPLOYMENT_TX =
  "0x58190beb677fc72d59679874290e5007b5aef0f9e95af7fef31032af75613f7c";
const SOURCE_NAME = "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
const CONTRACT_NAME = `${SOURCE_NAME}:ERC1967Proxy`;
const API_URL = "https://api.etherscan.io/v2/api?chainid=56";

type ApiResponse = { status: string; message: string; result: string };

async function api(params: URLSearchParams): Promise<ApiResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) throw new Error(`Verification API returned HTTP ${response.status}.`);
  return await response.json() as ApiResponse;
}

async function main() {
  const proxy = process.env.BOSS_PROXY_ADDRESS;
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!proxy || !ethers.isAddress(proxy)) throw new Error("Set a valid BOSS_PROXY_ADDRESS.");
  if (!apiKey) throw new Error("Set ETHERSCAN_API_KEY.");

  const buildInfoPath = resolve(
    "node_modules/@openzeppelin/upgrades-core/artifacts/build-info-v5.json"
  );
  const artifactPath = resolve(
    "node_modules/@openzeppelin/upgrades-core/artifacts/@openzeppelin/" +
    "contracts-v5/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json"
  );
  const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const transaction = await ethers.provider.getTransaction(PROXY_DEPLOYMENT_TX);
  if (!transaction) throw new Error("Proxy deployment transaction was not found.");
  if (!transaction.data.toLowerCase().startsWith(artifact.bytecode.toLowerCase())) {
    throw new Error("Bundled OpenZeppelin proxy bytecode does not match the deployment transaction.");
  }
  const constructorArguments = transaction.data.slice(artifact.bytecode.length);

  const submission = await api(new URLSearchParams({
    apikey: apiKey,
    chainid: "56",
    module: "contract",
    action: "verifysourcecode",
    contractaddress: proxy,
    sourceCode: JSON.stringify(buildInfo.input),
    codeformat: "solidity-standard-json-input",
    contractname: CONTRACT_NAME,
    compilerversion: `v${buildInfo.solcLongVersion}`,
    constructorArguements: constructorArguments
  }));

  if (submission.status !== "1") {
    if (/already verified/i.test(submission.result)) {
      console.log("Proxy is already verified.");
      return;
    }
    throw new Error(`Verification submission failed: ${submission.message}: ${submission.result}`);
  }

  console.log(`Proxy verification submitted; GUID ${submission.result}`);
  for (let attempt = 0; attempt < 30; ++attempt) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000));
    const status = await api(new URLSearchParams({
      apikey: apiKey,
      chainid: "56",
      module: "contract",
      action: "checkverifystatus",
      guid: submission.result
    }));
    if (/pending/i.test(status.result)) continue;
    if (status.status === "1" || /already verified/i.test(status.result)) {
      console.log(`Proxy verification successful: https://bscscan.com/address/${proxy}#code`);
      return;
    }
    throw new Error(`Proxy verification failed: ${status.message}: ${status.result}`);
  }
  throw new Error("Proxy verification remained pending for more than 60 seconds.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
