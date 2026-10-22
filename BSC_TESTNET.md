# BNB Smart Chain testnet

The current public-network target is BSC testnet (chain ID 97). Gas is paid
in test BNB; membership payments use the deployed six-decimal MockUSDT.

The local profile and its deployed addresses are kept separate.

## Deploy

Configure BSC_TESTNET_DEPLOYER_PRIVATE_KEY securely in the local shell environment,
using a test-only wallet funded with test BNB. Do not put it in any VITE_ variable,
frontend file, or source control. BSC_TESTNET_RPC_URL is an optional RPC override.

Run npm run deploy:bsc-testnet. This deploys the mock token, UUPS implementation,
and proxy, then prints their addresses and the deployment block. Set
BOSS_BOOTSTRAP_ADDRESS to the migration root before deployment. The optional
BOSS_OWNER_ADDRESS and BOSS_TREASURY_ADDRESS default to the deployer.

Set the printed VITE_BOSS_ADDRESS and VITE_DEPLOYMENT_BLOCK in
frontend/.env.bsc-testnet.local. The shared .env.bsc-testnet profile deliberately
has no address until a testnet deployment exists.

Run npm run frontend:bsc-testnet, or build using:
npm run build --workspace frontend -- --mode bsc-testnet

Connect the wallet to chain 97. The dashboard's design is unchanged.

## Current upgradeable deployment

- MockUSDT: `0x9c8964a644214C8303adbaFDF02672a7f171287C`
- UUPS proxy: `0x50BB5f822E69130b95408EFE3E156b50c322a4D6`
- V4 implementation: `0xFce58662eD824b5711a587CEbc76Cd083CC311bD`
- Deployment block: `131605801`
- Bootstrap: `0x676c28c70b27E64C7b72203821f0db66BF022d65`
- Owner/treasury: `0x3683b1B0bD4cAd507DD8afb71d960ACD79DEae11`

Migration completed on September 18, 2026: all 105 non-root spreadsheet
registrations were verified on-chain and `finalizeMigration()` was confirmed in
transaction
`0x41a484c77ffaf3b074e12a6669dfafeb18e070125cccffd54868720095917727`.
Migration is permanently closed and live joins are enabled.

The proxy was upgraded to V4 on September 29, 2026. New live matrix, direct
commission, Global Pool, and treasury earnings now transfer immediately to the
recipient wallet. Pending balances created before V4 remain withdrawable.

## Later mainnet migration

Mainnet (chain 56) is not enabled or deployed by this configuration. The contract's
test-chain allowlist and the deployment script currently reject mainnet.
Before enabling it, resolve the existing contract issues, replace MockUSDT with
the chosen payment token, verify token decimals (the current amounts assume 6),
and choose the actual bootstrap/treasury addresses. This requires a new deployment;
changing the frontend chain alone cannot migrate contract state or balances.
