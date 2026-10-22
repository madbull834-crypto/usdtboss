import { BrowserProvider, Contract, EventLog, FetchRequest, JsonRpcProvider, Log, ZeroAddress, formatUnits, getAddress, isAddress, type Eip1193Provider, type LogParams } from "ethers";
import { PublicKey } from "./address";
import { LEGACY_USER_IDS } from "./legacyUserIds";
import type { MatrixTreeNode, MatrixProfile, SolTrustUserAccount, SolTrustPaymentEvent, SolTrustIncomeSlotEntry, SolTrustSlotIncomeEntry, SolTrustSlotUpgradeMatrixPosition, SolTrustMatrixPosition, SolTrustSlotIncomeState, SolTrustRoyalPool, RegistrationContribution, IncomeReceipt, MatrixPlacement, PlacementTreeNode, LegacyGrowthView } from "./types";
export type * from "./types";

export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337);
export const PROGRAM_ID = new PublicKey(import.meta.env.VITE_BOSS_ADDRESS || ZeroAddress);
export let DEFAULT_REFERRER = new PublicKey(import.meta.env.VITE_DEFAULT_SPONSOR || ZeroAddress);
const ABI = [
 "function bootstrapAccount() view returns(address)", "function treasury() view returns(address)",
 "function paymentToken() view returns(address)",
 "function paymentTokenUnit() view returns(uint256)",
 "function members(address) view returns(bool joined,address sponsor,uint32 directCount,uint8 highestSlot,uint256 withdrawable)",
 "function globalMembers(address) view returns(bool joined,uint8 highestLevel)",
 "function childrenFilled(uint8,address) view returns(uint8)",
 "function cycleGross(uint8,address) view returns(uint256)",
 "function gpFilledA(uint8,address) view returns(uint8)",
 "function gpFilledB(uint8,address) view returns(uint8)",
 "function slotPrice(uint8) view returns(uint256)",
 "function queueLength(uint8) view returns(uint256)", "function queueAccount(uint8,uint256) view returns(address)",
 "function globalQueueLengthA(uint8) view returns(uint256)",
 "function globalPoolEntry(uint8) view returns(uint256)",
 "function activatedAmount(address) view returns(uint256)",
 "function wasMigrated(address) view returns(bool)",
 "function migrationFinalized() view returns(bool)",
 "function matrixChildren(uint8,address) view returns(address[])",
 "function matrixIncome(address) view returns(uint256)",
 "function globalIncome(address) view returns(uint256)",
 "function legacyIncome(address) view returns(uint256)",
 "function legacyGlobalLevel(address) view returns(uint8)",
 "function legacyGlobalIncome(address) view returns(uint256)",
 "function legacyUserId(address) view returns(uint256)",
 "function legacyGlobalCount() view returns(uint256)",
 "function legacyGrowth(uint8,address) view returns(address parent,uint32 sourceId,uint32 generationId,uint32 position,uint8 level,bool imported,uint256 position1Income,uint256 position2Income)",
 "function legacyGrowthChildrenLength(uint8,address) view returns(uint256)",
 "function legacyGrowthChild(uint8,address,uint256) view returns(address)",
 "error AlreadyJoined()", "error SponsorNotJoined()", "error NothingToWithdraw()", "error MigrationStillOpen()",
 "function join(address)", "function joinGlobalPool(address)", "function withdraw()",
 "event Joined(address indexed member,address indexed sponsor)",
 "event SlotActivated(address indexed member,uint8 indexed slot,address indexed parent)",
 "event CycleCompleted(address indexed member,uint8 indexed slot,uint256 gross,uint256 upgradeReserved,uint256 adminFee,uint256 credited)",
 "event GlobalPoolJoined(address indexed member,address indexed sponsor)",
 "event GlobalCycleCompleted(address indexed member,uint8 indexed level,uint256 gross,uint256 nextLevelReserved,uint256 adminFee,uint256 credited)",
 "event CycleAdvancePaid(address indexed account,uint8 indexed slot,uint256 credited,uint256 adminFee)",
 "event DirectCommissionPaid(address indexed sponsor,address indexed member,uint256 credited,uint256 adminFee)",
 "event UpgradeSavingsChanged(address indexed account,uint256 balance)",
 "event Withdrawn(address indexed member,uint256 amount)"
];
const TOKEN_ABI = ["function decimals() view returns(uint8)", "function balanceOf(address) view returns(uint256)", "function allowance(address,address) view returns(uint256)", "function approve(address,uint256) returns(bool)", "function mint(address,uint256)"];
const rpcRequest = new FetchRequest(RPC_URL);
// Kept well under the old 30s so a stalled public RPC surfaces as a visible
// error instead of a long silent wait.
rpcRequest.timeout = 15000;
rpcRequest.setThrottleParams({maxAttempts:3});
// Public BSC endpoints frequently reject JSON-RPC batches even when every
// individual eth_call is valid. Keep state reads unbatched; the bounded mapper
// below controls concurrency for large queues.
const rpc = new JsonRpcProvider(rpcRequest,CHAIN_ID,{staticNetwork:true,batchMaxCount:1});
export const connection = () => rpc;
type Injected = Eip1193Provider & { on?: (name:string, handler:()=>void)=>void };
const injected = () => (window as Window & {ethereum?:Injected}).ethereum;
let connected: PublicKey | undefined;
let connecting: Promise<{publicKey: PublicKey}> | undefined;
let writing = false;
let snapshotCache: {expires:number; promise:ReturnType<typeof loadSnapshot>} | undefined;
let walletSummaryCache: {wallet:string;expires:number;promise:Promise<WalletDashboardSummary>} | undefined;
let paymentDecimals = 6;
const unit = (amount:bigint) => Number(formatUnits(amount,paymentDecimals));

// Public display IDs follow the immutable Slot-1 queue order. Keeping this
// separate from legacyUserId means newly registered wallets receive the same
// clear, non-zero sequence as migrated wallets without changing contract data.
export const DISPLAY_USER_ID_START = 1000n;
export const DISPLAY_USER_ID_STEP = 2n;
export function displayUserIdForQueueIndex(index:number):bigint {
 if(!Number.isSafeInteger(index) || index<0) throw new Error("Invalid member queue index.");
 return DISPLAY_USER_ID_START + BigInt(index)*DISPLAY_USER_ID_STEP;
}

// migrateMembers appends records in the same order used to generate the
// legacy ID file. Queue index 0 is the bootstrap account; migrated members
// therefore occupy indices 1..N and live registrations follow them.
const MIGRATED_QUEUE_INDEX = new Map(
 Object.keys(LEGACY_USER_IDS).map((wallet,index)=>[wallet,index+1])
);
const displayUserIdCache = new Map<string,bigint>(
 [...MIGRATED_QUEUE_INDEX].map(([wallet,index])=>[wallet,displayUserIdForQueueIndex(index)])
);

