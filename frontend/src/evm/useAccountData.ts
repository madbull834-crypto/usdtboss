import { useEffect, useMemo, useState } from "react";
import { evmProvider, getDashboardData, getWalletDashboardSummary, matrixPlacementOf } from "./client";
export function useAccountData() {
 const [data,setData] = useState<Awaited<ReturnType<typeof getDashboardData>> | null>(null);
 const [summary,setSummary] = useState<Awaited<ReturnType<typeof getWalletDashboardSummary>>>(null);
 const [error,setError] = useState("");
 const [wallet,setWallet] = useState(evmProvider()?.publicKey?.toString() ?? "");
 useEffect(()=>{
  let live=true;
  const refreshSummary=()=>getWalletDashboardSummary().then(result=>{if(live)setSummary(result);}).catch(e=>{
   if(live)setError(e instanceof Error?e.message:String(e));
  });
  const refresh=()=>getDashboardData().then(result=>{if(live){setData(result);setError("");}}).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e));});
  void refreshSummary().finally(()=>void refresh());
  const timer=window.setInterval(()=>{void refreshSummary().finally(()=>void refresh());},10000);
  const updated=()=>{setWallet(evmProvider()?.publicKey?.toString() ?? "");void refreshSummary().finally(()=>void refresh());};
  window.addEventListener("boss:updated",updated);
  return ()=>{live=false;clearInterval(timer);window.removeEventListener("boss:updated",updated);};
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
 // Legacy members select the referral-derived topology; new members select
 // confirmed contract topology. These sources must never be mixed.
 const matrixParentOf=(memberWallet:string)=>matrixPlacementOf(placements,memberWallet,1);
 const directs=users.filter(u=>u.referrer===wallet);
 const descendants: {user:typeof users[number];depth:number}[]=[];
 const seen=new Set([wallet]);let parents=[wallet];
 for(let depth=1;depth<=12 && parents.length;depth++){
  const children=users.filter(u=>parents.includes(u.referrer) && !seen.has(u.wallet));
  children.forEach(user=>{seen.add(user.wallet);descendants.push({user,depth});});
  parents=children.map(u=>u.wallet);
 }
 return {data:effectiveData,error,wallet,user,users,directs,descendants,placements,matrixParentOf};
}
