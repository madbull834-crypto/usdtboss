import { useEffect, useMemo, useState } from "react";
import { evmProvider, getDashboardData, getWalletDashboardSummary, matrixPlacementOf } from "./client";
export function useAccountData() {
 const [data,setData] = useState<Awaited<ReturnType<typeof getDashboardData>> | null>(null);
 const [summary,setSummary] = useState<Awaited<ReturnType<typeof getWalletDashboardSummary>>>(null);
 const [error,setError] = useState("");
 const [wallet,setWallet] = useState(evmProvider()?.publicKey?.toString() ?? "");
 useEffect(()=>{
  let live=true;
  let fullTimer:number|undefined;
  const refreshSummary=()=>getWalletDashboardSummary().then(result=>{if(live){setSummary(result);setError("");}}).catch(e=>{
   if(live)setError(e instanceof Error?e.message:String(e));
  });
  const refresh=()=>getDashboardData().then(result=>{if(live){setData(result);setError("");}}).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e));});
  const scheduleFullRefresh=()=>{
   if(fullTimer!==undefined)window.clearTimeout(fullTimer);
   // Give the small wallet-only read first access to rate-limited public RPCs.
   fullTimer=window.setTimeout(()=>void refresh(),750);
  };
  void refreshSummary().finally(scheduleFullRefresh);
  const summaryTimer=window.setInterval(()=>void refreshSummary(),15000);
  const fullRefreshTimer=window.setInterval(()=>void refresh(),60000);
  const updated=()=>{
   setWallet(evmProvider()?.publicKey?.toString() ?? "");
   setSummary(null);
   setData(null);
   void refreshSummary().finally(scheduleFullRefresh);
  };
  window.addEventListener("boss:updated",updated);
  return ()=>{live=false;if(fullTimer!==undefined)clearTimeout(fullTimer);clearInterval(summaryTimer);clearInterval(fullRefreshTimer);window.removeEventListener("boss:updated",updated);};
 },[]);
 // The full snapshot assigns the public queue-order display ID. Prefer that
 // user once loaded so the fast state summary cannot replace it with the
 // contract's zero legacy ID for post-migration registrations.
 const user=data?.user ?? summary?.user ?? null;
 const effectiveData=useMemo(()=>summary
  ? data ? {...data,...summary,user} : {
    users:[],payments:[],placements:[],history:[],historyError:null,...summary,user
   }
  : data,[data,summary,user]);
 const users=data?.users ?? [];
 const placements=data?.placements ?? [];
 const addressKey=(address:string)=>address.toLowerCase();
 // Legacy members select the referral-derived topology; new members select
 // confirmed contract topology. These sources must never be mixed.
 const matrixParentOf=(memberWallet:string)=>matrixPlacementOf(placements,memberWallet,1);
 const walletKey=addressKey(wallet);
 const directs=users.filter(u=>addressKey(u.referrer)===walletKey && addressKey(u.wallet)!==walletKey);
 const descendants: {user:typeof users[number];depth:number}[]=[];
 const seen=new Set([walletKey]);let parents=new Set([walletKey]);
 for(let depth=1;depth<=12 && parents.size;depth++){
  const children=users.filter(u=>parents.has(addressKey(u.referrer)) && !seen.has(addressKey(u.wallet)));
  children.forEach(user=>{seen.add(addressKey(user.wallet));descendants.push({user,depth});});
  parents=new Set(children.map(u=>addressKey(u.wallet)));
 }
 return {data:effectiveData,error,wallet,user,users,directs,descendants,placements,matrixParentOf,teamLoaded:data!==null};
}