async function displayUserIdForWallet(c:Contract,wallet:string):Promise<bigint> {
 const key=wallet.toLowerCase();
 const cached=displayUserIdCache.get(key);
 if(cached !== undefined) return cached;
 const bootstrap=(await c.bootstrapAccount() as string).toLowerCase();
 if(key===bootstrap) {
  const id=displayUserIdForQueueIndex(0);
  displayUserIdCache.set(key,id);
  return id;
 }
 const length=Number(await c.queueLength(1));
 // Only live registrations need RPC lookup; migrated indices are already
 // known above. Search newest-first so recently joined wallets resolve fast.
 for(let index=length-1;index>MIGRATED_QUEUE_INDEX.size;index--) {
  const account=(await c.queueAccount(1,index) as string).toLowerCase();
  const id=displayUserIdForQueueIndex(index);
  displayUserIdCache.set(account,id);
  if(account===key) return id;
 }
 return 0n;
}

async function readLegacyGrowth(c:Contract,tree:number,wallet:string):Promise<LegacyGrowthView> {
 try {
  const [stored,directCount]=await Promise.all([
   c.legacyGrowth(tree,wallet),c.legacyGrowthChildrenLength(tree,wallet)
  ]);
  return {tree,sourceId:Number(stored.sourceId),generationId:Number(stored.generationId),
   parent:stored.parent,position:Number(stored.position),level:Number(stored.level),
   imported:Boolean(stored.imported),directCount:Number(directCount),
   position1Income:unit(stored.position1Income),position2Income:unit(stored.position2Income)};
 } catch {
  return {tree,sourceId:0,generationId:0,parent:ZeroAddress,position:0,level:0,
   imported:false,directCount:0,position1Income:0,position2Income:0};
 }
}
async function loadLegacyGrowth(c:Contract,wallet:string):Promise<LegacyGrowthView[]> {
 return Promise.all([1,2].map(tree=>readLegacyGrowth(c,tree,wallet)));
}

export type LegacyGrowthNode = LegacyGrowthView & {wallet:string;depth:number;userId:bigint};
export async function getLegacyGrowthTree(wallet:string,tree:number):Promise<LegacyGrowthNode[]> {
 if(!isAddress(wallet)) throw new Error("Enter a valid EVM wallet address.");
 if(tree!==1 && tree!==2) throw new Error("Growth tree must be 1 or 2.");
 const c=await contract(), root=getAddress(wallet);
 const rootRecord=await readLegacyGrowth(c,tree,root);
 if(!rootRecord.imported) return [];
 const rootUserId=await c.legacyUserId(root).then((value:bigint)=>value,()=>0n);
 const rows:LegacyGrowthNode[]=[{...rootRecord,wallet:root,depth:0,userId:rootUserId}];
 const seen=new Set([walletKey(root)]);
 let frontier=[root];
 for(let depth=1;frontier.length && rows.length<512;depth++) {
  const groups=await mapRpc(frontier,async parent=>{
   const count=Number(await c.legacyGrowthChildrenLength(tree,parent));
   return mapRpc(Array.from({length:count},(_,index)=>index),index=>c.legacyGrowthChild(tree,parent,index) as Promise<string>);
  });
  const next:string[]=[];
  const children=groups.flat().filter(child=>{
   const key=walletKey(child);
   if(seen.has(key)) return false;
   seen.add(key);
   return true;
  });
  const [childRecords,childUserIds]=await Promise.all([
   mapRpc(children,child=>readLegacyGrowth(c,tree,child)),
   mapRpc(children,child=>c.legacyUserId(child).then((value:bigint)=>value,()=>0n))
  ]);
  children.forEach((child,index)=>{
   const record=childRecords[index];
   if(!record.imported) return;
   rows.push({...record,wallet:child,depth,userId:childUserIds[index]});
   next.push(child);
  });
  frontier=next;
 }
 return rows;
}

function userView(wallet:string,member:{sponsor:string;directCount:bigint;highestSlot:bigint},userId:bigint):SolTrustUserAccount {
 const slot=Number(member.highestSlot);
 return {
  wallet,referrer:member.sponsor,firstUpline:member.sponsor,secondUpline:ZeroAddress,thirdUpline:ZeroAddress,
  firstDownline:null,secondDownline:null,userId,directReferralCount:Number(member.directCount),
  currentSlot:slot,activeSlotBitmap:(1<<slot)-1,exited:false,recycleCounts:Array(12).fill(0),registeredAt:0n,
  pocketFillCount:0,placementPocketOwner:null,placementPocketPosition:0,incomeTreeCount:0,incomeTreeCycle:0,
  incomeTreeSlot:slot,incomeUpgradeReserveSol:0,incomeRecycleReady:false,referralIncomeTreeOwner:null,
  referralIncomeTreePosition:0,referralIncomeTreeCycle:0
 };
}

async function contract() {
 if (PROGRAM_ID.toString() === ZeroAddress) throw new Error("Set VITE_BOSS_ADDRESS to the deployed EVM contract.");
 if (Number((await rpc.getNetwork()).chainId) !== CHAIN_ID) throw new Error("Configured RPC is on the wrong chain.");
 if (await rpc.getCode(PROGRAM_ID.toString()) === "0x") throw new Error("The EVM contract is not deployed at the configured address.");
 const c=new Contract(PROGRAM_ID.toString(),ABI,rpc);
 const token=new Contract(await c.paymentToken(),TOKEN_ABI,rpc);
 const decimals=Number(await token.decimals());
 if(decimals!==6 && decimals!==18) throw new Error("The configured payment token has unsupported decimals.");
 const tokenUnit=await c.paymentTokenUnit().catch(()=>10n**BigInt(decimals));
 if(tokenUnit!==10n**BigInt(decimals)) throw new Error("Contract and payment-token units do not match.");
 paymentDecimals=decimals;
 return c;
}
export async function initializeEvm() {
 try {
  const accounts = await injected()?.request({method:"eth_accounts"}) as string[] | undefined;
  const chain = await injected()?.request({method:"eth_chainId"});
  connected = Number(chain) === CHAIN_ID && accounts?.[0] ? new PublicKey(accounts[0]) : undefined;
 } catch { connected = undefined; }
 try { DEFAULT_REFERRER = new PublicKey(await (await contract()).bootstrapAccount()); } catch { /* UI reports RPC/config errors when loading. */ }
 const changed = () => { connected = undefined; snapshotCache=undefined; window.location.reload(); };
 injected()?.on?.("accountsChanged",() => { if (!connecting) changed(); });
 injected()?.on?.("chainChanged",() => { if (!connecting) changed(); });
}
export function evmProvider() {
 const eth = injected();
 if (!eth) return null;
 return {
  publicKey: connected,
  async connect() {
   if (connecting) return connecting;
   connecting = (async () => {
   connected = undefined;
   await eth.request({method:"eth_requestAccounts"});
   if (Number(await eth.request({method:"eth_chainId"})) !== CHAIN_ID && (CHAIN_ID === 56 || CHAIN_ID === 97 || CHAIN_ID === 31337)) {
    const local = CHAIN_ID === 31337;
    const mainnet = CHAIN_ID === 56;
    const chainId = local ? "0x7a69" : mainnet ? "0x38" : "0x61";
    try {
     await eth.request({method:"wallet_switchEthereumChain",params:[{chainId}]});
    } catch (error) {
     if ((error as {code?:number}).code !== 4902) throw error;
     await eth.request({method:"wallet_addEthereumChain",params:[{
      chainId,
      chainName:local ? "Local Hardhat" : mainnet ? "BNB Smart Chain" : "BNB Smart Chain Testnet",
      nativeCurrency:local
       ? {name:"Ether",symbol:"ETH",decimals:18}
       : {name:mainnet?"BNB":"Test BNB",symbol:mainnet?"BNB":"tBNB",decimals:18},
      rpcUrls:[RPC_URL],
      ...(local ? {} : {blockExplorerUrls:[mainnet?"https://bscscan.com":"https://testnet.bscscan.com"]})
     }]});
     await eth.request({method:"wallet_switchEthereumChain",params:[{chainId}]});
    }
   }
   const provider = new BrowserProvider(eth);
   if (Number((await provider.getNetwork()).chainId)!==CHAIN_ID) throw new Error(
    CHAIN_ID === 56 ? "Switch your wallet to BNB Smart Chain (chain ID 56), then click Login again."
    : CHAIN_ID === 97 ? "Switch your wallet to BNB Smart Chain Testnet (chain ID 97), then click Login again."
    : `Switch your wallet to Local Hardhat (chain ID ${CHAIN_ID}), then click Login again.`);
   connected = new PublicKey(await (await provider.getSigner()).getAddress());
   snapshotCache = undefined;
   walletSummaryCache = undefined;
   window.dispatchEvent(new Event("boss:updated"));
   return {publicKey:connected};
   })();
   try { return await connecting; } finally { connecting = undefined; }
  },
  async disconnect() { connected=undefined; }
 };
}
// Contract history comes from eth_getLogs, which free public nodes restrict:
// publicnode prunes logs after a few days ("History has been pruned") and most
// others rate-limit wide ranges. History therefore uses its own endpoint list,
// tried in order, with one scan for every event type, an adaptive block span,
// and a per-browser cache so a returning visitor only scans new blocks.
const LOG_RPC_URLS:string[]=String(import.meta.env.VITE_LOGS_RPC_URLS ||
 (CHAIN_ID===97 ? "https://bnb-testnet.api.onfinality.io/public,"+RPC_URL : RPC_URL))
 .split(",").map(u=>u.trim()).filter(Boolean);
