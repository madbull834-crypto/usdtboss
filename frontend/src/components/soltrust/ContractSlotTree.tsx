import { useEffect, useState } from "react";
import { buildPlacementTree, connection, getAllSolTrustUsers, getMatrixPlacements, type PlacementTreeNode, type SolTrustUserAccount } from "../../evm/client";
import PlacementTreeView from "./PlacementTreeView";

/** Reuses the existing placement-card styling with the contract's actual topology. */
export default function ContractSlotTree({wallet,slot}:{wallet:string;slot:number}) {
 const [tree,setTree]=useState<PlacementTreeNode|null>(null);
 const [users,setUsers]=useState<SolTrustUserAccount[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let live=true;let pending=false;setTree(null);setLoading(true);
  const refresh=async()=>{if(pending)return;pending=true;try{
   const [members,placements]=await Promise.all([getAllSolTrustUsers(connection()),getMatrixPlacements()]);
   if(live){setUsers(members);setTree(buildPlacementTree(members,placements,wallet,slot));setError("");}
  }catch(e){if(live)setError(e instanceof Error?e.message:"Cannot load slot placements.");}finally{pending=false;if(live)setLoading(false);}};
  void refresh();const timer=setInterval(()=>void refresh(),10000);const updated=()=>void refresh();window.addEventListener("boss:updated",updated);
  return()=>{live=false;clearInterval(timer);window.removeEventListener("boss:updated",updated);};
 },[wallet,slot]);
 if(error)return <p role="alert" className="text-sm text-amber-600">{error}</p>;
 if(loading)return <p role="status">Loading slot placements…</p>;
 if(!tree)return <p>This wallet has not activated slot {slot}.</p>;
 return <PlacementTreeView tree={tree} ownerWallet={wallet} usersByWallet={new Map(users.map(u=>[u.wallet,u]))} />;
}
