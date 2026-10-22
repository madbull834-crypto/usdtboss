# BSC mainnet deployment record

- Network: BNB Smart Chain (chain ID 56)
- Proxy: `0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040`
- Current implementation: `0x00D6d3Af9CBCCB1b2c63C6a0F1F14554f2D1b9E8`
- Previous V9 implementation: `0x0d1745d9bCc8431A6710E7c4bd8D156a7BdEEf25`
- Version: 10
- Deployer / UUPS owner: `0x32a8A59c9aa2DC2d125CDf9a4ec154827a69Eed2`
- Payment token: `0x55d398326f99059fF775485246999027B3197955`
- Payment-token unit: `1000000000000000000` (18 decimals)
- Treasury/accounting: `0xEBD97f2695379F99E75bC5bddd48C0AAAC6E9f3d`
- Bootstrap/root: `0x3C996F25D3c276F63B5BE0d8D55b356b6A416F7f`
- Implementation transaction: `0xb3c9714843f0b0cd726c465c18a9066c7b749c55b007210de69050078e6dba15`
- Implementation block: `124953753`
- Proxy transaction: `0x58190beb677fc72d59679874290e5007b5aef0f9e95af7fef31032af75613f7c`
- Proxy deployment block: `124953757`

## V6 owner-withdrawal upgrade

- Implementation transaction: `0x9d605ff8823553124e5eaf10a5a95c8a3563206a7ace79a604aa348be8546234`
- Implementation block: `126474873`
- Proxy upgrade transaction: `0x2a84ae365fbd508639065eb36d31d3e362adb498d0e5d100bf5448801ef1c698`
- Proxy upgrade block: `126474880`
- Verified implementation: `https://bscscan.com/address/0x9Ae2e6C068efD13Ae2CB5C5132DDDca26E4CA003#code`
- Verified proxy: `https://bscscan.com/address/0xfF0887f4CF1D69fCc41D1D6B61D464fB229B2040#code`

Post-upgrade reads confirmed version 6, the unchanged owner, the new
implementation slot, and the unchanged 70-USDT proxy balance. No pool
withdrawal was made during the upgrade or verification.

## V7 one-address Slot-3 correction

- Implementation: `0x67Be47C7186439F00249aD95A1960879Fb7C1DBA`
- Implementation transaction: `0xc594d5102f2c6bf48cf810464b2a8de8e7f8f334aca4677d427d8017c3b20f83`
- Implementation block: `126690425`
- Corrected account: `0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18`
- Corrected level: Slot 2 to Slot 3

The proxy upgrade and correction were executed atomically. Independent
post-transaction reads confirmed V7, the implementation address, Slot 3,
the 120-USDT activated amount, and the account as the final Slot-3 queue
entry. The correction created no matrix parent, cycle fill, cycle gross,
income, or token movement. Its entry point is hard-limited to this account;
normal automatic slot upgrades for every member are unchanged.

## V8 approved Global Pool migration

- Implementation: `0x043A267DCcEE75afD9E7fa2f04A2A838E8cBaAFA`
- Implementation transaction: `0xe001cf871fbadcf610e11da718139bc90e0247fc03167f6abd7fa981c4e8ded1`
- Implementation block: `126862480`
- Atomic proxy upgrade/migration transaction: `0x0e52a0721f90c177abb759d502a4749d427d151c961ead98d25d4573dfd05324`
- Upgrade block: `126862486`
- Receipt status: `1`
- Gas used: `355039`

The migration added the approved sponsor and five approved members to the
live Level-1 Global Pool Stage-A queue. Independent reads confirmed all six
accounts at Level 1 in queue positions 3 through 8. Their existing Slot-1/2
package state remained unchanged. The atomic migration moved no payment
tokens, fabricated no Stage-A or Stage-B fills, and created no Global Pool
income. Re-execution is prevented because every approved account is now an
existing live Global Pool member.

## V9 approved Matrix registration

- Implementation: `0x0d1745d9bCc8431A6710E7c4bd8D156a7BdEEf25`
- Implementation transaction: `0xdeebe2bd9a6741dbf8fa40a362e5e2738a19319f37ff8eabaf3cdfa89a6a3189`
- Implementation block: `127243950`
- Atomic proxy upgrade/registration transaction: `0xc5df4d7f769ef9e4b214558daf87a61bf3e9e61751ef037b0b10c1cc70d2b92f`
- Upgrade block: `127243957`
- Receipt status: `1`
- Gas used: `433335`
- Sponsor: `0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759`

The upgrade registered the following five approved wallets in the Matrix plan
and activated Slot 1 without collecting USDT:

- `0x940F87CD3b50C280B5AE42E97c62950C5C658F6b`
- `0xaDFCd5780A96Ca8a9f543674A40753438E825965`
- `0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C`
- `0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6`
- `0x11AD0bC070fBEE83622a86a5780b3948bB7059F4`

