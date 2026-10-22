# BSC testnet deployment package

This package contains a ready-to-upload static site in `site/` and the complete
reproducible project in `source/`.

## Current network configuration

- Network: BNB Smart Chain testnet (chain ID 97)
- UUPS proxy: `0x50BB5f822E69130b95408EFE3E156b50c322a4D6`
- V4 implementation: `0xFce58662eD824b5711a587CEbc76Cd083CC311bD`
- MockUSDT: `0x9c8964a644214C8303adbaFDF02672a7f171287C`
- Deployment block: `131605801`
- Bootstrap: `0x676c28c70b27E64C7b72203821f0db66BF022d65`
- Treasury / owner: `0x3683b1B0bD4cAd507DD8afb71d960ACD79DEae11`
- Registration migration: finalized, 105 records verified
- Immediate payouts: active for new live earnings; pre-V4 pending balances
  remain available through `withdraw()`

## Contract state at packaging time

- 106 members in the slot-1 queue; 105 imported, 1 bootstrap.
- No live `join()` has occurred yet, so every `childrenFilled`, `cycleGross`
  and `withdrawable` is zero and no matrix placement exists. The matrix views
  are empty because there is nothing to show, not because of a fault.
- Legacy income import: 2,601.00 USDT across 40 accounts, held in
  `legacyIncome` for display only. `legacyBackfillFinalized` is `true`, so
  those figures are now immutable. They are NOT withdrawable and are not
  included in `matrixIncome`, `globalIncome` or `withdrawable`.
- Global Pool history import: 72 accounts recorded in `legacyGlobalLevel`
  (67 at level 1, 5 at level 2), derived from the sheet's `gpack` column.
  `legacyGlobalFinalized` is still `false`, so these remain editable. Nobody
  was enrolled in `globalMembers` and no Stage A/B queue position was created:
  those entry fees were paid to the previous platform, not to this contract.
  The live pool therefore still contains only the bootstrap account.
- The contract holds 0 mUSDT. Nothing is claimable until real activity funds
  it.

## Admin charge rules in force

- 10% (`FEE_BPS = 1000`) taken from the distributable part of a completed
  cycle, credited to the treasury balance.
- Matrix plan: charged when `slot >= FEE_SLOT_THRESHOLD` (5) **OR**
  `directCount >= FEE_DIRECT_THRESHOLD` (4). Below both, the cycle is credited
  in full, which keeps the opening slots free.
- Global Pool: charged on every level, unconditionally.
- Each member completes exactly one cycle per slot; positions do not recycle.

## Static hosting

Upload the contents of `site/` to the web root. Configure SPA fallback so
unknown routes serve `index.html`; an nginx example is included.

The dashboard shows the imported figures beside the live ones, never added to
them: "Previous Platform" income sits next to Total Income, and the Global Pool
card shows the live count with "+72 imported from previous platform" beneath.
Both are historical records, not claimable positions.

The site reads everything from the chain. The only build-time configuration is
the chain ID, RPC URL, contract address and deployment block, already baked in.

### Optional: event history

Income history and matrix placements are read from `eth_getLogs`. Free public
BSC testnet endpoints either prune logs back to the deployment block or cap the
range, so those panels may show a dash. Member counts, sponsors, direct counts,
slot levels, balances and legacy income all come from contract state and are
unaffected. To enable history, set `VITE_LOGS_RPC_URLS` to an archive endpoint
and rebuild.

## Rebuild

From `source/`, install Node.js 20 or newer, then run:

```bash
npm ci
npm test
npm run frontend:build:bsc-testnet
```

Never expose the deployment private key in frontend files or `VITE_`
variables. No populated `.env` or local override file is included.