const logRpcs=LOG_RPC_URLS.map(url=>{const r=new FetchRequest(url);r.timeout=20000;
 // Fail over quickly instead of backing off for a minute on a rate-limited node.
 r.setThrottleParams({maxAttempts:2});return new JsonRpcProvider(r,CHAIN_ID,{staticNetwork:true,batchMaxCount:1});});
const LOG_CONCURRENCY=2, MIN_SPAN=500, HISTORY_CHUNK=100000;
// Contract state (members, sponsors, direct counts, slot levels, balances) is
// always readable and is what most of the dashboard shows. Log history only
// adds income records and matrix placements, so it must never hold that state
// hostage: past this budget the snapshot resolves without history and reports
// it as pending. The scan keeps running and the next refresh picks it up.
const HISTORY_BUDGET_MS=8000;
type LogResult={found:Log[];error:string|null};
let logSpan=10000, preferredLogRpc=0;
class RangeTooWide extends Error {}
const errorText=(e:unknown)=>(e as {error?:{message?:string}})?.error?.message
 || (e as {shortMessage?:string})?.shortMessage || (e instanceof Error ? e.message : String(e));
// Deliberately excludes "too many": that matches 429 "Too Many Requests",
// which is rate limiting and must fail over rather than shrink the range.
const isRangeError=(e:unknown)=>/block range|range limit|response size|ranges over|returned more than/i.test(errorText(e));
const isStateRateLimit=(e:unknown)=>/rate limit|too many requests|limit exceeded|-32005/i.test(errorText(e));
async function stateRetry<T>(task:()=>Promise<T>):Promise<T> {
 let last:unknown;
 for(let attempt=0;attempt<4;attempt++) {
  try { return await task(); }
  catch(e) {
   last=e;
   if(!isStateRateLimit(e) || attempt===3) throw e;
   await pause(500*2**attempt);
  }
 }
 throw last;
}
async function mapRpc<T,R>(items:T[],fn:(item:T,index:number)=>Promise<R>,limit=3):Promise<R[]> {
 const results=new Array<R>(items.length);
 let next=0;
 const worker=async()=>{
  for(;;) {
   const index=next++;
   if(index>=items.length) return;
   results[index]=await stateRetry(()=>fn(items[index],index));
  }
 };
 await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
 return results;
}

const isRateLimit=(e:unknown)=>/429|too many requests|rate limit|limit exceeded/i.test(errorText(e)+" "+JSON.stringify((e as {info?:unknown})?.info ?? ""));
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchRange(from:number,to:number):Promise<Log[]> {
 let lastError:unknown;
 // Public nodes answer bursts with 429. Back off and retry instead of failing
 // the whole history, which would show every income figure as zero.
 for(let round=0;round<4;round++) {
  let limited=false;
  for(let n=0;n<logRpcs.length;n++) {
   const i=(preferredLogRpc+n)%logRpcs.length;
   try {
    const found=await logRpcs[i].getLogs({address:PROGRAM_ID.toString(),fromBlock:from,toBlock:to});
    preferredLogRpc=i;
    return found;
   } catch(e) {
    lastError=e;
    if(isRangeError(e) && to-from+1>MIN_SPAN) throw new RangeTooWide();
    if(isRateLimit(e)) limited=true;
   }
  }
  if(!limited) break;
  await pause(1500*2**round);
 }
 throw new Error("Could not load the contract history. Every configured RPC endpoint refused the request "+
  "(old blocks pruned or rate limited). Try again shortly, or set VITE_LOGS_RPC_URLS to an archive RPC. "+
  "Last error: "+errorText(lastError).slice(0,140));
}
async function scanLogs(from:number,to:number):Promise<Log[]> {
 const ranges:[number,number][]=[];
 for(let a=from;a<=to;a+=logSpan) ranges.push([a,Math.min(a+logSpan-1,to)]);
 const found:Log[]=[];
 const worker=async()=>{
  for(let r=ranges.shift();r;r=ranges.shift()) {
   try { found.push(...await fetchRange(r[0],r[1])); }
   catch(e) {
    if(!(e instanceof RangeTooWide)) throw e;
    const mid=Math.floor((r[0]+r[1])/2);
    logSpan=Math.max(MIN_SPAN,Math.floor((r[1]-r[0]+1)/2));
    ranges.push([r[0],mid],[mid+1,r[1]]);
   }
  }
 };
 await Promise.all(Array.from({length:LOG_CONCURRENCY},worker));
 return found.sort((a,b)=>a.blockNumber-b.blockNumber || a.index-b.index);
}