Independent reads confirmed V9, the implementation slot, sponsor relationships,
Slot-1 activation amounts, and all five accounts as the final queue entries.
The atomic transaction emitted no payment-token transfers and created no matrix
parent, cycle fill, cycle gross, or income. The accounts were not enrolled in
the separate Global Pool.

## V10 approved account-address correction

- Implementation: `0x00D6d3Af9CBCCB1b2c63C6a0F1F14554f2D1b9E8`
- Implementation transaction: `0x11700fe477bb3d811cb10c72c25866e0637941f741ccbb12c127864666211456`
- Implementation block: `127251015`
- Atomic proxy upgrade/migration transaction: `0x0fc361a3606cd6c0936a06f68282d21f32d20596cd41c01afdb76efe2939d2b5`
- Upgrade block: `127251022`
- Receipt status: `1`
- Gas used: `1204796`
- Previous account: `0x8451866ccC54ABc2f49D1e2bb2041C46035FE8f6`
- Replacement account: `0xaF9168210B45EB0F660dEF7D08cA0BA7E2272BEf`

The correction atomically moved migrated user ID `139875`, its Slot-2 package,
60-USDT activated amount, four direct referrals, two Matrix queue entries,
57-USDT display-only legacy income, legacy Global Pool Level 1, and both legacy
growth-tree records to the replacement account. Growth Tree 1's two child
parent links were also updated. The previous account was cleared.

Independent reads confirmed V10, the implementation slot, both queues, all four
direct sponsors, both growth records, and the reverse user-ID lookup. The atomic
transaction emitted no payment-token transfers and did not create income or
live Global Pool state.

## V11 Global Pool Level-1 activation for the five V9 wallets

- Implementation: `0x3c4c28b7ea9ED33089Ad1e215fD87F947A29e06d`
- Implementation transaction: `0xa267a8b4a078ae0f47e1583288638dfd6cc50a904ee1e1a9ae1203e590965a0b`
- Implementation block: `127252840`
- Atomic proxy upgrade/activation transaction: `0x64c5ebbd63f410589b955de35cec98ce8a296b904000fcc008ebe088de52b320`
- Upgrade block: `127252847`
- Receipt status: `1`
- Gas used: `518339`
- Sponsor: `0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759`

The upgrade activated live Global Pool Level 1 for these five previously
registered Matrix wallets, without collecting USDT:

- `0x940F87CD3b50C280B5AE42E97c62950C5C658F6b`
- `0xaDFCd5780A96Ca8a9f543674A40753438E825965`
- `0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C`
- `0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6`
- `0x11AD0bC070fBEE83622a86a5780b3948bB7059F4`

All five were appended, in the listed order, as the final Level-1 Stage-A
queue entries. The final queue length is 14. The state-only activation did not
fill the sponsor's cycle, create Global income, or alter the existing Matrix
package state. Pre/post balance checks passed for the proxy, owner, treasury,
sponsor, and all five wallets. The atomic receipt contains five activation
events and zero payment-token `Transfer` events.

The V9, V10, and V11 atomic upgrade receipts have status `1`. Independent
post-deployment reads confirmed the implementation slot, owner, token, unit, treasury, root, V11,
30-USDT slot-1 price and 20-USDT Global Pool level-1 price.

Registration migration is permanently closed (`migrationFinalized == true`),
and live joins are enabled.

## V12 historical Global Pool activation

- Date: 15 October 2026
- Implementation: `0x991A9e6E27ed47F29187A49bAe9bA1083FF6d77b`
- Atomic proxy upgrade/activation transaction: `0xe99d233b88fd43f3315ceb2a2d65d33d48fef54e4484d3957168138fd5c882f1`
- Upgrade block: `127830769`
- Receipt status: `1`
- Gas used: `3,796,724`

V12 activated the 68 historical Global Pool members who did not yet have a
live position. Four of the 72 historical members were already live and were
not duplicated. Each newly activated wallet received a clean live Level-1
Stage-A queue position without paying another 20 USDT. Historical levels remain
unchanged in `legacyGlobalLevel` for reporting.

The final audit verified all 72 historical members as live, 68 ordered queue
additions with zero Stage-A/Stage-B fills, and zero USDT `Transfer` events in
the atomic receipt. The live Global Pool now contains 82 positions: 81 real
users and one bootstrap position.

## V13 legacy Level-1 completion correction

- Date: 15 October 2026
- Implementation: `0x5F0E8735c7E25fa883c9ec15868e7eccCEe086F3`
- Atomic proxy upgrade/correction transaction: `0x3bbc473dc22fb4226d304841572fccd4ced14d144f50e961817f6720464683a4`
- Upgrade block: `127832587`
- Receipt status: `1`
- Gas used: `456,689`

