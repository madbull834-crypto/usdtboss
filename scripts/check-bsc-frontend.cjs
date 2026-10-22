const {chromium}=require("playwright");
const {JsonRpcProvider,Contract,FetchRequest}=require("ethers");
const fs=require("node:fs");
const assert=require("node:assert/strict");
(async()=>{
 const env=Object.fromEntries(fs.readFileSync("frontend/.env.local","utf8").split(/\r?\n/).filter(l=>l.startsWith("VITE_")).map(l=>l.split("=")));
 assert.equal(env.VITE_CHAIN_ID,"97");
 const request=new FetchRequest(env.VITE_RPC_URL);request.timeout=15000;
 const rpc=new JsonRpcProvider(request);
 const contract=new Contract(env.VITE_BOSS_ADDRESS,["function bootstrapAccount() view returns(address)"],rpc);
 const address=await contract.bootstrapAccount();rpc.destroy();
 console.log("PASS: deployed bootstrap read from BNB testnet");
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || "/Users/singhrajnish/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"});
 try {
  const page=await browser.newPage();page.setDefaultTimeout(120000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("requestfailed",r=>console.log("Request failed:",r.url(),r.failure()?.errorText));
  // Simulated wallet approvals only. All public-chain access is read-only.
  await page.addInitScript(({address})=>{
   let chain="0x1",added=false;const handlers={};window.walletCalls=[];
   window.ethereum={on:(event,fn)=>{handlers[event]=fn;},request:async({method,params})=>{
    window.walletCalls.push(method);
    if(method==="eth_accounts" || method==="eth_requestAccounts")return [address];
    if(method==="eth_chainId")return chain;
    if(method==="wallet_switchEthereumChain"){
     if(!added)throw Object.assign(new Error("Unknown chain"),{code:4902});
     chain=params[0].chainId;handlers.chainChanged?.(chain);return null;
    }
    if(method==="wallet_addEthereumChain"){added=true;return null;}
    throw new Error("Public-testnet test forbids signing and transactions: "+method);
   }};
  },{address});
  await page.goto("http://127.0.0.1:5173/login");
  console.log("Testnet login page opened");
  await page.getByRole("button",{name:"Login",exact:true}).click();
  await page.waitForURL("**/dashboard");
  console.log("PASS: simulated BNB network approval and login");
  await page.getByRole("region",{name:"Contract actions"}).getByText(address,{exact:true}).waitFor();
  await page.waitForTimeout(10000);
  console.log("Wallet panel:",await page.getByRole("region",{name:"Contract actions"}).innerText());
  await page.getByText("Global Pool active · Level 6. Later levels activate automatically.",{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.walletCalls);
  assert(calls.includes("wallet_addEthereumChain") && calls.includes("wallet_switchEthereumChain"));
  // SPA navigation preserves the simulated wallet, like the real sidebar.
  await page.evaluate(()=>{history.pushState({},"","/slot-income/1");window.dispatchEvent(new PopStateEvent("popstate"));});
  await page.getByText("How to read the placement tree",{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log("PASS: BNB testnet network onboarding, deployed dashboard reads, and slot tree (simulated wallet; no transactions)");
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