const LOG_CACHE_KEY="boss-logs:"+CHAIN_ID+":"+PROGRAM_ID.toString().toLowerCase();
let logCache:{to:number;logs:Log[]}|undefined;
let scanning:Promise<Log[]>|undefined;
function readLogCache() {
 try {
  const raw=localStorage.getItem(LOG_CACHE_KEY);
  if(!raw) return;
  const parsed=JSON.parse(raw) as {to:number;logs:LogParams[]};
  logCache={to:parsed.to,logs:parsed.logs.map(l=>new Log(l,rpc))};
 } catch { logCache=undefined; }
}
function writeLogCache() {
 try {
  if(!logCache) return;
  localStorage.setItem(LOG_CACHE_KEY,JSON.stringify({to:logCache.to,logs:logCache.logs.map(l=>({
   transactionHash:l.transactionHash,blockHash:l.blockHash,blockNumber:l.blockNumber,removed:l.removed,
   address:l.address,data:l.data,topics:l.topics,index:l.index,transactionIndex:l.transactionIndex
  }))}));
 } catch { /* storage full or blocked: the in-memory cache still works */ }
}
async function allLogs(to:number):Promise<Log[]> {
 if(scanning) return scanning;
 scanning=(async()=>{
  const start=Number(import.meta.env.VITE_DEPLOYMENT_BLOCK || 0);
  if(!Number.isSafeInteger(start) || start<0 || (CHAIN_ID!==31337 && start===0)) throw new Error("Set VITE_DEPLOYMENT_BLOCK to the contract deployment block before loading history.");
  if(!logCache) readLogCache();
  if(logCache && to<=logCache.to) return logCache.logs;
  // Re-read the last 12 blocks on each refresh to cover shallow reorganizations.
  const resume=logCache ? Math.max(start,logCache.to-12) : start;
  let logs=logCache?.logs.filter(l=>l.blockNumber<resume) ?? [];
  // Scan in chunks and save after each one, so a refused request later in the
  // range keeps the progress made so far and the next load resumes from there.
  for(let from=resume;from<=to;from+=HISTORY_CHUNK) {
   const end=Math.min(from+HISTORY_CHUNK-1,to);
   logs=[...logs,...await scanLogs(from,end)];
   logCache={to:end,logs};
   writeLogCache();
  }
  return logs;
 })();
 try { return await scanning; } finally { scanning=undefined; }
}
function eventsNamed(c:Contract,found:Log[],name:string):EventLog[] {
 const fragment=c.interface.getEvent(name)!;
 return found.filter(l=>l.topics[0]===fragment.topicHash).map(l=>new EventLog(l,c.interface,fragment));
}
async function loadSnapshot() {
 const c=await contract(), block=await rpc.getBlockNumber(), at={blockTag:block};
 // Members and the matrix come from contract state, which nodes never prune.
 // Event history only adds join dates and income records, so it is loaded
 // best-effort: when every history RPC refuses, the app keeps working and
 // reports historyError instead of failing the whole page.
 const queue=async(slot:number)=>{
  const length=Number(await c.queueLength(slot,at));
  return mapRpc(Array.from({length},(_,i)=>i),i=>c.queueAccount(slot,i,at) as Promise<string>);
 };
 const [wallets,poolSize,legacyPool,logResult]=await Promise.all([
  queue(1),c.globalQueueLengthA(1,at),
  // How many members held a Global Pool position on the previous platform.
  // A contract-wide counter, so it costs one call and needs no wallet.
  // Contracts predating the import revert, which reads as 0.
  c.legacyGlobalCount(at).then((v:bigint)=>Number(v),()=>0),
  Promise.race<LogResult>([
   allLogs(block).then(found=>({found,error:null}),(e:unknown)=>({found:[],error:errorText(e)})),
   new Promise<LogResult>(resolve=>setTimeout(()=>resolve({found:[],
    error:"Income history is still loading from the network."}),HISTORY_BUDGET_MS))
  ])
 ]);
 const [joins,cycles,poolCycles,poolJoins,withdrawals,cycleAdvances,directCommissions]=
  ["Joined","CycleCompleted","GlobalCycleCompleted","GlobalPoolJoined","Withdrawn","CycleAdvancePaid","DirectCommissionPaid"]
   .map(n=>eventsNamed(c,logResult.found,n));
 const users:SolTrustUserAccount[]=await mapRpc(wallets,async (wallet,index)=>{
  displayUserIdCache.set(wallet.toLowerCase(),displayUserIdForQueueIndex(index));
  const member=await c.members(wallet,{blockTag:block});
  const joined=joins.find(e=>e.args.member===wallet);
  const timestamp=joined ? BigInt((await rpc.getBlock(joined.blockNumber))?.timestamp || 0) : 0n;
  return {...userView(wallet,member,displayUserIdForQueueIndex(index)),registeredAt:timestamp};
 });
 const payments:SolTrustPaymentEvent[]=[];
 for(const event of [...cycles,...poolCycles,...cycleAdvances,...directCommissions]
  .sort((a,b)=>a.blockNumber-b.blockNumber || a.index-b.index)) {
  const name=event.fragment.name;
  const isPool=name==="GlobalCycleCompleted";
  const isDirect=name==="DirectCommissionPaid";
  const isAdvance=name==="CycleAdvancePaid";
  const timestamp=BigInt((await rpc.getBlock(event.blockNumber))?.timestamp || 0);
  const recipient=(isDirect ? event.args.sponsor : isAdvance ? event.args.account : event.args.member) as string;
  const amount=unit(event.args.credited);
  // CycleCompleted can legitimately settle at zero because the slot-price
  // income was paid earlier by CycleAdvancePaid. Zero-value settlement events
  // are cycle bookkeeping, not an additional income row.
  if(amount===0) continue;
  payments.push({
   matrixId:BigInt(payments.length+1),cycleKind:isPool?2:0,
   slotNumber:Number(isPool?event.args.level:isDirect?1:event.args.slot),
   idNumber:0,payer:isDirect ? event.args.member as string : ZeroAddress,recipient,amountSol:amount,
   eventType:isDirect?2:1,timestamp,incomeTreeOwner:recipient,incomeTreePosition:0,incomeTreeCycle:0
  });
 }
 // Placements come from two sources that each cover a different era, so both
 // are read and merged: matrixChildren() state (needs no event history, but
 // only exists from the sponsor-placement upgrade onward) and SlotActivated
 // history. Implementations predating matrixChildren() revert, leaving history
 // as the only source.
 const placed:MatrixPlacement[]=[];
 const placementReads=users.flatMap(user=>Array.from({length:user.currentSlot},(_,i)=>({user,slot:i+1})));
 const fromState=await mapRpc(placementReads,({user,slot})=>
  (c.matrixChildren(slot,user.wallet,at) as Promise<string[]>).then(kids=>
   kids.map((member,k):MatrixPlacement=>({member,slot,parent:user.wallet,position:k+1,source:"live"})))).catch(()=>null);
 if(fromState) placed.push(...fromState.flat());
 // matrixChildren() is appended storage: it answers for placements made after
 // the sponsor-placement upgrade and is empty for every member placed before
 // it. An empty state reply is therefore "no record here", not "no placements",
 // so SlotActivated history is merged in rather than skipped. Dedupe by
 // member+slot, keeping the state record, which is authoritative.
 if(!logResult.error) {
  const filled=new Map<string,number>();
  const known=new Set(placed.map(p=>p.slot+":"+p.member));
  for(const event of eventsNamed(c,logResult.found,"SlotActivated")) {
   const slot=Number(event.args.slot), parent=event.args.parent as string, member=event.args.member as string;
   // Commission-path members and the bootstrap emit/hold slot state without
   // filling a paid matrix position. Zero is therefore "unplaced", not a
   // matrix parent that should appear in the tree.
   if(parent===ZeroAddress) continue;
   const position=(filled.get(slot+":"+parent) ?? 0)+1;
   filled.set(slot+":"+parent,position);
   if(!known.has(slot+":"+member)) placed.push({member,slot,parent,position,source:"live"});
  }
 } else if(!placed.length && await c.migrationFinalized(at).then(()=>false,()=>true)) {
  // History unavailable, and this contract predates registration migration.
  // Without migration, _activateSlot gives each queue entry exactly three
  // children, in order, before moving on, so entry i (i >= 1) of a slot queue
  // sits under entry floor((i - 1) / 3) at position (i - 1) % 3 + 1.
  // Contracts with migrateMembers() append imported accounts without a parent,
  // which breaks that arithmetic, so they get no placements until history loads.
  for(let slot=1;slot<=12;slot++) {
   const accounts=slot===1 ? wallets : await queue(slot);
   if(accounts.length<=1) break;
   accounts.slice(1).forEach((member,k)=>placed.push({member,slot,parent:accounts[Math.floor(k/3)],position:k%3+1,source:"live"}));
  }
 }
 const history = [...cycles,...poolCycles,...cycleAdvances,...directCommissions,...withdrawals,...joins,...poolJoins]
  .sort((a,b)=>b.blockNumber-a.blockNumber || b.index-a.index)
  .map(e=>{
   const name=e.fragment.name;
   const wallet=(name==="DirectCommissionPaid" ? e.args.sponsor
    : name==="CycleAdvancePaid" ? e.args.account : e.args.member) as string;
   const amount=name==="Withdrawn" ? unit(e.args.amount)
    : name.endsWith("CycleCompleted") || name==="CycleAdvancePaid" || name==="DirectCommissionPaid"
      ? unit(e.args.credited) : name==="Joined" ? 30 : 20;
   return {wallet,kind:name,hash:e.transactionHash,block:e.blockNumber,index:e.index,amount};
  });
 return {c,users,payments,placements:placed,totalMembers:users.length,totalPool:Number(poolSize),legacyPool,history,historyError:logResult.error};
}
function snapshot() {
 if(!snapshotCache || Date.now()>snapshotCache.expires) {
  const promise=loadSnapshot().then(result=>{if(snapshotCache?.promise===promise)snapshotCache.expires=Date.now()+5000;return result;}).catch(e=>{if(snapshotCache?.promise===promise)snapshotCache=undefined;throw e;});
  snapshotCache={expires:Infinity,promise};
 }
 return snapshotCache.promise;
}
export async function getAllSolTrustUsers(_rpc:JsonRpcProvider) {return (await snapshot()).users;}
export async function getAllPaymentEvents(_rpc:JsonRpcProvider) {return (await snapshot()).payments;}
export async function getSolTrustUserAccount(_rpc:JsonRpcProvider,wallet:PublicKey) {
 return (await snapshot()).users.find(u=>u.wallet===wallet.toString()) ?? null;
}
export function getDirectReferralUsers(users:SolTrustUserAccount[],wallet:string) {return users.filter(u=>u.referrer===wallet && u.wallet!==wallet);}
export function formatUserOrdinal(id:bigint) {return "User "+id.toString();}
export function maxRecyclesForSlot(_slot:number) {return 0;}
export async function getMatrixPosition(_rpc:JsonRpcProvider,_wallet:PublicKey,_slot=1,_cycle=0):Promise<SolTrustMatrixPosition|null> {return null;}
export async function getAllIncomeSlotEntries(_rpc:JsonRpcProvider):Promise<SolTrustIncomeSlotEntry[]> {return [];}
export async function getAllSlotUpgradeMatrixPositions(_rpc:JsonRpcProvider):Promise<SolTrustSlotUpgradeMatrixPosition[]> {return [];}
export async function getAllSlotIncomeEntries(_rpc:JsonRpcProvider):Promise<SolTrustSlotIncomeEntry[]> {return [];}
export async function getSlotIncomeState(_rpc:JsonRpcProvider,wallet:PublicKey,slot:number):Promise<SolTrustSlotIncomeState|null> {
 const c=await contract();
 const [filled,reserve]=await Promise.all([c.childrenFilled(slot,wallet.toString()),c.cycleGross(slot,wallet.toString())]);
 return {owner:wallet.toString(),slotNumber:slot,cycle:0,filledCount:Number(filled),recycleCount:0,nextSlotReserveSol:unit(reserve),recycleReady:false};
}
// The original binary tree widgets cannot represent this contract's independent
// ternary queues. Do not relabel ternary placements as binary relationships.
function rootOnly(users:SolTrustUserAccount[],wallet:string):MatrixTreeNode|null {
 const user=users.find(u=>u.wallet===wallet);
 return user ? {user,first:null,second:null} : null;
}
export function buildIncomeTree(users:SolTrustUserAccount[],_events:unknown,wallet:string,..._args:unknown[]) {return rootOnly(users,wallet);}
export function buildSlotIncomeTree(users:SolTrustUserAccount[],_entries:unknown,wallet:string,..._args:unknown[]) {return rootOnly(users,wallet);}
export function buildSlotUpgradeMatrixTree(users:SolTrustUserAccount[],_entries:unknown,wallet:string,..._args:unknown[]) {return rootOnly(users,wallet);}
export function buildPlacementPocketTree(users:SolTrustUserAccount[],wallet:string) {return rootOnly(users,wallet);}

