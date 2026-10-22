# Original frontend with EVM integration

The frontend source and assets were restored from solvalue (2).tar.gz.
The archive is unchanged. Original homepage, login/register layouts, dashboard,
sidebar, header, responsive styling, table components, and route structure are used.
The older simplified dashboard was removed. Solana SDK imports and wallet signing
were replaced with the ethers adapter in frontend/src/evm/client.ts.

## Flow

- / opens the original homepage, including its theme animations and local assets.
- Login opens /login; connecting an injected EVM wallet then submitting opens /dashboard.
- Register opens /register; sponsor address or derived user ID is resolved, tokens
  are approved, and join(sponsor) must confirm before navigating to /dashboard.
- Referral query parameters are preserved between the homepage and registration.
- Dashboard cards retain their original appearance. With user approval, a matching
  Wallet & Income panel provides test-token funding, Global Pool entry, withdrawal,
  wallet balances, stage progress, and confirmed transaction history. New live
  income is transferred directly to recipient wallets in the earning transaction;
  withdrawal remains only for balances accrued before that upgrade.
  All writes require wallet approval; no private key is available to the frontend.
- All twelve matrix cards and six global cards reflect the contract's active state.
- Direct Team and Income Tree tables use actual sponsor relationships instead of sample rows.
- Account/network changes reload the wallet session; every write checks network and token decimals.
- Genealogy -> Global Data displays the connected historical user's complete
  V5 Growth Tree 1 and Growth Tree 2 reports. The personal summary is read
  from V5 contract state; the full finalized trees use the verified migration
  snapshot bundled with the frontend to avoid hundreds of public-RPC calls.

## Contract differences

The EVM contract is not a port of the archive's Solana program. It does not provide
the binary 14-position pocket tree, recycles, welcome passes, rank rewards, or Royal
Pool admin distribution, so those legacy routes are not exposed. Income-slot and
matrix views render the contract's real three-child relationships using the existing
placement-card styling. Migrated and commission-path members without a paid matrix
parent are left unplaced; the frontend does not invent binary or sponsor placements.

Amounts are mock USDT (6 decimals), not SOL. Legacy internal type/property names
are retained only to adapt the original components. PublicKey.toBase58 is a legacy
view facade returning a checksummed EVM hex address; it does not encode base58.

## Matrix placement

Referral and matrix placement are separate relationships in this contract.
`join(sponsor)` records the sponsor and increments its `directCount`, then
`_activateSlot` starts placement at that sponsor. If the sponsor's three positions
are full, it uses the first open position in the sponsor's downline, breadth-first.
Automatic higher-slot placement starts at the nearest sponsor-chain ancestor that
holds that slot. From direct 4 onward, registration follows the contract's direct-
commission path and creates no paid matrix placement.

Both relationships are shown. `SlotActivated` events are decoded into
`MatrixPlacement` records in `frontend/src/evm/client.ts`; `buildPlacementTree`
assembles the real 3-wide tree, `PlacementTreeView` renders it on /matrix-team
alongside the wallet's own parent and position, and /my-team lists Matrix Parent
and Position beside the sponsor with a spillover marker when they differ.

User IDs are stable frontend ordinals derived from the slot-1 queue, not IDs stored
by the contract. `CycleAdvancePaid`, `CycleCompleted`, `DirectCommissionPaid`, and
`GlobalCycleCompleted` are decoded as income credits. Separate global-cycle credits
are identified by cycleKind 2. The dashboard lists confirmed registration, pool-entry,
immediate income-payment, and legacy withdrawal events with transaction links.
Persistent history indexing would require
additional work; browser event reads cache prior ranges and re-read the last 12 blocks
for shallow reorgs.

## Local setup

1. npm install
2. npm run node
3. npm run deploy:local
4. Enter the local address and block in frontend/.env.local-dev.local.
5. npm run dev --workspace frontend -- --mode local-dev --host 127.0.0.1 --port 5175 --strictPort
6. Use chain 31337 and a wallet funded with test ETH and MockUSDT.

Optional VITE_RPC_URL and VITE_DEPLOYMENT_BLOCK configure read access and the event
scan start. The bootstrap sponsor is read from the contract.

## Verification

npm run frontend:build
npm test
node scripts/check-frontend.cjs

The browser check uses unlocked Hardhat accounts on chain 31337 only and mints
mock tokens. It exercises login, registration/approval, original dashboard routes,
and mobile navigation. It writes screenshots to /private/tmp. Set CHROMIUM_PATH
when using a different local Chromium installation. No public-network transactions
are part of this check. It uses frontend/.env.local-dev.local and port 5175, leaving
the BNB testnet app at port 5173 unchanged. The test also verifies mock minting,
Global Pool entry, legacy pending-balance withdrawal, and the slot tree's third position.

node scripts/check-bsc-frontend.cjs verifies the deployed contract's dashboard and
slot-tree reads in the browser with simulated wallet approvals. It sends no public
testnet transactions. The frontend uses https://bsc-testnet-rpc.publicnode.com because
the previous RPC rejected eth_getLogs. Real-extension signing still requires the
user's wallet approval and is not covered by the simulated-wallet browser checks.

Unsupported Royal Pool, rank/welcome rewards, binary per-ID income, and recycling
views are not exposed in the application navigation; implementing them requires a
specified contract change and new deployment.
No deployed Solidity code or public-testnet state was changed during this integration.
