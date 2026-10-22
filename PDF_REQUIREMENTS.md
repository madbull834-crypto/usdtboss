# PDF requirements and implementation assumptions

The 15-page PDF was reviewed page by page. Pages 1-5 contain marketing,
registration, package, payment, referral, dashboard, and withdrawal descriptions.
Pages 6-7 define the 12-slot 3x3 calculation. Pages 8-13 show a separate six-level
global pool. Page 14 lists fees and automatic upgrades; page 15 is a closing page.

## Implemented educational model

### 12-slot 3x3 matrix (pages 5-7)

- A user manually buys only slot 1 for 30 mock USDT.
- Each slot is an independent 3-child matrix. A new member is placed under
  their sponsor; when the sponsor's three positions are full, under the first
  open position in the sponsor's downline, level by level (spillover). An
  automatic slot upgrade is placed in the downline of the nearest sponsor-chain
  ancestor that holds that slot (the bootstrap account holds every slot).
- Three payments produce 3x gross. For slots 1-11, 2x is reserved to activate
  the recipient's next slot and 1x becomes withdrawable.
- Slot 12 has no upgrade, matching the table's "No Upgrade" row.
- A 10% fee is deducted from withdrawable income starting at slot 5. (Page 14
  also says the fee starts "after 4th Direct" -- kept as slot 5 only; see
  Ambiguities below.)
- A bootstrap account seeds every queue. This role must be disclosed in any UI.

### Auto Global Pool (pages 8-13) -- `joinGlobalPool`

The PDF shows this as a separate plan with its own $20 base entry, doubling
per depth, and a per-level entry that is 6x the previous level's. It does not
state real placement or crediting rules (see Ambiguities below), so this is
an explicit interpretation, chosen to reproduce the PDF's printed Income
figures for levels 1-5:

- Each member's position advances through two forced-matrix stages per level:
  a 2-wide "Stage A" priced at that level's entry, and a 5-wide "Stage B"
  priced at 2x entry. Stage A's two payments exactly fund the member's own
  promotion into Stage B -- no new token transfer is needed for that step,
  mirroring how the 12-slot plan auto-funds slot upgrades.
- When Stage B fills (5 promotions = 10x entry gross), 6x entry is reserved
  to auto-fund entry into the next level (matching entry(level+1) = 6x
  entry(level)), and the remaining 4x entry is distributable -- matching the
  PDF's printed Income1 figures for levels 1-5 ($80/$480/$2,880/$17,280/
  $103,680).
- A 10% fee (page 14, item 5: "Global Autopool income plan... 10% Deduction
  from income") is deducted from every distributable amount, unconditionally
  (unlike the 12-slot plan's slot>=5 fee trigger).
- Level 6 has no next level, so its full 10x entry gross is paid out. This
  also reconciles page 13's "Total Income = $1,679,600", previously believed
  to be an arithmetic error in the deck: it is the *lifetime cumulative*
  figure across all six levels -- 4x entry earned at levels 1-5
  (80 + 480 + 2,880 + 17,280 + 103,680 = 124,400) plus level 6's gross of
  1,555,200. The model above reproduces it exactly, which is independent
  evidence that the 10x/6x/4x reading of pages 8-13 is the intended one.
- A bootstrap account seeds Stage A and Stage B for every level, the same
  role as the 12-slot plan's queue seed.
- New credited amounts are transferred immediately to the recipient wallet in
  both plans. `members[account].withdrawable` and `withdraw()` remain only for
  balances accrued before the immediate-payout upgrade.

### Both plans

- Live earnings use immediate token transfers. Upgrade reserves remain in the
  contract, and every payout remains backed by tokens already received.

## Ambiguities deliberately not invented

- Page 5 says joining is 30 USDT, while global level 1 says 20 USDT. The two
  plans are kept as separate join functions (`join` vs `joinGlobalPool`) with
  their own prices rather than reconciling them.
- The 12-slot table and six-level global pool use different price sequences.
- "2nd and 3rd Direct" does not define placement behavior. The 12-slot plan
  places members under their sponsor (client decision, 22 Sep 2026); the
  Global Pool remains a global breadth-first queue (see its Stage A/B
  description above).
- Page 14 says both "after 4th Direct" and "after 5th Slot" for the 12-slot
  plan's fee trigger. The implementation chooses slot 5 because that rule is
  deterministic; `directCount` is still tracked on `Member` but unused for
  fee logic.
- Page 7's "Total Income" column (levels 2-12) assumes income from an entire
  3^n downline (3^12 = 531,441 people at level 12, for a printed balance of
  $32.65 billion). The contract pays one 3-payment cycle per slot instead, so
  a member's maximum lifetime slot income is $110,610 after fees. This column
  is not implementable as printed and is not implemented.
- Minimum withdrawal, verification, and withdrawal fees (page 4) are
  mentioned without values, so `withdraw()` still pays out any nonzero
  balance with no minimum or additional fee.

## Safety scope

The constructor only permits Hardhat (31337), Sepolia (11155111), BSC testnet
(97), Polygon Amoy (80002), and Base Sepolia (84532). The deployment script uses
`MockUSDT`; it does not accept or configure a production token.