// --- Three-wide matrix placement --------------------------------------------

const walletKey=(wallet:string)=>wallet.toLowerCase();
export function isLegacyMatrixWallet(wallet:string) {
 return Boolean(LEGACY_USER_IDS[walletKey(wallet)]);
}

/** Reconstructs a display-only legacy matrix from the information preserved by
 * the old platform: sponsor, active level and import/registration order. Each
 * parent has three positions and a full sponsor branch spills breadth-first.
 * This is intentionally pure UI data and is never sent to the contract. */
export function deriveLegacyReferralPlacements(users:SolTrustUserAccount[]):MatrixPlacement[] {
 const legacy=users.filter(user=>isLegacyMatrixWallet(user.wallet));
 const byWallet=new Map(legacy.map(user=>[walletKey(user.wallet),user]));
 const root=legacy.find(user=>walletKey(user.referrer)===walletKey(ZeroAddress)) ?? legacy[0];
 if(!root) return [];
 const result:MatrixPlacement[]=[];
 for(let slot=1;slot<=12;slot++) {
  const eligible=legacy.filter(user=>user.currentSlot>=slot);
  const eligibleKeys=new Set(eligible.map(user=>walletKey(user.wallet)));
  const rootKey=walletKey(root.wallet);
  if(!eligibleKeys.has(rootKey)) continue;
  const placed=new Set<string>([rootKey]);
  const children=new Map<string,MatrixPlacement[]>();
  for(const user of eligible) {
   const memberKey=walletKey(user.wallet);
   if(memberKey===rootKey) continue;
   let candidate=walletKey(user.referrer);
   const visited=new Set<string>();
   while(candidate!==rootKey && (!eligibleKeys.has(candidate) || !placed.has(candidate))) {
    if(visited.has(candidate)) {candidate=rootKey;break;}
    visited.add(candidate);
    const sponsor=byWallet.get(candidate);
    candidate=sponsor ? walletKey(sponsor.referrer) : rootKey;
   }
   if(!eligibleKeys.has(candidate) || !placed.has(candidate)) candidate=rootKey;
   const queue=[candidate], searched=new Set<string>();
   let parentKey=rootKey;
   while(queue.length) {
    const current=queue.shift()!;
    if(searched.has(current)) continue;
    searched.add(current);
    const kids=children.get(current) ?? [];
    if(kids.length<3) {parentKey=current;break;}
    queue.push(...kids.map(kid=>walletKey(kid.member)));
   }
   const siblings=children.get(parentKey) ?? [];
   const placement:MatrixPlacement={
    member:user.wallet,slot,parent:byWallet.get(parentKey)?.wallet ?? root.wallet,
    position:siblings.length+1,source:"legacy-derived"
   };
   siblings.push(placement);children.set(parentKey,siblings);
   placed.add(memberKey);result.push(placement);
  }
 }
 return result;
}