V13 marked live Global Pool Level 1 complete for the five wallets whose
verified previous-platform record was already Level 2. Each now has Level-1
Stage A `2/2`, Stage B `5/5`, and a clean live Level-2 Stage-A queue position.
The historical level remains 2. No retroactive income was created, no other
member's cycle was filled, the Level-1 queue length remained 82, and the
Level-2 queue length increased from 1 to 6. The atomic receipt contains five
correction events and zero USDT `Transfer` events.

## V14 duplicate legacy Global Pool cleanup

- Date: 16 October 2026
- Implementation: `0xD65d507273A27517f871f7B974426550981CFd46`
- Atomic proxy upgrade/cleanup transaction: `0xaceaeb91844fbfef3370e84e7a85806224a745d26b7d2e9bd9ecf2b80f113a2b`
- Upgrade block: `127835358`
- Receipt status: `1`
- Gas used: `473,965`

V14 cleared all 72 duplicate previous-platform Global Pool level records from
current contract state and reset `legacyGlobalCount` from 72 to zero. All 72
wallets had already been activated in the live Global Pool, so this cleanup did
not remove any live member. The Level-1 queue remains 82 positions, the Level-2
queue remains 6 positions, the five completed Level-1 states remain unchanged,
and all income and fill counters were verified against pre-upgrade snapshots.
The receipt contains 72 clear events and zero USDT `Transfer` events. Original
historical import events remain available in immutable blockchain history.

## Registration migration

The previous root `0x676c28c70b27E64C7b72203821f0db66BF022d65`
was imported as a direct child of the new root. A total of 106 historical
accounts were imported and read back successfully. Later testnet-only joins
were excluded using the on-chain `wasMigrated` marker.

- Batch 1: `0xba3d3bfded465058e4e1c4edeb62bea9b9847455a7f970ee6a942cca3e633557`
- Batch 2: `0xa82b4e4377c0236dff4e5a5103a6ce7296b0f4df32d3b14fe8162973a8507d5b`
- Batch 3: `0xb05806b3885dd0d6ad96f96b887d119edf6ce7df087ab97f34aa67f86af29f08`
- Batch 4: `0x70976321df363a6713a90fab9336c6044c5a43b29c98106513663d32131faa4e`
- Batch 5: `0x8a504755ad49650f12b53aac4ac09fe2957c1ec84aa77bfdbbbe18eee9f40d83`

All five receipts have status `1`. Reconciled queue lengths are 107 at slot 1,
18 at slot 2, 3 at slot 3 and 2 at slot 12, including the new bootstrap root.

Registration migration was subsequently finalized with explicit approval.
On-chain `migrationFinalized()` is `true`, live joins are enabled, and the live
production frontend preflight passes. This closure is permanent.

## Historical data migration

All display-only historical datasets were imported, read back, reconciled and
permanently finalized on BSC mainnet. These records do not create withdrawable
balances or live Global Pool positions.

- Working income: 40 accounts, 2,601 USDT total
  - Import: `0x821ba68f6381b987d66ad6bf438e5c6ffeb77a05485e9c765282e17297715dc1`
  - Finalize: `0x2b8e39c4ab5269ba3e18ae508565cacac2a97edbd0460f71ec4bbe504161729f`
- Global Pool levels: 72 accounts; zero live enrolments created
  - Batch 1: `0x29919f14722fd14571db1a4db10c933a8f2fcd15458dd814076a997f458ec7a6`
  - Batch 2: `0xb4fab8c2801a34d0326d2cae7d76c6f9d685a9ad8bd03da7d87e812747e67302`
  - Finalize: `0x721054cf30910a466187eea693e5963a084c0658060060063e6d2377ef482c41`
- Legacy identities: 106 accounts
  - Batch 1: `0xd3d8f8dac2bb884d8bfa1c688479beccd956194d4f0b376c00348bc9f11f0d60`
  - Batch 2: `0x75a19143a468012886cca4997873acb86bacbfac33e06a8b3268598e216b060e`
  - Batch 3: `0xacab3e523e78553f4e560ed03050deefbe0fcebeab30fb4d2a418272d47f6be9`
- Global income: 7 accounts, 504 USDT total
  - Import: `0xdd2eb9c84edaff346c7012a764328c78e49696cb90cdedfba392a6fb65ccd038`
- Growth Tree 1: 72 records
  - Batch 1: `0xa7e44dd5c572293ff8c338a29dabfc355a243a5d9cfaadb7b7f266b18c3384e7`
  - Batch 2: `0x0157a784538e897ec2f3695549b385abfa5e72e8a85b93f0dac947307bbc4d7a`
  - Finalize: `0xb25ccc2e04d742b677efb9e15cc31b74a40d21fcdffd6dfc2a21eb3403eb4105`
- Growth Tree 2: 36 records
  - Import: `0xb4ce7f940efef4840b088af341e9951d13a65a48f17e4330c18465f8b259eaf5`
  - Finalize: `0xa8376f770018dae15fc782ee8ed5c173a528e45aeb78a7294c73034af8f93495`

Final independent reads confirmed contract version 5 and every historical
import finalization flag as `true`.
