# BSC mainnet deployment

Mainnet is deliberately a two-stage release: deploy and migrate first, then
publish the frontend only after its on-chain preflight passes.

## Fixed production configuration

- Chain: BNB Smart Chain, chain ID 56
- Payment token: BSC USDT `0x55d398326f99059fF775485246999027B3197955`
- Treasury/accounting: `0xEBD97f2695379F99E75bC5bddd48C0AAAC6E9f3d`
- Bootstrap/root: `0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f`
- Implementation for new deployments: `UsdtBossEducationalV6`

The deployment script rejects different treasury/root values and a payment
token without deployed code or 18 decimals. The mainnet deployer is initialized
as the UUPS owner and therefore authorizes every future implementation upgrade.

V6 adds `withdrawPoolFunds(recipient, amount)`, which lets only the proxy owner
transfer USDT held by the proxy. This function can also remove funds reserved
for participant upgrades or Global Pool payouts, so validate the amount and
remaining solvency independently before every withdrawal.

## Before deployment

1. Obtain an independent smart-contract audit and resolve every accepted
   finding. Slither is a useful additional check, not a substitute for review.
2. Install Slither so the `slither` command is available, then run
   `npm run security:slither`.
3. Run `npm run preflight:mainnet:code`.
4. Copy `.env.mainnet.example` to `.env.mainnet.local`. Set the deployer key and
   mainnet RPC. Never put the private key in a frontend `VITE_` variable.
5. Confirm the deployer has enough BNB. Back up the key securely: loss or
   compromise affects all future upgrades.

## Deploy and migrate

Set `CONFIRM_MAINNET_DEPLOY=YES`, then run:

```bash
npm run deploy:bsc-mainnet
```

Record the proxy, implementation, transaction hash and deployment block. Keep
migration open while importing and independently reconciling registrations and
display-only history. The mainnet import commands scale the existing six-decimal
payloads to the production token's 18 decimals.

Finalize registration migration only after reconciliation. This action is
permanent and enables live joins.

## Publish the frontend

Copy `frontend/.env.bsc-mainnet.example` to
`frontend/.env.bsc-mainnet.local`, insert the proxy address and deployment
block, and use a production/archive RPC appropriate for the expected traffic.

```bash
npm run frontend:build:bsc-mainnet
```

That command checks the live chain, implementation version, payment token and
unit, treasury, root, upgrade owner, deployment block, and finalized migration
before producing the static build.