export async function getMatrixPlacements():Promise<MatrixPlacement[]> {
 const data=await snapshot();
 return [...data.placements,...deriveLegacyReferralPlacements(data.users)];
}

/** Selects one coherent topology. Imported wallets use the reconstructed old
 * hierarchy; new wallets use only confirmed contract placements. */
export function matrixPlacementsForWallet(placements:MatrixPlacement[],wallet:string):MatrixPlacement[] {
 const source=isLegacyMatrixWallet(wallet) ? "legacy-derived" : "live";
 return placements.filter(placement=>placement.source===source);
}

/** This member's own placement in `slot`: the queue parent that received its
 * payment, and which of that parent's three positions it filled. */
export function matrixPlacementOf(placements:MatrixPlacement[],wallet:string,slot:number):MatrixPlacement|null {
 const selected=matrixPlacementsForWallet(placements,wallet);
 return selected.find(p=>walletKey(p.member)===walletKey(wallet) && p.slot===slot) ?? null;
}

/** Builds one coherent 3-wide placement tree for a slot. `maxDepth` counts
 * generations below the owner; 2 gives the owner, 3 children and 9
 * grandchildren. Legacy roots select derived data; other roots select live
 * contract data. */
export function buildPlacementTree(users:SolTrustUserAccount[],placements:MatrixPlacement[],wallet:string,slot:number,maxDepth=2):PlacementTreeNode|null {
 const source=isLegacyMatrixWallet(wallet) ? "legacy-derived" : "live";
 const selected=matrixPlacementsForWallet(placements,wallet);
 const byWallet=new Map(users.map(u=>[walletKey(u.wallet),u]));
 const childrenOf=new Map<string,MatrixPlacement[]>();
 const add=(placement:MatrixPlacement)=>{
  const parent=walletKey(placement.parent),list=childrenOf.get(parent) ?? [];
  list.push(placement);childrenOf.set(parent,list);
 };
 for(const placement of selected) if(placement.slot===slot) add(placement);
 const build=(target:string,position:number,parentWallet:string|null,depth:number):PlacementTreeNode|null=>{
  const user=byWallet.get(walletKey(target));
  if(!user || user.currentSlot < slot) return null;
  const kids=(childrenOf.get(walletKey(target)) ?? []).filter(kid=>kid.position>=1 && kid.position<=3);
  const children:(PlacementTreeNode|null)[]=[null,null,null];
  if(depth<maxDepth) for(const kid of kids) {
   const child=build(kid.member,kid.position,target,depth+1);
   if(child) children[kid.position-1]=child;
  }
  return {user,slot,position,parentWallet,source,children,truncated:depth>=maxDepth && kids.length>0};
 };
 return build(wallet,0,null,0);
}

