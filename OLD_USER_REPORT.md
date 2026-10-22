# Old-user local report

Generated from `registration.xlsx`, `wallet.csv`, `growthchart.csv`, and
`growthchart1.csv`. The files were treated as data only.

## User 120826

- Wallet: `0x676c28c70b27E64C7b72203821f0db66BF022d65`
- Referral sponsor: Root / System
- Matrix level: 12
- Sponsor-referral directs: 4
- Total sponsor-referral team: 105
- Historical working income: 210 USDT
- Historical growth/global income: 72 USDT
- Total historical income: 282 USDT

### Sponsor-referral directs

| User ID | Wallet | Matrix level |
| --- | --- | ---: |
| 712674 | `0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18` | 2 |
| 397364 | `0xe2054Ed8e010618501838d6116BfdCDC4955CfdA` | 2 |
| 795406 | `0x8f43A3b2cF8eE64Cb1A2F81E37DeC53c231cbE9D` | 2 |
| 976584 | `0x5224BD34CF13797513bF346478AdA8AbC9A80626` | 1 |

## Growth reports

The growth files define separate trees and must not be counted as sponsor
referrals.

- `growthchart.csv`: user 120826 is at level 1, has 2 immediate growth
  children (712674 and 397364), and 71 downstream growth members through
  level 7.
- `growthchart1.csv`: user 120826 is at level 1, has 5 immediate growth
  children (712674, 397364, 795406, 668160, and 125340), and 35 downstream
  growth members through level 4.

## Local verification

- 106 historical identities loaded.
- 105 non-root registrations migrated and verified.
- 72 historical growth/global levels loaded and verified.
- 2,601 USDT historical working income reconciled.
- 504 USDT historical growth/global income reconciled.
- Frontend unit tests: 5 passed.
- Production frontend build: passed.

One workbook record for user 976584 referenced a sponsor wallet absent from
the workbook. The already-deployed BSC testnet contract confirms that user's
sponsor is the root wallet, so the same relationship was used only for the
local migration.
