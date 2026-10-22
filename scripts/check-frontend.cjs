const {chromium}=require("playwright");
const {JsonRpcProvider,Contract}=require("ethers");
const fs=require("fs");
const assert=require("node:assert/strict");

(async()=>{
 const frontendUrl=process.env.FRONTEND_URL || "http://127.0.0.1:5175";
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || "/Users/singhrajnish/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 const failures=[];
 page.on("response",r=>{if(r.status()>=400)failures.push(r.status()+" "+r.url());});
 const provider=new JsonRpcProvider("http://127.0.0.1:8545");
 const signer=await provider.getSigner(7);
 const address=await signer.getAddress();
 const env=Object.fromEntries(fs.readFileSync("frontend/.env.local-dev.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")).map(l=>l.split("=")));
 assert.equal((await provider.getNetwork()).chainId,31337n,"Browser transaction tests are local-only");
 const contract=new Contract(env.VITE_BOSS_ADDRESS,[
  "function bootstrapAccount() view returns(address)","function paymentToken() view returns(address)",
  "function members(address) view returns(bool joined,address sponsor,uint32 directCount,uint8 highestSlot,uint256 withdrawable)",
  "function globalMembers(address) view returns(bool joined,uint8 highestLevel)","function join(address)"
 ],signer);
 const token=new Contract(await contract.paymentToken(),["function mint(address,uint256)","function approve(address,uint256) returns(bool)","function balanceOf(address) view returns(uint256)"],signer);
 await (await token.mint(address,500_000_000n)).wait();
 const root=await contract.bootstrapAccount();
 await page.addInitScript(({address})=>{
  window.ethereum={
   request:async ({method,params})=>{
    if(method==="eth_requestAccounts" || method==="eth_accounts")return [address];
    const response=await fetch("http://127.0.0.1:8545",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:params||[]})});
    const data=await response.json();if(data.error)throw new Error(data.error.message);return data.result;
   },on:()=>{},removeListener:()=>{}
  };
 },{address});
 await page.goto(frontendUrl+"/login");
 await page.getByRole("button",{name:"Login",exact:true}).click();
 await page.waitForURL("**/dashboard");
 console.log("PASS: Login connects the wallet even when the address field is empty");
 const actions=page.getByRole("region",{name:"Contract actions"});
 const initialTokens=await token.balanceOf(address);
 await actions.getByRole("button",{name:"Get 100 Test USDT",exact:true}).click();
 await actions.getByRole("status").filter({hasText:"Confirmed:"}).waitFor();
 assert.equal(await token.balanceOf(address),initialTokens+100_000_000n);
 console.log("PASS: test-token funding is confirmed on chain");
 if(!(await contract.members(address)).joined){
  await page.goto(frontendUrl+"/register?ref="+root);
  // An already-authorised wallet is detected on load and goes straight to
  // Register; a fresh visitor sees Connect Wallet first.
  const connectButton=page.getByRole("button",{name:"Connect Wallet",exact:true});
  const registerButton=page.getByRole("button",{name:"Register",exact:true});
  await connectButton.or(registerButton).first().waitFor();
  if(await connectButton.isVisible()) await connectButton.click();
  await registerButton.click();
  await page.waitForURL("**/dashboard*",{timeout:30000});
  assert.equal((await contract.members(address)).joined,true);
  console.log("PASS: original registration form approves tokens and registers on chain");
 }
 for(let index=8;index<=12;index++){
  const participant=await provider.getSigner(index), who=await participant.getAddress();
  if((await contract.members(who)).joined)continue;
  await(await token.mint(who,30_000_000n)).wait();
  await(await token.connect(participant).approve(env.VITE_BOSS_ADDRESS,30_000_000n)).wait();
  await(await contract.connect(participant).join(index<10?root:address)).wait();
 }
 await page.goto(frontendUrl+"/dashboard");
 await page.getByText("WELCOME TO USER ACCOUNT").waitFor();
 await page.goto(frontendUrl+"/dashboard");
 await page.getByText("WELCOME TO USER ACCOUNT").waitFor();
 await page.waitForFunction(()=>document.body.innerText.includes("30 USDT"));
 if(!(await contract.globalMembers(address)).joined){
  // signer 8 is a valid matrix member but has not joined the separate Global
  // Pool. The frontend must resolve it to the nearest eligible upline (root)
  // instead of failing with SponsorNotJoined.
  const matrixOnlySponsor=await provider.getSigner(8).then(s=>s.getAddress());
  assert.equal((await contract.members(matrixOnlySponsor)).joined,true);
  assert.equal((await contract.globalMembers(matrixOnlySponsor)).joined,false);
  await actions.getByRole("textbox",{name:"Global Pool sponsor"}).fill(matrixOnlySponsor);
  await actions.getByRole("button",{name:"Join Global Pool · 20 USDT",exact:true}).click();
  await actions.getByRole("status").filter({hasText:"Confirmed:"}).waitFor();
  assert.equal((await contract.globalMembers(address)).joined,true);
  console.log("PASS: Global Pool approval and entry confirmed");
 }
 const available=(await contract.members(address)).withdrawable;
 if(available>0n){
  const beforeWithdraw=await token.balanceOf(address);
  await actions.getByRole("button",{name:"Withdraw Previous Balance",exact:true}).click();
  await actions.getByRole("status").filter({hasText:"Confirmed:"}).waitFor();
  assert.equal((await contract.members(address)).withdrawable,0n);
  assert.equal(await token.balanceOf(address),beforeWithdraw+available);
  console.log("PASS: legacy withdrawal transfers exactly the pending balance");
 }
 await page.goto(frontendUrl+"/slot-income/1");
 await page.getByText("How to read the placement tree",{exact:true}).waitFor();
 await page.locator("p").filter({hasText:/^Position 3$/}).waitFor();
 await page.getByRole("cell",{name:"Position 3",exact:true}).waitFor();
 console.log("PASS: slot income loads the connected wallet's real ternary placements");
 await page.goto(frontendUrl+"/dashboard");
 await page.screenshot({path:"/private/tmp/boss-dashboard.png",fullPage:true});
 const sidebar=await page.locator("aside").boundingBox();
 assert(sidebar && sidebar.width>=280 && sidebar.width<=300,"Original expanded sidebar width");
 await page.setViewportSize({width:390,height:844});
 await page.getByRole("button",{name:"Open navigation"}).click();
 await page.getByRole("button",{name:"Close navigation"}).waitFor();
 await page.screenshot({path:"/private/tmp/boss-mobile.png",fullPage:true});
 await page.getByRole("button",{name:"Close navigation"}).click();
 console.log("PASS: original responsive navigation");
 await page.setViewportSize({width:1440,height:1000});
 for(const route of ["/my-team","/basic-tabless","/basic-level","/level-income","/direct-income","/slot-income/1","/slot-income/12","/matrix-team"]){
  await page.goto(frontendUrl+route);
  await page.locator("header").waitFor();
  assert((await page.locator("#root").innerText()).length>100,route+" renders");
 }
 console.log("PASS: every contract-backed dashboard route renders");
 await page.goto(frontendUrl+"/login");
 await page.screenshot({path:"/private/tmp/boss-login.png",fullPage:true});
 await page.evaluate(()=>{
  const request=window.ethereum.request;
  window.ethereum.request=async args=>args.method==="eth_chainId"?"0x1":request(args);
 });
 await page.locator('input[name="walletAddress"]').click();
 await page.getByText("Switch your EVM wallet to chain 31337.",{exact:true}).waitFor();
 console.log("PASS: wrong network is rejected");
 await page.goto(frontendUrl+"/login");
 await page.evaluate(()=>{
  const request=window.ethereum.request;
  window.ethereum.request=async args=>{
   if(args.method==="eth_requestAccounts")throw new Error("User rejected the wallet request.");
   return request(args);
  };
 });
 await page.locator('input[name="walletAddress"]').click();
 await page.getByText("User rejected the wallet request.",{exact:true}).waitFor();
 console.log("PASS: rejected wallet connection stays on login");
 await page.goto(frontendUrl+"/");
 await page.waitForTimeout(5000);
 await page.screenshot({path:"/private/tmp/boss-home.png",fullPage:true});
 console.log("PASS: original homepage loads");
 console.log("ERRORS",errors);console.log("FAILED REQUESTS",failures);
 assert.equal(errors.length,0);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