export function countPlacementTreeUsers(node:PlacementTreeNode|null):number {
 return node ? 1+node.children.reduce((total,child)=>total+countPlacementTreeUsers(child),0) : 0;
}
export function countMatrixTreeUsers(tree:MatrixTreeNode|null):number {return tree ? 1+countMatrixTreeUsers(tree.first)+countMatrixTreeUsers(tree.second) : 0;}
export function resolveRegistrationContribution(_user:SolTrustUserAccount,_events:SolTrustPaymentEvent[]):RegistrationContribution|null {return null;}
export function groupIncomeBySource(_events:SolTrustPaymentEvent[],_users:SolTrustUserAccount[]=[]):Map<string,IncomeReceipt[]> {return new Map();}
export async function getUserMatrixProfile(r:JsonRpcProvider,w:PublicKey):Promise<MatrixProfile|null> {
 const user=await getSolTrustUserAccount(r,w);
 return user ? {wallet:w.toString(),userAddress:PROGRAM_ID.toString(),positionAddress:PROGRAM_ID.toString(),user,position:null,welcomePass:null,firstDownline:null,secondDownline:null} : null;
}
export const ROYAL_POOL_SLOTS=[3,6,9,12] as const;
export function isRoyalPoolEligible(_user:SolTrustUserAccount,_root:string) {return false;}
export function calculateRoyalPoolPayouts(_amount:bigint,_users:SolTrustUserAccount[],_root:string):{slotNumber:number;recipient:string;amountLamports:bigint}[] {return [];}
export async function getRoyalPool(_rpc:JsonRpcProvider):Promise<SolTrustRoyalPool|null> {throw new Error("Royal Pool distribution is not implemented in this EVM contract. The Global Pool is a different plan.");}
export async function getProtocolConfig(_rpc:JsonRpcProvider) {
 const c=await contract();
 return {authority:await c.treasury() as string,creator:await c.bootstrapAccount() as string};
}
export async function registerEvm(sponsor:string,onStatus:(s:string)=>void=()=>{}) {
 return write("join",sponsor,onStatus);
}
// Mirrors the preflight inside write("join") so the register page can show what
// is missing before the user clicks, instead of failing after the click with no
// wallet prompt. Never throws: every field falls back to a safe unknown value.
export type RegistrationReadiness = {
 walletDetected:boolean; address:string|null; chainId:number|null; chainOk:boolean;
 joined:boolean; balance:number; required:number; funded:boolean;
 gas:number; hasGas:boolean; canFund:boolean; sponsorOk:boolean|null; blocker:string|null;
};
export async function getRegistrationReadiness(sponsor?:string):Promise<RegistrationReadiness> {
 const eth=injected();
 const out:RegistrationReadiness={
  walletDetected:Boolean(eth),address:null,chainId:null,chainOk:false,joined:false,
  balance:0,required:0,funded:false,gas:0,hasGas:false,
  canFund:CHAIN_ID===97||CHAIN_ID===31337,sponsorOk:null,blocker:null
 };
 try {
  if(eth) {
   const accounts=await eth.request({method:"eth_accounts"}) as string[]|undefined;
   out.address=accounts?.[0] ? getAddress(accounts[0]) : null;
   out.chainId=Number(await eth.request({method:"eth_chainId"}));
   out.chainOk=out.chainId===CHAIN_ID;
  }
  const c=await contract();
  const token=new Contract(await c.paymentToken(),TOKEN_ABI,rpc);
  const decimals=Number(await token.decimals());
  out.required=Number(formatUnits(await c.slotPrice(1),decimals));
  if(sponsor) {
   try {
    const resolved=isAddress(sponsor) ? getAddress(sponsor)
     : (await snapshot()).users.find(u=>u.userId.toString()===sponsor)?.wallet;
    out.sponsorOk=resolved ? Boolean((await c.members(resolved)).joined) : false;
   } catch { out.sponsorOk=null; }
  }
  if(out.address) {
   const [member,balance,gas]=await Promise.all([
    c.members(out.address),token.balanceOf(out.address),rpc.getBalance(out.address)
   ]);
   out.joined=Boolean(member.joined);
   out.balance=Number(formatUnits(balance,decimals));
   out.gas=Number(formatUnits(gas,18));
  }
 } catch { /* leave defaults; blocker below reports the actionable part */ }
 out.funded=out.required>0 && out.balance>=out.required;
 out.hasGas=out.gas>0;
 out.blocker=
  !out.walletDetected ? "No EVM wallet detected in this browser."
  : !out.address ? "Connect your wallet to continue."
  : !out.chainOk ? "Your wallet is on the wrong network."
  : out.joined ? "This wallet is already registered."
  : !out.hasGas ? `You have no ${CHAIN_ID===56?"BNB":"test BNB"} for gas.`
  : !out.funded ? `You need ${out.required} ${CHAIN_ID===56?"USDT":"test USDT"} to register.`
  : out.sponsorOk===false ? "That sponsor is not registered."
  : null;
 return out;
}
export async function joinGlobalPoolEvm(sponsor:string,onStatus:(s:string)=>void=()=>{}) {return write("joinGlobalPool",sponsor,onStatus);}
export async function withdrawEvm(onStatus:(s:string)=>void=()=>{}) {return write("withdraw","",onStatus);}
export async function getDashboardData() {
 const {c,users,payments,placements,totalMembers,totalPool,legacyPool,history,historyError}=await snapshot();
 const displayPlacements=[...placements,...deriveLegacyReferralPlacements(users)];
 const wallet=connected?.toString();
 if(!wallet) return {users,payments,placements:displayPlacements,history:[],user:null,poolLevel:0,legacyPoolLevel:0,poolJoined:false,totalMembers,totalPool,legacyPool,available:0,income:null,legacyIncome:0,legacyGlobalIncome:0,legacyGrowthTrees:[] as LegacyGrowthView[],historyError};
 const [member,pool,income,legacy,legacyLevel,legacyGlobal,legacyGrowthTrees] = await Promise.all([c.members(wallet),c.globalMembers(wallet),
  // Lifetime income counters are appended storage: they exist from the
  // sponsor-placement upgrade onward and stay at zero for income credited
  // before it. Report an all-zero reading as absent so callers fall back to
  // CycleCompleted history instead of displaying a confident zero.
  Promise.all([c.matrixIncome(wallet),c.globalIncome(wallet)])
   .then(([m,g])=>({matrix:unit(m),global:unit(g)}),()=>null),
  // Income earned on the previous, off-chain platform, imported for display.
  // It is not withdrawable and is deliberately kept out of every other income
  // figure. Contracts predating the import revert, which reads as 0.
  c.legacyIncome(wallet).then((v:bigint)=>unit(v),()=>0),
  // Imported Global Pool standing is separate from live enrolment, but it is
  // still part of this member's previous-platform record and must be shown.
  c.legacyGlobalLevel(wallet).then((v:bigint)=>Number(v),()=>0),
  c.legacyGlobalIncome(wallet).then((v:bigint)=>unit(v),()=>0),loadLegacyGrowth(c,wallet)]);
 const foundUser=users.find(u=>u.wallet===wallet) ?? null;
 const user=foundUser;
 return {users,payments,placements:displayPlacements,history:history.filter(e=>e.wallet===wallet),user,poolLevel:Number(pool.highestLevel),legacyPoolLevel:legacyLevel,poolJoined:Boolean(pool.joined),totalMembers,totalPool,legacyPool,available:unit(member.withdrawable),income,legacyIncome:legacy,legacyGlobalIncome:legacyGlobal,legacyGrowthTrees,historyError};
}

// Fast, state-only dashboard path. It intentionally avoids event history and
// the all-member placement scan so a connected wallet never displays zero or
// "pending" while the larger team/tree snapshot loads in the background.
async function loadWalletDashboardSummary(wallet:string) {
 const c=await contract();
 const [member,pool,matrix,global,legacy,legacyLevel,legacyGlobal,userId,totalMembers,totalPool,legacyPool,legacyGrowthTrees]=await Promise.all([
  c.members(wallet),c.globalMembers(wallet),c.matrixIncome(wallet),c.globalIncome(wallet),
  c.legacyIncome(wallet).then((v:bigint)=>v,()=>0n),
  c.legacyGlobalLevel(wallet).then((v:bigint)=>Number(v),()=>0),
  c.legacyGlobalIncome(wallet).then((v:bigint)=>v,()=>0n),
  displayUserIdForWallet(c,wallet),
  c.queueLength(1).then((v:bigint)=>Number(v)),
  c.globalQueueLengthA(1).then((v:bigint)=>Number(v),()=>0),
  c.legacyGlobalCount().then((v:bigint)=>Number(v),()=>0),loadLegacyGrowth(c,wallet)
 ]);
 return {
  user:userView(wallet,member,userId),poolLevel:Number(pool.highestLevel),legacyPoolLevel:legacyLevel,
  poolJoined:Boolean(pool.joined),totalMembers,totalPool,legacyPool,available:unit(member.withdrawable),
  income:{matrix:unit(matrix),global:unit(global)},legacyIncome:unit(legacy),legacyGlobalIncome:unit(legacyGlobal),legacyGrowthTrees
 };
}
type WalletDashboardSummary=Awaited<ReturnType<typeof loadWalletDashboardSummary>>;
export function getWalletDashboardSummary():Promise<WalletDashboardSummary|null> {
 const wallet=connected?.toString();
 if(!wallet) return Promise.resolve(null);
 if(!walletSummaryCache || walletSummaryCache.wallet!==wallet || Date.now()>walletSummaryCache.expires) {
  const promise=loadWalletDashboardSummary(wallet).then(result=>{
   if(walletSummaryCache?.promise===promise)walletSummaryCache.expires=Date.now()+5000;
   return result;
  }).catch(e=>{if(walletSummaryCache?.promise===promise)walletSummaryCache=undefined;throw e;});
  walletSummaryCache={wallet,expires:Infinity,promise};
 }
 return walletSummaryCache.promise;
}
export async function getWalletBalances() {
 const address=connected?.toString(); if(!address) throw new Error("Connect your wallet first.");
 const c=await contract();
 const tokenAddress=await c.paymentToken() as string;
 const token=new Contract(tokenAddress,TOKEN_ABI,rpc);
 const [decimals,balance,gas,levels]=await Promise.all([
  token.decimals(),token.balanceOf(address),rpc.getBalance(address),
  Promise.all(Array.from({length:6},async(_,i)=>({level:i+1,a:Number(await c.gpFilledA(i+1,address)),b:Number(await c.gpFilledB(i+1,address))})))
 ]);
 return {tokenAddress,tokenBalance:formatUnits(balance,Number(decimals)),gasBalance:formatUnits(gas,18),levels};
}

