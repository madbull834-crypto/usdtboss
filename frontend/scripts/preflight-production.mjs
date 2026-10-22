import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, getAddress, isAddress, JsonRpcProvider } from "ethers";

const BSC_USDT=getAddress("0x55d398326f99059fF775485246999027B3197955");
const EXPECTED_TREASURY=getAddress("0xEBD97f2695379F99E75bC5bddd48C0AAAC6E9f3d");
const EXPECTED_ROOT=getAddress("0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f");

function envFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith("#"))
    .map(line => { const at=line.indexOf("="); return [line.slice(0,at),line.slice(at+1).trim()]; }));
}

const values={...envFile(resolve(".env.bsc-mainnet")),...envFile(resolve(".env.bsc-mainnet.local")),...process.env};
const required=["VITE_RPC_URL","VITE_BOSS_ADDRESS","VITE_DEPLOYMENT_BLOCK"];
for(const key of required) if(!values[key]) throw new Error(`${key} is required in frontend/.env.bsc-mainnet.local`);
if(values.VITE_CHAIN_ID!=="56") throw new Error("VITE_CHAIN_ID must be 56 for BSC mainnet.");
if(!isAddress(values.VITE_BOSS_ADDRESS) || getAddress(values.VITE_BOSS_ADDRESS)===getAddress("0x0000000000000000000000000000000000000000")) throw new Error("VITE_BOSS_ADDRESS must be a non-zero contract address.");
if(!/^\d+$/.test(values.VITE_DEPLOYMENT_BLOCK) || BigInt(values.VITE_DEPLOYMENT_BLOCK)<=0n) throw new Error("VITE_DEPLOYMENT_BLOCK must be a positive integer.");
const rpc=new JsonRpcProvider(values.VITE_RPC_URL,56,{staticNetwork:true});
const [network,code,currentBlock]=await Promise.all([rpc.getNetwork(),rpc.getCode(values.VITE_BOSS_ADDRESS),rpc.getBlockNumber()]);
if(network.chainId!==56n) throw new Error("VITE_RPC_URL is not connected to BSC mainnet.");
if(code==="0x") throw new Error("VITE_BOSS_ADDRESS has no deployed code on BSC mainnet.");
if(BigInt(values.VITE_DEPLOYMENT_BLOCK)>BigInt(currentBlock)) throw new Error("VITE_DEPLOYMENT_BLOCK is in the future.");
const boss=new Contract(values.VITE_BOSS_ADDRESS,[
  "function version() view returns(uint256)","function paymentToken() view returns(address)",
  "function paymentTokenUnit() view returns(uint256)","function treasury() view returns(address)",
  "function bootstrapAccount() view returns(address)","function owner() view returns(address)",
  "function migrationFinalized() view returns(bool)"
],rpc);
const [version,token,unit,treasury,root,owner,migrationFinalized]=await Promise.all([
  boss.version(),boss.paymentToken(),boss.paymentTokenUnit(),boss.treasury(),
  boss.bootstrapAccount(),boss.owner(),boss.migrationFinalized()
]);
if(version!==14n) throw new Error(`Expected contract V14, received V${version}.`);
if(getAddress(token)!==BSC_USDT || unit!==10n**18n) throw new Error("Contract is not configured for 18-decimal BSC USDT.");
if(getAddress(treasury)!==EXPECTED_TREASURY) throw new Error("Treasury does not match the approved accounting address.");
if(getAddress(root)!==EXPECTED_ROOT) throw new Error("Bootstrap account does not match the approved root address.");
if(!isAddress(owner) || getAddress(owner)===getAddress("0x0000000000000000000000000000000000000000")) throw new Error("Proxy owner is invalid.");
if(!migrationFinalized) throw new Error("Registration migration is still open; do not publish the frontend.");
console.log("Production frontend preflight passed.");
