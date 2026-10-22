import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CHAIN_ID, DEFAULT_REFERRER, evmProvider, getWalletBalances, joinGlobalPoolEvm, mintTestTokens, withdrawEvm } from "../../evm/client";
import { useAccountData } from "../../evm/useAccountData";
import MobileWalletLinks from "../auth/MobileWalletLinks";

const button = "rounded-lg border border-[#1595A1] bg-[#00505C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#007681] disabled:opacity-50";
export default function ContractActions() {
 const account=useAccountData();
 const [balances,setBalances]=useState<Awaited<ReturnType<typeof getWalletBalances>> | null>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [sponsor,setSponsor]=useState(
  () => new URLSearchParams(window.location.search).get("ref")?.trim() ?? ""
 );
 useEffect(()=>{
  let live=true;
  const refresh=()=>{if(evmProvider()?.publicKey)void getWalletBalances().then(v=>{if(live)setBalances(v);}).catch(e=>{if(live)setMessage(e.message);});else setBalances(null);};
  refresh();const timer=setInterval(refresh,10000);window.addEventListener("boss:updated",refresh);
  return()=>{live=false;clearInterval(timer);window.removeEventListener("boss:updated",refresh);};
 },[]);
 useEffect(()=>{
  if(!sponsor.trim()) setSponsor(account.user?.referrer || DEFAULT_REFERRER.toBase58());
 },[account.user,sponsor]);
 async function run(action:()=>Promise<unknown>) {
  if(busy)return;setBusy(true);setMessage("");
  try{await action();}catch(e){setMessage(e instanceof Error?e.message:"Wallet action failed.");}finally{setBusy(false);}
 }
 return <section className="my-5 space-y-3 rounded-xl border border-[#1595A1] bg-[#000806] p-4 text-white" aria-label="Contract actions">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 className="font-bold">Wallet &amp; Income</h2>
   <button className={button} disabled={busy} onClick={()=>void run(async()=>{const wallet=evmProvider();if(!wallet)throw new Error("Install MetaMask or open this site in an EVM wallet browser.");await wallet.connect();setMessage("Wallet connected.");})}>{account.wallet ? "Reconnect Wallet" : "Connect Wallet"}</button>
  </div>
  {account.wallet && <>
   <p className="break-all text-xs">{account.wallet}</p>
   <p className="text-sm">{CHAIN_ID===56?"USDT":"Test USDT"}: {balances?.tokenBalance ?? "…"} · Gas balance: {balances?.gasBalance ?? "…"} {CHAIN_ID===56?"BNB":CHAIN_ID===97?"tBNB":"test ETH"} · Previous pending balance: {account.data ? account.data.available : "…"} USDT</p>
   <div className="flex flex-wrap gap-3">
    {CHAIN_ID!==56 && <button className={button} disabled={busy} onClick={()=>void run(()=>mintTestTokens(setMessage))}>Get 100 Test USDT</button>}
    <button className={button} disabled={busy || !account.data?.available} onClick={()=>void run(()=>withdrawEvm(setMessage))}>Withdraw Previous Balance</button>
    {!account.user && <Link className={button} to={"/register"+window.location.search}>Register Matrix · 30 USDT</Link>}
   </div>
   {!account.data?.poolJoined ? <div className="flex flex-wrap gap-3">
    <input aria-label="Global Pool sponsor" className="min-w-0 flex-1 rounded-lg border border-[#1595A1] bg-transparent px-3 py-2 text-sm" value={sponsor} onChange={e=>setSponsor(e.target.value)} placeholder="Global Pool sponsor address or ID" />
    <button className={button} disabled={busy || !sponsor.trim()} onClick={()=>void run(()=>joinGlobalPoolEvm(sponsor.trim(),setMessage))}>Join Global Pool · 20 USDT</button>
    <p className="basis-full text-xs text-gray-400">If this matrix sponsor has not joined the Global Pool, the nearest eligible upline is used automatically.</p>
    {!!account.data?.legacyPoolLevel && <p className="basis-full text-xs text-cyan-300">Previous-platform Global Pool level: {account.data.legacyPoolLevel}. Join here only to create a live position in the current contract.</p>}
   </div> : <p className="text-sm">Global Pool active · Level {account.data.poolLevel}. Later levels activate automatically.</p>}
   {account.data?.poolJoined && balances && <div className="flex flex-wrap gap-3 text-xs">{balances.levels.filter(l=>l.level<=account.data!.poolLevel).map(l=><span key={l.level}>Level {l.level}: Stage A {l.a}/2 · Stage B {l.b}/5</span>)}</div>}
   {!!account.data?.history.length && <details><summary className="cursor-pointer text-sm">Confirmed transaction history</summary><div className="mt-2 max-h-64 overflow-auto text-xs">{account.data.history.map(h=><p key={h.hash+":"+h.index} className="break-all py-1">{h.kind}: {h.amount} USDT · {CHAIN_ID===56||CHAIN_ID===97?<a className="underline" href={(CHAIN_ID===56?"https://bscscan.com/tx/":"https://testnet.bscscan.com/tx/")+h.hash} target="_blank" rel="noreferrer">View transaction</a>:h.hash}</p>)}</div></details>}
  </>}
  {(message || account.error) && <p role="status" className="break-words text-sm text-amber-300">{message || account.error}</p>}
  {!evmProvider() && <MobileWalletLinks />}
  <p className="text-xs text-gray-400">New live earnings are transferred directly to the recipient wallet in the same confirmed transaction. The withdrawal button is only for balances credited before the immediate-payout upgrade.</p>
 </section>;
}