export type GlobalPoolLevelProgress = {level:number;growthTree1Filled:number;growthTree2Filled:number};
export async function getGlobalPoolLevelProgress(wallet:string):Promise<GlobalPoolLevelProgress[]> {
 const account=getAddress(wallet);
 const c=await contract();
 return Promise.all(Array.from({length:6},async(_,index)=>{
  const level=index+1;
  const [growthTree1Filled,growthTree2Filled]=await Promise.all([
   c.gpFilledA(level,account),c.gpFilledB(level,account)
  ]);
  return {level,growthTree1Filled:Number(growthTree1Filled),growthTree2Filled:Number(growthTree2Filled)};
 }));
}
export async function mintTestTokens(onStatus:(s:string)=>void=()=>{}) {
 if(CHAIN_ID!==97 && CHAIN_ID!==31337) throw new Error("Test-token funding is only enabled on BNB testnet and local development.");
 if(writing) throw new Error("A wallet transaction is already in progress.");
 writing=true;
 try {
  const wallet=evmProvider();if(!wallet) throw new Error("Install an EVM wallet or use its in-app browser.");
  const {publicKey}=await wallet.connect();
  const signer=await new BrowserProvider(injected()!).getSigner();
  const c=await contract(); const token=new Contract(await c.paymentToken(),TOKEN_ABI,signer);
  if(Number(await token.decimals())!==6) throw new Error("Expected the six-decimal test token.");
  onStatus("Confirm minting 100 test USDT in your wallet. Test BNB is required for gas.");
  const tx=await token.mint(publicKey.toString(),100_000_000n);
  onStatus("Waiting for confirmation: "+tx.hash);await tx.wait();
  snapshotCache=undefined;window.dispatchEvent(new Event("boss:updated"));
  onStatus("Confirmed: "+tx.hash);return tx.hash as string;
 } finally {writing=false;}
}
async function write(action:"join"|"joinGlobalPool"|"withdraw",sponsor:string,onStatus:(s:string)=>void) {
 if(writing) throw new Error("A wallet transaction is already in progress.");
 writing=true;
 try {
  const wallet=evmProvider();if(!wallet) throw new Error("Connect an EVM wallet.");
  const {publicKey}=await wallet.connect();
  const provider=new BrowserProvider(injected()!);
  const signer=await provider.getSigner();
  const c=(await contract()).connect(signer) as Contract;
  const self=action==="joinGlobalPool"?await c.globalMembers(publicKey.toString()):await c.members(publicKey.toString());
  if(action!=="withdraw" && self.joined) throw new Error("This wallet is already registered in this plan.");
  if(action==="withdraw" && self.withdrawable===0n) throw new Error("No withdrawable income yet.");
  if(action!=="withdraw") {
   if(!isAddress(sponsor)) {
    if(!/^\d+$/.test(sponsor)) throw new Error("Enter a sponsor EVM address or registered user ID.");
    const user=(await snapshot()).users.find(u=>u.userId.toString()===sponsor);
    if(!user) throw new Error("Sponsor ID was not found.");sponsor=user.wallet;
   }
   sponsor=getAddress(sponsor);
   if(action==="join") {
    if(!(await c.members(sponsor)).joined) throw new Error("Sponsor is not registered in the Matrix plan.");
   } else {
    // Matrix registration and Global Pool enrolment are separate. A member's
    // direct sponsor may therefore be a perfectly valid matrix member who has
    // not bought a Global Pool position yet. Follow the immutable matrix
    // sponsor chain to the nearest enrolled upline instead of rejecting the
    // join. The bootstrap account is enrolled in both plans at deployment, so
    // every valid matrix sponsor chain has an eligible final fallback.
    const requestedSponsor=sponsor;
    const requestedMatrixMember=await c.members(requestedSponsor);
    const requestedGlobalMember=await c.globalMembers(requestedSponsor);
    if(!requestedGlobalMember.joined) {
     if(!requestedMatrixMember.joined) {
      throw new Error("Sponsor is not registered in the Matrix or Global Pool.");
     }
     const visited=new Set<string>();
     let candidate=requestedSponsor;
     for(let hop=0;hop<256;hop++) {
      const key=candidate.toLowerCase();
      if(visited.has(key)) break;
      visited.add(key);
      if((await c.globalMembers(candidate)).joined) {sponsor=candidate;break;}
      const matrixMember=await c.members(candidate);
      if(!matrixMember.joined || matrixMember.sponsor===ZeroAddress) break;
      candidate=getAddress(matrixMember.sponsor);
     }
     if(sponsor===requestedSponsor) {
      const bootstrap=getAddress(await c.bootstrapAccount());
      if(!(await c.globalMembers(bootstrap)).joined) {
       throw new Error("No eligible Global Pool sponsor is available. Please contact support.");
      }
      sponsor=bootstrap;
     }
     onStatus("Your matrix sponsor has not joined the Global Pool yet. Using eligible upline "+sponsor+".");
    }
   }
   const token=new Contract(await c.paymentToken(),TOKEN_ABI,signer);
   const decimals=Number(await token.decimals());
   const tokenUnit=await c.paymentTokenUnit().catch(()=>10n**BigInt(decimals));
   if(tokenUnit!==10n**BigInt(decimals)) throw new Error("Contract and payment-token units do not match.");
   const amount:bigint=action==="join"?await c.slotPrice(1):await c.globalPoolEntry(1);
   if(await token.balanceOf(publicKey.toString())<amount) throw new Error("Insufficient USDT balance.");
   const allowance:bigint=await token.allowance(publicKey.toString(),PROGRAM_ID.toString());
   if(allowance<amount) {
    if(allowance>0n) {onStatus("Confirm token allowance reset.");await(await token.approve(PROGRAM_ID.toString(),0)).wait();}
    onStatus("Confirm USDT approval in your wallet.");await(await token.approve(PROGRAM_ID.toString(),amount)).wait();
   }
  }
  if(await signer.getAddress()!==publicKey.toString() || Number((await provider.getNetwork()).chainId)!==CHAIN_ID) throw new Error("Wallet changed. Please reconnect.");
  onStatus("Confirm the contract transaction in your wallet.");
  const tx=action==="withdraw"?await c.withdraw():await c[action](sponsor);
  onStatus("Waiting for confirmation: "+tx.hash);await tx.wait();snapshotCache=undefined;
  walletSummaryCache=undefined;
  window.dispatchEvent(new Event("boss:updated"));
  onStatus("Confirmed: "+tx.hash);return tx.hash as string;
 } finally {writing=false;}
}
