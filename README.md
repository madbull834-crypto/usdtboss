# USDT Boss educational dashboard

A Hardhat/Solidity dashboard using the attached solvalue dashboard presentation,
React, TypeScript and ethers. It connects to UsdtBossEducational for registration,
Global Pool participation and immediate live-income payouts. See
FRONTEND_INTEGRATION.md for scope.

## Requirements

- Node.js 20+
- MetaMask or another EIP-1193 browser wallet for the UI

## Install

```bash
npm install
```

## Compile and test

```bash
npm run compile
npm test
```

## Run locally

In separate terminals:

```bash
npm run node
npm run deploy:local
```

Copy the printed address into `frontend/.env.local`:

```bash
cp frontend/.env.example frontend/.env.local
# Set VITE_BOSS_ADDRESS to the printed UsdtBossEducational address
```

Configure your wallet for the Hardhat network (`http://127.0.0.1:8545`, chain ID `31337`) and import a test account displayed by `npm run node` if needed. These accounts and transactions are local only; never use a real private key or mainnet account.

Start the frontend:

```bash
npm run frontend:dev
```

The join buttons request mock-USDT approval and then registration. New live
earnings are sent directly to recipient wallets; withdrawal remains available
for any pending balance created before the immediate-payout upgrade. All
signatures occur in the connected wallet.
Use a joining account funded with test ETH and mock USDT; the bootstrap account
is already registered.

## Frontend build

```bash
npm run frontend:build
```

## USDT Boss contract

The repository contains an interpretation of the PDF's
12-slot 3x3 matrix (`join`) and its separate 6-level Auto Global Pool
(`joinGlobalPool`). It uses `MockUSDT` on development networks, immediate
live-income payouts, automatic slot/level upgrades, and an explicit chain-ID
allow-list. See
`PDF_REQUIREMENTS.md` for the exact assumptions and unresolved contradictions.

```bash
npm test
npm run node
npm run deploy:local
```

## Registration migration and contract upgrades

`UsdtBossEducational` is deployed behind an owner-authorized UUPS proxy. The
proxy address is the permanent address used by the frontend. Deployments begin
with migration open and live joins disabled.

The legacy registration import intentionally uses only:

- `walletaddress` as the registered account
- `refaladdress` as its sponsor
- `level` as its currently activated matrix level
- `amount` as that level's price

Prepare and validate the workbook locally:

```bash
python3 scripts/prepare-registration-migration.py \
  /path/to/registration.xlsx migration-registration.json
```

For this workbook, deploy the proxy with the confirmed root wallet:

```bash
BOSS_BOOTSTRAP_ADDRESS=0x676c28c70b27E64C7b72203821f0db66BF022d65
```

This is the workbook's unique root row (`refaladdress == 0`).
`BOSS_OWNER_ADDRESS` controls imports and future upgrades;
`BOSS_TREASURY_ADDRESS` receives protocol fees.

The converter fails on duplicate wallets, invalid levels/amounts, cycles, and
referrers missing from the workbook. A correction can be supplied only after
client confirmation:

```bash
python3 scripts/prepare-registration-migration.py input.xlsx output.json \
  --referral-fix 0xACCOUNT=0xCONFIRMED_SPONSOR
```

Import registrations in resumable, sponsor-first batches. The script verifies
all four fields after import and does not finalize by default:

```bash
BOSS_PROXY_ADDRESS=0x... MIGRATION_FILE=./migration-registration.json \
  npm run migrate:bsc-testnet
```

After the client verifies the proxy state, permanently close migration and
enable live joins:

```bash
BOSS_PROXY_ADDRESS=0x... MIGRATION_FILE=./migration-registration.json \
  FINALIZE_MIGRATION=true npm run migrate:bsc-testnet
```

Historical payments are not credited as withdrawable balances or partial
cycles: the new contract never received those tokens. Migrated members enter
their activated-level queues with clean cycle progress.

For a future implementation upgrade, preserve the storage layout, test it,
then run with the owner wallet:

```bash
BOSS_PROXY_ADDRESS=0x... BOSS_IMPLEMENTATION=UsdtBossEducationalV4 \
  npm run upgrade:bsc-testnet
```

V4 enables immediate payouts without adding storage. Existing pending
`withdrawable` balances remain claimable after the upgrade.

V5 appends display-only storage for the two historical growth trees. It does
not change live placement, income, balances, or token liabilities. Prepare the
validated wallet-based payload, validate/upgrade the proxy, and import in
resumable batches:

```bash
python3 scripts/prepare-legacy-growth.py \
  /path/to/growthchart.csv /path/to/growthchart1.csv \
  legacy-identities-payload.json legacy-growth-payload.json

BOSS_PROXY_ADDRESS=0x... npm run validate:v5:bsc-testnet
BOSS_PROXY_ADDRESS=0x... BOSS_IMPLEMENTATION=UsdtBossEducationalV5 \
  npm run upgrade:bsc-testnet
BOSS_PROXY_ADDRESS=0x... LEGACY_GROWTH_FILE=legacy-growth-payload.json \
  LEGACY_GROWTH_FINALIZE=1 npm run backfill:legacy-growth:bsc-testnet
```

Tree 1 stores 72 binary-growth rows and Tree 2 stores 36 five-wide-growth
rows. `position` is the source row's position across its entire level, not a
child index. Both imports are independently verified and permanently closed.

V6 adds an owner-only withdrawal of payment tokens held by the proxy. Validate
and upgrade first:

```bash
BOSS_PROXY_ADDRESS=0x... npm run validate:v6:bsc-mainnet
BOSS_PROXY_ADDRESS=0x... BOSS_IMPLEMENTATION=UsdtBossEducationalV6 \
  npm run upgrade:bsc-mainnet
```

After independently calculating how much can be removed without breaking
participant reserves, the owner can withdraw an explicit amount. Amounts are
entered in whole USDT units, not wei:

```bash
BOSS_PROXY_ADDRESS=0x... \
BOSS_POOL_WITHDRAW_RECIPIENT=0x... \
BOSS_POOL_WITHDRAW_AMOUNT=100 \
CONFIRM_POOL_WITHDRAW=YES \
  npm run withdraw:pool:bsc-mainnet
```

Every withdrawal emits `PoolFundsWithdrawn`. V6 does not calculate liabilities;
the owner can withdraw reserved funds, so the remaining solvency must be checked
before submitting the transaction.

For BSC mainnet, copy `.env.mainnet.example` to `.env.mainnet.local`,
securely configure and fund the deployer with BNB, and complete the production
frontend configuration. The mainnet deployer is also the UUPS upgrade owner. The
deployment script uses BSC USDT, validates its 18 decimals and deployed code,
deploys V6, and requires `CONFIRM_MAINNET_DEPLOY=YES`. The configured treasury
is `0xEBD97f2695379F99E75bC5bddd48C0AAAC6E9f3d`; the bootstrap/root account is
`0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f`.
