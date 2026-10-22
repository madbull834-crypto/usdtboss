import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("UsdtBossEducational", function () {
  it("scales every price to an 18-decimal production token", async function () {
    const [bootstrap, treasury] = await ethers.getSigners();
    const token: any = await ethers.deployContract("MockUSDT18");
    const Boss = await ethers.getContractFactory("UsdtBossEducationalV5");
    const boss: any = await upgrades.deployProxy(Boss, [
      await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
    ], { kind: "uups" });

    expect(await boss.paymentTokenUnit()).to.equal(10n ** 18n);
    expect(await boss.version()).to.equal(5n);
    expect(await boss.slotPrice(1)).to.equal(30n * 10n ** 18n);
    expect(await boss.slotPrice(12)).to.equal(61_440n * 10n ** 18n);
    expect(await boss.globalPoolEntry(1)).to.equal(20n * 10n ** 18n);
    expect(await boss.globalPoolEntry(6)).to.equal(155_520n * 10n ** 18n);
  });

  async function fixture() {
    const [bootstrap, treasury, a, b, c, d, e, f] = await ethers.getSigners();
    const token: any = await ethers.deployContract("MockUSDT");
    const Boss = await ethers.getContractFactory("UsdtBossEducational");
    const boss: any = await upgrades.deployProxy(Boss, [
      await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
    ], { kind: "uups" });
    await boss.finalizeMigration();
    for (const user of [a, b, c, d, e, f]) {
      await token.mint(user.address, 30_000_000n);
      await token.connect(user).approve(await boss.getAddress(), 30_000_000n);
    }
    return { bootstrap, treasury, a, b, c, d, e, f, token, boss };
  }

  async function globalPoolFixture() {
    const signers = await ethers.getSigners();
    const [bootstrap, treasury] = signers;
    const users = signers.slice(2, 14); // 12 fresh joiners: enough for one full level-1 cycle
    const token: any = await ethers.deployContract("MockUSDT");
    const Boss = await ethers.getContractFactory("UsdtBossEducational");
    const boss: any = await upgrades.deployProxy(Boss, [
      await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
    ], { kind: "uups" });
    await boss.finalizeMigration();
    for (const user of users) {
      await token.mint(user.address, 20_000_000n);
      await token.connect(user).approve(await boss.getAddress(), 20_000_000n);
    }
    return { bootstrap, treasury, users, token, boss };
  }

  describe("admin charges", function () {
    // A sponsor with a wide enough downline to complete slot-1 cycles.
    async function wideFixture(count: number) {
      const signers = await ethers.getSigners();
      const [bootstrap, treasury] = signers;
      const users = signers.slice(2, 2 + count);
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
      ], { kind: "uups" });
      await boss.finalizeMigration();
      for (const user of users) {
        await token.mint(user.address, 30_000_000n);
        await token.connect(user).approve(await boss.getAddress(), 30_000_000n);
      }
      return { bootstrap, treasury, users, token, boss };
    }

    it("exposes the two thresholds the plan describes", async function () {
      const { boss } = await wideFixture(1);
      expect(await boss.FEE_SLOT_THRESHOLD()).to.equal(5);
      expect(await boss.FEE_DIRECT_THRESHOLD()).to.equal(4);
      expect(await boss.FEE_BPS()).to.equal(1_000);
    });

    it("takes no admin charge on an early cycle below both thresholds", async function () {
      const { bootstrap, users, boss } = await wideFixture(4);
      // sponsor joins, then three directs fill its slot-1 cycle
      await boss.connect(users[0]).join(bootstrap.address);
      for (let i = 1; i < 4; i++) await boss.connect(users[i]).join(users[0].address);

      const events = await boss.queryFilter(boss.filters.CycleCompleted());
      const own = events.filter((e: any) => e.args.member === users[0].address);
      expect(own.length).to.be.greaterThan(0);
      // 3 directs < FEE_DIRECT_THRESHOLD, slot 1 < FEE_SLOT_THRESHOLD
      expect((await boss.members(users[0].address)).directCount).to.equal(3);
      expect(own[0].args.slot).to.equal(1);
      expect(own[0].args.adminFee).to.equal(0n);
    });

    // A member completes exactly one cycle per slot, and at slot 1 that cycle
    // always lands on its 3rd matrix child -- so a plain live tree can never
    // reach 4 directs before completing. Pre-seeding directs via migration is
    // what isolates the direct trigger from the slot trigger.
    it("charges 10% on direct commission once past the threshold", async function () {
      const signers = await ethers.getSigners();
      const [bootstrap, treasury, x, d1, d2, d3, d4, l1] = signers;
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
      ], { kind: "uups" });
      const price = await boss.slotPrice(1);
      await boss.migrateMembers([{ account: x.address, sponsor: bootstrap.address, level: 1, amount: price }]);
      await boss.migrateMembers([d1, d2, d3, d4].map((d) => (
        { account: d.address, sponsor: x.address, level: 1, amount: price }
      )));
      await boss.finalizeMigration();
      expect((await boss.members(x.address)).directCount).to.equal(4);

      await token.mint(l1.address, 30_000_000n);
      await token.connect(l1).approve(await boss.getAddress(), 30_000_000n);
      await boss.connect(l1).join(x.address);   // x's 5th direct -> commission path

      const ev: any = (await boss.queryFilter(boss.filters.DirectCommissionPaid()))
        .filter((e: any) => e.args.sponsor === x.address)[0];
      expect(ev.args.adminFee, "10% of the 30 joining fee").to.equal(3_000_000n);
      expect(ev.args.credited, "sponsor keeps 90%").to.equal(27_000_000n);
      expect(await token.balanceOf(x.address), "commission is transferred immediately").to.equal(27_000_000n);
      expect(await token.balanceOf(treasury.address), "fee is transferred immediately").to.equal(3_000_000n);
      expect((await boss.members(x.address)).withdrawable).to.equal(0n);
      expect((await boss.members(treasury.address)).withdrawable).to.equal(0n);
      // commission joins take no matrix position
      expect(await boss.matrixParent(1, l1.address)).to.equal(ethers.ZeroAddress);
      expect(await boss.childrenFilled(1, x.address)).to.equal(0);
    });
  });

  describe("legacy Global Pool import", function () {
    async function seeded() {
      const [bootstrap, treasury, x, y] = await ethers.getSigners();
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
      ], { kind: "uups" });
      const price = await boss.slotPrice(1);
      await boss.migrateMembers([
        { account: x.address, sponsor: bootstrap.address, level: 1, amount: price },
        { account: y.address, sponsor: bootstrap.address, level: 1, amount: price }
      ]);
      await boss.finalizeMigration();
      return { bootstrap, treasury, x, y, token, boss };
    }

    it("records the level without enrolling the member in the live pool", async function () {
      const { x, y, boss } = await seeded();
      await boss.backfillLegacyGlobal([
        { account: x.address, level: 2 },
        { account: y.address, level: 1 }
      ]);
      expect(await boss.legacyGlobalLevel(x.address)).to.equal(2);
      expect(await boss.legacyGlobalLevel(y.address)).to.equal(1);
      expect(await boss.legacyGlobalCount()).to.equal(2);
      for (const u of [x, y]) {
        expect((await boss.globalMembers(u.address)).joined, "must not be enrolled").to.equal(false);
        expect((await boss.members(u.address)).withdrawable, "must not be claimable").to.equal(0n);
        expect(await boss.globalIncome(u.address)).to.equal(0n);
      }
      expect(await boss.globalQueueLengthA(1)).to.equal(1);
      expect(await boss.globalQueueLengthB(1)).to.equal(1);
    });

    it("is idempotent and does not double-count on re-send", async function () {
      const { x, boss } = await seeded();
      await boss.backfillLegacyGlobal([{ account: x.address, level: 1 }]);
      await boss.backfillLegacyGlobal([{ account: x.address, level: 2 }]);
      expect(await boss.legacyGlobalLevel(x.address)).to.equal(2);
      expect(await boss.legacyGlobalCount(), "count tracks accounts, not writes").to.equal(1);
    });

    it("rejects non-members, bad levels and non-owners, and closes on finalize", async function () {
      const { x, y, boss } = await seeded();
      const [, , , , stranger] = await ethers.getSigners();
      await expect(boss.backfillLegacyGlobal([{ account: stranger.address, level: 1 }]))
        .to.be.revertedWithCustomError(boss, "NotJoined");
      await expect(boss.backfillLegacyGlobal([{ account: x.address, level: 0 }]))
        .to.be.revertedWithCustomError(boss, "InvalidSlot");
      await expect(boss.backfillLegacyGlobal([{ account: x.address, level: 7 }]))
        .to.be.revertedWithCustomError(boss, "InvalidSlot");
      await expect(boss.connect(y).backfillLegacyGlobal([{ account: x.address, level: 1 }])).to.be.reverted;
      await boss.backfillLegacyGlobal([{ account: x.address, level: 1 }]);
      await boss.finalizeLegacyGlobal();
      await expect(boss.backfillLegacyGlobal([{ account: y.address, level: 1 }]))
        .to.be.revertedWithCustomError(boss, "MigrationClosed");
    });
  });

  describe("upgrade savings (imported members above slot 1)", function () {
    async function importedAt(level: number) {
      const sg = await ethers.getSigners();
      const [bootstrap, treasury, x] = sg;
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, bootstrap.address, bootstrap.address
      ], { kind: "uups" });
      await boss.migrateMembers([
        { account: x.address, sponsor: bootstrap.address, level, amount: await boss.slotPrice(level) }
      ]);
      await boss.finalizeMigration();
      const fill = async (who: any, count: number, from = 3) => {
        for (let i = 0; i < count; i++) {
          const d = sg[from + i];
          await token.connect(d).mint(d.address, 30_000_000n);
          await token.connect(d).approve(await boss.getAddress(), 30_000_000n);
          await boss.connect(d).join(who.address);
        }
      };
      return { bootstrap, treasury, x, token, boss, fill, sg };
    }

    it("banks the shortfall instead of paying it out as income", async function () {
      const { x, token, boss, fill } = await importedAt(2);
      await fill(x, 3);
      const ev: any = (await boss.queryFilter(boss.filters.CycleCompleted()))
        .filter((e: any) => e.args.member === x.address)[0];
      expect(ev.args.slot).to.equal(1);
      expect(ev.args.gross).to.equal(90_000_000n);
      expect(ev.args.upgradeReserved, "two thirds reserved").to.equal(60_000_000n);
      expect(ev.args.credited, "advance already paid the slot rate").to.equal(0n);
      expect(await token.balanceOf(x.address),
             "the slot-rate advance was transferred immediately").to.equal(30_000_000n);
      expect((await boss.members(x.address)).withdrawable).to.equal(0n);
      expect(await boss.upgradeSavings(x.address), "60 banked toward slot 3").to.equal(60_000_000n);
      expect((await boss.members(x.address)).highestSlot).to.equal(2);
    });

    it("leaves the ordinary path's totals unchanged, only the timing", async function () {
      const { x, token, boss, fill } = await importedAt(1);
      await fill(x, 3);
      const ev: any = (await boss.queryFilter(boss.filters.CycleCompleted()))
        .filter((e: any) => e.args.member === x.address)[0];
      expect(ev.args.upgradeReserved).to.equal(60_000_000n);
      expect(ev.args.credited, "settled by the advance").to.equal(0n);
      expect(await token.balanceOf(x.address),
             "same 30 total as before the advance existed").to.equal(30_000_000n);
      expect((await boss.members(x.address)).withdrawable).to.equal(0n);
      expect((await boss.members(x.address)).highestSlot, "upgraded as before").to.equal(2);
      expect(await boss.upgradeSavings(x.address), "nothing banked on the normal path").to.equal(0n);
    });

    it("never pays out more than the cycle brought in", async function () {
      const { x, treasury, boss, fill, token } = await importedAt(2);
      await fill(x, 3);
      const paid = await token.balanceOf(x.address) + await token.balanceOf(treasury.address);
      const reserved = await boss.upgradeSavings(x.address);
      expect(paid + reserved, "paid + savings == gross").to.equal(90_000_000n);
      expect(await token.balanceOf(await boss.getAddress()), "only reserved funds remain").to.equal(reserved);
    });
  });

  it("requires a joined sponsor and prevents duplicate membership", async function () {
    const { bootstrap, a, b, boss } = await fixture();
    await expect(boss.connect(a).join(b.address)).to.be.revertedWithCustomError(boss, "SponsorNotJoined");
    await boss.connect(a).join(bootstrap.address);
    await expect(boss.connect(a).join(bootstrap.address)).to.be.revertedWithCustomError(boss, "AlreadyJoined");
  });

  it("completes a 3-payment cycle and pays the recipient immediately", async function () {
    const { bootstrap, a, b, c, token, boss } = await fixture();
    for (const user of [a, b, c]) await boss.connect(user).join(bootstrap.address);

    const root = await boss.members(bootstrap.address);
    expect(root.withdrawable).to.equal(0n);
    expect(await token.balanceOf(bootstrap.address)).to.equal(90_000_000n);
    expect(await token.balanceOf(await boss.getAddress())).to.equal(0n);
    await expect(boss.connect(bootstrap).withdraw()).to.be.revertedWithCustomError(boss, "NothingToWithdraw");
  });

  it("activates slot two automatically after a normal member fills slot one", async function () {
    const { bootstrap, a, b, c, d, e, f, boss } = await fixture();
    await boss.connect(a).join(bootstrap.address);
    await boss.connect(b).join(bootstrap.address);
    await boss.connect(c).join(bootstrap.address);
    await boss.connect(d).join(a.address);
    await boss.connect(e).join(a.address);
    await boss.connect(f).join(a.address);

    const member = await boss.members(a.address);
    expect(member.highestSlot).to.equal(2);
    expect(member.withdrawable).to.equal(0n);
    expect(await (await ethers.getContractAt("MockUSDT", await boss.paymentToken())).balanceOf(a.address)).to.equal(30_000_000n);
    expect(await boss.queueLength(2)).to.equal(2n);
  });

  it("exposes the PDF's level-six figures", async function () {
    const { boss } = await fixture();
    const figures = await boss.globalPoolFigures(6);
    expect(figures.entry).to.equal(155_520_000_000n);
    expect(figures.fivePayments).to.equal(1_555_200_000_000n);
    expect(figures.statedTotal).to.equal(1_679_600_000_000n);
  });

  it("reproduces the PDF's level-six total as lifetime cumulative income across all six levels", async function () {
    const { boss } = await fixture();
    // Each level distributes gross(10x entry) minus the next level's entry;
    // level 6 has no next level, so it distributes its whole gross.
    let cumulative = 0n;
    for (let level = 1; level <= 6; level++) {
      const entry: bigint = await boss.globalPoolEntry(level);
      const reserved = level < 6 ? await boss.globalPoolEntry(level + 1) : 0n;
      cumulative += 10n * entry - reserved;
    }
    const stated = (await boss.globalPoolFigures(6)).statedTotal;
    expect(cumulative).to.equal(stated);
    expect(cumulative).to.equal(1_679_600_000_000n);
  });

  describe("Global Pool", function () {
    it("preserves income already paid to the wallet when joining the matrix", async function () {
      const { bootstrap, treasury, users, token, boss } = await globalPoolFixture();
      for (const user of users) await boss.connect(user).joinGlobalPool(bootstrap.address);
      const before = await token.balanceOf(treasury.address);
      expect(before).to.be.greaterThan(0n);
      await token.mint(treasury.address, 30_000_000n);
      await token.connect(treasury).approve(await boss.getAddress(), 30_000_000n);
      await boss.connect(treasury).join(bootstrap.address);
      expect(await token.balanceOf(treasury.address)).to.equal(before);
      expect((await boss.members(treasury.address)).withdrawable).to.equal(0n);
    });
    it("reports the PDF's per-level entry prices, each 6x the previous", async function () {
      const { boss } = await globalPoolFixture();
      const expected = [20_000_000n, 120_000_000n, 720_000_000n, 4_320_000_000n, 25_920_000_000n, 155_520_000_000n];
      for (let level = 1; level <= 6; level++) {
        expect(await boss.globalPoolEntry(level)).to.equal(expected[level - 1]);
      }
    });

    it("requires a joined Global Pool sponsor and prevents duplicate membership", async function () {
      const { bootstrap, users, boss } = await globalPoolFixture();
      const [a, b] = users;
      await expect(boss.connect(a).joinGlobalPool(b.address)).to.be.revertedWithCustomError(boss, "SponsorNotJoined");
      await boss.connect(a).joinGlobalPool(bootstrap.address);
      await expect(boss.connect(a).joinGlobalPool(bootstrap.address)).to.be.revertedWithCustomError(boss, "AlreadyJoined");
    });

    it("completes level-1 cycles with gross=10x entry, split into a 6x-entry next-level reserve and a fee-adjusted 4x-entry credit", async function () {
      const { bootstrap, treasury, users, token, boss } = await globalPoolFixture();
      const entry1 = await boss.globalPoolEntry(1);

      for (const user of users) {
        await boss.connect(user).joinGlobalPool(bootstrap.address);
      }

      const events = await boss.queryFilter(boss.filters.GlobalCycleCompleted(undefined, 1));
      expect(events.length).to.be.greaterThan(0);

      for (const evt of events) {
        const gross = BigInt(evt.args.gross);
        const nextLevelReserved = BigInt(evt.args.nextLevelReserved);
        const adminFee = BigInt(evt.args.adminFee);
        const credited = BigInt(evt.args.credited);
        expect(gross).to.equal(10n * entry1);
        expect(nextLevelReserved === 0n || nextLevelReserved === 6n * entry1).to.equal(true);
        const distributable = gross - nextLevelReserved;
        expect(adminFee).to.equal(distributable / 10n);
        expect(credited).to.equal(distributable - adminFee);
      }

      // Token accounting stays solvent: immediate payouts plus the retained
      // next-level reserve equal the amount paid in.
      const totalPaidIn = entry1 * BigInt(users.length);
      let totalPaidOut = 0n;
      for (const evt of events) totalPaidOut += evt.args.credited + evt.args.adminFee;
      expect(await token.balanceOf(await boss.getAddress())).to.equal(totalPaidIn - totalPaidOut);
      expect(await token.balanceOf(treasury.address)).to.be.greaterThan(0n);
      expect((await boss.members(treasury.address)).withdrawable).to.equal(0n);
    });

    it("transfers a Global Pool payout directly to the recipient wallet", async function () {
      const { bootstrap, users, token, boss } = await globalPoolFixture();
      for (const user of users) {
        await boss.connect(user).joinGlobalPool(bootstrap.address);
      }

      const events = await boss.queryFilter(boss.filters.GlobalCycleCompleted(undefined, 1));
      const paid = events.find((e: any) => e.args.credited > 0n);
      expect(paid, "expected at least one credited cycle").to.not.be.undefined;

      const recipient = paid!.args.member;
      expect(await token.balanceOf(recipient)).to.equal(paid!.args.credited);
      expect((await boss.members(recipient)).withdrawable).to.equal(0n);
    });
  });

  describe("sponsor placement", function () {
    it("places a new member directly under its sponsor", async function () {
      const { bootstrap, a, b, c, boss } = await fixture();
      await boss.connect(a).join(bootstrap.address);
      await boss.connect(b).join(a.address);
      await boss.connect(c).join(a.address);
      expect(await boss.matrixParent(1, b.address)).to.equal(a.address);
      expect(await boss.matrixParent(1, c.address)).to.equal(a.address);
      expect(await boss.matrixChildren(1, a.address)).to.deep.equal([b.address, c.address]);
      expect(await boss.childrenFilled(1, bootstrap.address)).to.equal(1);
    });

    it("pays the sponsor when its own directs fill its three positions", async function () {
      const { bootstrap, a, b, c, d, boss } = await fixture();
      await boss.connect(a).join(bootstrap.address);
      for (const user of [b, c, d]) await boss.connect(user).join(a.address);

      const member = await boss.members(a.address);
      expect(member.withdrawable).to.equal(0n);
      expect(await boss.matrixIncome(a.address)).to.equal(30_000_000n);
      expect(await (await ethers.getContractAt("MockUSDT", await boss.paymentToken())).balanceOf(a.address)).to.equal(30_000_000n);
      // The slot-2 upgrade goes under the nearest sponsor-chain member holding slot 2.
      expect(member.highestSlot).to.equal(2);
      expect(await boss.matrixParent(2, a.address)).to.equal(bootstrap.address);
    });

    it("fills the sponsor's three positions with directs 1-3, then pays commission with no spillover", async function () {
      const { bootstrap, token, boss } = await fixture();
      const signers = (await ethers.getSigners()).slice(8, 14);
      for (const user of signers) {
        await token.mint(user.address, 30_000_000n);
        await token.connect(user).approve(await boss.getAddress(), 30_000_000n);
      }
      const [a, b, c, d, e, f] = signers;
      await boss.connect(a).join(bootstrap.address);
      await boss.connect(b).join(a.address);
      await boss.connect(c).join(a.address);
      await boss.connect(d).join(a.address);
      await boss.connect(e).join(a.address);
      await boss.connect(f).join(a.address);
      // Directs 1-3 take a's three matrix positions. From the 4th the joining
      // fee is paid to a as direct commission instead, so those members take
      // no matrix position at all and nothing spills into a's downline.
      expect(await boss.matrixParent(1, b.address)).to.equal(a.address);
      expect(await boss.matrixParent(1, c.address)).to.equal(a.address);
      expect(await boss.matrixParent(1, d.address)).to.equal(a.address);
      expect(await boss.matrixParent(1, e.address), "4th direct: commission, unplaced").to.equal(ethers.ZeroAddress);
      expect(await boss.matrixParent(1, f.address), "5th direct: commission, unplaced").to.equal(ethers.ZeroAddress);
      expect((await boss.members(a.address)).directCount).to.equal(5);
      expect(await boss.childrenFilled(1, b.address), "b's position stays empty - no spillover").to.equal(0);
    });

    it("places directs of a migrated sponsor under that sponsor", async function () {
      const [owner, treasury, a, b] = await ethers.getSigners();
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, owner.address, owner.address
      ], { kind: "uups" });
      await boss.migrateMembers([{ account: a.address, sponsor: owner.address, level: 1, amount: 30_000_000n }]);
      await boss.finalizeMigration();
      await token.mint(b.address, 30_000_000n);
      await token.connect(b).approve(await boss.getAddress(), 30_000_000n);
      await boss.connect(b).join(a.address);
      expect(await boss.matrixParent(1, b.address)).to.equal(a.address);
    });

    it("counts Global Pool credits separately from matrix income", async function () {
      const { bootstrap, users, boss } = await globalPoolFixture();
      for (const user of users) await boss.connect(user).joinGlobalPool(bootstrap.address);
      const events = await boss.queryFilter(boss.filters.GlobalCycleCompleted());
      const paid = events.find((e: any) => e.args.credited > 0n)!;
      expect(await boss.globalIncome(paid.args.member)).to.be.greaterThan(0n);
      expect(await boss.matrixIncome(paid.args.member)).to.equal(0n);
    });
  });

  describe("registration migration and upgrades", function () {
    async function migrationFixture() {
      const [owner, treasury, a, b, outsider] = await ethers.getSigners();
      const token: any = await ethers.deployContract("MockUSDT");
      const Boss = await ethers.getContractFactory("UsdtBossEducational");
      const boss: any = await upgrades.deployProxy(Boss, [
        await token.getAddress(), treasury.address, owner.address, owner.address
      ], { kind: "uups" });
      return { owner, treasury, a, b, outsider, token, boss };
    }

    it("imports sponsor-first registration state without creating a balance", async function () {
      const { owner, a, b, boss } = await migrationFixture();
      await boss.migrateMembers([
        { account: a.address, sponsor: owner.address, level: 2, amount: 60_000_000n },
        { account: b.address, sponsor: a.address, level: 1, amount: 30_000_000n }
      ]);

      const aMember = await boss.members(a.address);
      expect(aMember.joined).to.equal(true);
      expect(aMember.sponsor).to.equal(owner.address);
      expect(aMember.highestSlot).to.equal(2);
      expect(aMember.withdrawable).to.equal(0);
      expect(await boss.activatedAmount(a.address)).to.equal(60_000_000n);
      expect(await boss.wasMigrated(a.address)).to.equal(true);
      expect((await boss.members(a.address)).directCount).to.equal(1);
      expect(await boss.queueLength(1)).to.equal(3);
      expect(await boss.queueLength(2)).to.equal(2);
    });

    it("blocks live joins until migration is permanently finalized", async function () {
      const { owner, a, token, boss } = await migrationFixture();
      await token.mint(a.address, 30_000_000n);
      await token.connect(a).approve(await boss.getAddress(), 30_000_000n);
      await expect(boss.connect(a).join(owner.address)).to.be.revertedWithCustomError(boss, "MigrationStillOpen");
      await boss.finalizeMigration();
      await boss.connect(a).join(owner.address);
      await expect(boss.migrateMembers([])).to.be.revertedWithCustomError(boss, "MigrationClosed");
    });

    it("rejects invalid amounts, unresolved sponsors, and unauthorized imports", async function () {
      const { owner, a, b, outsider, boss } = await migrationFixture();
      const valid = [{ account: a.address, sponsor: owner.address, level: 1, amount: 30_000_000n }];
      await expect(boss.connect(outsider).migrateMembers(valid)).to.be.revertedWithCustomError(boss, "OwnableUnauthorizedAccount");
      await expect(boss.migrateMembers([{ ...valid[0], amount: 60_000_000n }])).to.be.revertedWithCustomError(boss, "InvalidMigrationAmount");
      await expect(boss.migrateMembers([{ account: a.address, sponsor: b.address, level: 1, amount: 30_000_000n }]))
        .to.be.revertedWithCustomError(boss, "SponsorNotJoined");
    });

    it("allows only the owner to authorize a UUPS implementation upgrade", async function () {
      const { outsider, boss } = await migrationFixture();
      const V2 = await ethers.getContractFactory("UsdtBossEducationalV2");
      await expect(upgrades.upgradeProxy(await boss.getAddress(), V2.connect(outsider), { kind: "uups" }))
        .to.be.revertedWithCustomError(boss, "OwnableUnauthorizedAccount");
      const upgraded: any = await upgrades.upgradeProxy(await boss.getAddress(), V2, { kind: "uups" });
      expect(await upgraded.version()).to.equal(2);
    });

    it("upgrades safely to V3 and stores display-only legacy IDs and Global income", async function () {
      const { bootstrap, a, b, boss } = await fixture();
      await boss.connect(a).join(bootstrap.address);
      await boss.connect(b).join(bootstrap.address);
      const V3 = await ethers.getContractFactory("UsdtBossEducationalV3");
      const upgraded: any = await upgrades.upgradeProxy(await boss.getAddress(), V3, { kind: "uups" });

      const beforeA = await upgraded.members(a.address);
      await upgraded.backfillLegacyIdentities([
        { account: bootstrap.address, userId: 120826 },
        { account: a.address, userId: 712674 }
      ]);
      await upgraded.backfillLegacyGlobalIncome([
        { account: bootstrap.address, amount: 72_000_000n },
        { account: a.address, amount: 72_000_000n }
      ]);

      expect(await upgraded.version()).to.equal(3);
      expect(await upgraded.legacyUserId(a.address)).to.equal(712674);
      expect(await upgraded.legacyIdAccount(712674)).to.equal(a.address);
      expect(await upgraded.legacyIdentityCount()).to.equal(2);
      expect(await upgraded.legacyGlobalIncome(a.address)).to.equal(72_000_000n);
      expect(await upgraded.legacyGlobalIncomeTotal()).to.equal(144_000_000n);
      expect((await upgraded.members(a.address)).withdrawable).to.equal(beforeA.withdrawable);
      expect(await upgraded.globalIncome(a.address)).to.equal(0);

      await upgraded.backfillLegacyGlobalIncome([{ account: a.address, amount: 80_000_000n }]);
      expect(await upgraded.legacyGlobalIncomeTotal()).to.equal(152_000_000n);

      await expect(upgraded.backfillLegacyIdentities([{ account: b.address, userId: 712674 }]))
        .to.be.revertedWithCustomError(upgraded, "LegacyUserIdAlreadyAssigned");

      await upgraded.finalizeLegacyIdentities();
      await upgraded.finalizeLegacyGlobalIncome();
      await expect(upgraded.backfillLegacyGlobalIncome([{ account: b.address, amount: 1 }]))
        .to.be.revertedWithCustomError(upgraded, "MigrationClosed");
    });

    it("upgrades safely from V3 to the V4 immediate-payout implementation", async function () {
      const { owner, a, boss } = await migrationFixture();
      await boss.migrateMembers([
        { account: a.address, sponsor: owner.address, level: 1, amount: 30_000_000n }
      ]);

      const V3 = await ethers.getContractFactory("UsdtBossEducationalV3");
      const v3: any = await upgrades.upgradeProxy(await boss.getAddress(), V3, { kind: "uups" });
      await v3.backfillLegacyIdentities([{ account: a.address, userId: 712674 }]);

      const V4 = await ethers.getContractFactory("UsdtBossEducationalV4");
      const v4: any = await upgrades.upgradeProxy(await boss.getAddress(), V4, { kind: "uups" });
      expect(await v4.version()).to.equal(4);
      expect(await v4.legacyUserId(a.address)).to.equal(712674);
      expect((await v4.members(a.address)).joined).to.equal(true);
    });

    it("upgrades safely from V4 to V5 and stores both display-only growth trees", async function () {
      const { owner, a, b, outsider, boss } = await migrationFixture();
      await boss.migrateMembers([
        { account: a.address, sponsor: owner.address, level: 1, amount: 30_000_000n },
        { account: b.address, sponsor: a.address, level: 1, amount: 30_000_000n }
      ]);
      await boss.finalizeMigration();

      const V4 = await ethers.getContractFactory("UsdtBossEducationalV4");
      const v4: any = await upgrades.upgradeProxy(await boss.getAddress(), V4, { kind: "uups" });
      const V5 = await ethers.getContractFactory("UsdtBossEducationalV5");
      const v5: any = await upgrades.upgradeProxy(await v4.getAddress(), V5, { kind: "uups" });

      await v5.backfillLegacyGrowth([
        { tree: 1, sourceId: 1, account: owner.address, parent: ethers.ZeroAddress,
          generationId: 1, position: 1, level: 1, position1Income: 20_000_000n, position2Income: 20_000_000n },
        { tree: 1, sourceId: 2, account: a.address, parent: owner.address,
          generationId: 1, position: 1, level: 2, position1Income: 20_000_000n, position2Income: 20_000_000n },
        { tree: 2, sourceId: 2, account: b.address, parent: a.address,
          generationId: 1, position: 3, level: 2, position1Income: 0, position2Income: 0 }
      ]);

      expect(await v5.version()).to.equal(5);
      expect(await v5.legacyGrowthCount(1)).to.equal(2);
      expect(await v5.legacyGrowthCount(2)).to.equal(1);
      const stored = await v5.legacyGrowth(1, a.address);
      expect(stored.parent).to.equal(owner.address);
      expect(stored.level).to.equal(2);
      expect(stored.position1Income).to.equal(20_000_000n);
      expect(await v5.legacyGrowthChildrenLength(1, owner.address)).to.equal(1);
      expect(await v5.legacyGrowthChild(1, owner.address, 0)).to.equal(a.address);
      expect((await v5.members(a.address)).joined).to.equal(true);

      await expect(v5.backfillLegacyGrowth([{
        tree: 1, sourceId: 3, account: outsider.address, parent: owner.address,
        generationId: 1, position: 1, level: 2, position1Income: 0, position2Income: 0
      }])).to.be.revertedWithCustomError(v5, "NotJoined");
      await expect(v5.backfillLegacyGrowth([{
        tree: 1, sourceId: 3, account: b.address, parent: a.address,
        generationId: 1, position: 3, level: 2, position1Income: 0, position2Income: 0
      }])).to.be.revertedWithCustomError(v5, "InvalidGrowthPosition");

      await v5.finalizeLegacyGrowth(1);
      await expect(v5.backfillLegacyGrowth([{
        tree: 1, sourceId: 3, account: b.address, parent: a.address,
        generationId: 1, position: 1, level: 2, position1Income: 0, position2Income: 0
      }])).to.be.revertedWithCustomError(v5, "MigrationClosed");
    });

    it("upgrades safely from V5 to V6 and lets only the owner withdraw pool funds", async function () {
      const { owner, outsider, token, boss } = await migrationFixture();
      const proxy = await boss.getAddress();

      const V5 = await ethers.getContractFactory("UsdtBossEducationalV5");
      const v5: any = await upgrades.upgradeProxy(proxy, V5, { kind: "uups" });
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.upgradeProxy(await v5.getAddress(), V6, { kind: "uups" });

      await token.mint(proxy, 50_000_000n);
      expect(await v6.version()).to.equal(6);
      expect(await v6.poolBalance()).to.equal(50_000_000n);

      await expect(v6.connect(outsider).withdrawPoolFunds(outsider.address, 1n))
        .to.be.revertedWithCustomError(v6, "OwnableUnauthorizedAccount");
      await expect(v6.withdrawPoolFunds(ethers.ZeroAddress, 1n))
        .to.be.revertedWithCustomError(v6, "ZeroAddress");
      await expect(v6.withdrawPoolFunds(owner.address, 0n))
        .to.be.revertedWithCustomError(v6, "ZeroWithdrawalAmount");
      await expect(v6.withdrawPoolFunds(owner.address, 50_000_001n))
        .to.be.revertedWithCustomError(v6, "InsufficientPoolBalance")
        .withArgs(50_000_000n, 50_000_001n);

      await expect(v6.withdrawPoolFunds(owner.address, 20_000_000n))
        .to.emit(v6, "PoolFundsWithdrawn")
        .withArgs(owner.address, owner.address, 20_000_000n);
      expect(await token.balanceOf(owner.address)).to.equal(20_000_000n);
      expect(await v6.poolBalance()).to.equal(30_000_000n);
    });

    it("upgrades safely to V7 and applies only the approved state-only Slot 3 correction", async function () {
      const { owner, outsider, token, boss } = await migrationFixture();
      const proxy = await boss.getAddress();
      const correctionAccount = "0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18";

      await boss.migrateMembers([{
        account: correctionAccount,
        sponsor: owner.address,
        level: 2,
        amount: 60_000_000n
      }]);

      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.upgradeProxy(proxy, V6, { kind: "uups" });
      const V7 = await ethers.getContractFactory("UsdtBossEducationalV7");
      const v7: any = await upgrades.upgradeProxy(proxy, V7, { kind: "uups" });

      const poolBefore = await token.balanceOf(proxy);
      const ownerBefore = await token.balanceOf(owner.address);
      expect(await v7.version()).to.equal(7);
      expect(await v7.SLOT_3_CORRECTION_ACCOUNT()).to.equal(correctionAccount);
      expect(await v7.queueLength(3)).to.equal(1);

      await expect(v7.connect(outsider).correctMigratedMemberToSlot3())
        .to.be.revertedWithCustomError(v7, "OwnableUnauthorizedAccount");
      await expect(v7.correctMigratedMemberToSlot3())
        .to.emit(v7, "MigratedMemberSlotCorrected")
        .withArgs(correctionAccount, 2, 3, 120_000_000n);

      expect((await v7.members(correctionAccount)).highestSlot).to.equal(3);
      expect(await v7.activatedAmount(correctionAccount)).to.equal(120_000_000n);
      expect(await v7.queueLength(3)).to.equal(2);
      expect(await v7.queueAccount(3, 1)).to.equal(correctionAccount);
      expect(await v7.matrixParent(3, correctionAccount)).to.equal(ethers.ZeroAddress);
      expect(await v7.childrenFilled(3, correctionAccount)).to.equal(0);
      expect(await v7.cycleGross(3, correctionAccount)).to.equal(0);
      expect(await v7.upgradeSavings(correctionAccount)).to.equal(0);
      expect(await token.balanceOf(proxy)).to.equal(poolBefore);
      expect(await token.balanceOf(owner.address)).to.equal(ownerBefore);

      await expect(v7.correctMigratedMemberToSlot3())
        .to.be.revertedWithCustomError(v7, "SlotCorrectionUnavailable");
    });

    it("upgrades safely to V8 and migrates only the six approved Global Pool members", async function () {
      const { owner, outsider, token, boss } = await migrationFixture();
      const proxy = await boss.getAddress();
      const sponsor = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
      const accounts = [
        "0xB59717583D6401dB907E76A09026c6e586Af838c",
        "0xaee81e154c995De728f4Eece7e8175aF6537A9A8",
        "0x95b2015747AFBFAEC90A7a9A19B1729d94F0CDb6",
        "0x693Ec52a03A0068204A819856028251759b5cFB1",
        "0x49c9cFe47Cbc37388D772e7B155031D2dF21c228"
      ];

      await boss.migrateMembers([
        { account: sponsor, sponsor: owner.address, level: 2, amount: 60_000_000n },
        ...accounts.map(account => ({ account, sponsor, level: 1, amount: 30_000_000n }))
      ]);
      await boss.finalizeMigration();

      const V7 = await ethers.getContractFactory("UsdtBossEducationalV7");
      await upgrades.upgradeProxy(proxy, V7, { kind: "uups" });
      const V8 = await ethers.getContractFactory("UsdtBossEducationalV8");
      const v8: any = await upgrades.upgradeProxy(proxy, V8, { kind: "uups" });

      const proxyBalanceBefore = await token.balanceOf(proxy);
      const ownerBalanceBefore = await token.balanceOf(owner.address);
      expect(await v8.version()).to.equal(8);
      expect(await v8.globalQueueLengthA(1)).to.equal(1);
      await expect(v8.connect(outsider).migrateApprovedGlobalPoolMembers())
        .to.be.revertedWithCustomError(v8, "OwnableUnauthorizedAccount");

      await expect(v8.migrateApprovedGlobalPoolMembers())
        .to.emit(v8, "GlobalPoolMemberMigrated")
        .withArgs(sponsor, owner.address, 1);

      expect(await v8.globalQueueLengthA(1)).to.equal(7);
      const migrated = [sponsor, ...accounts];
      for (let index = 0; index < migrated.length; index += 1) {
        const account = migrated[index];
        const globalMember = await v8.globalMembers(account);
        expect(globalMember.joined).to.equal(true);
        expect(globalMember.highestLevel).to.equal(1);
        expect(await v8.globalQueueAccountA(1, index + 1)).to.equal(account);
        expect(await v8.gpFilledA(1, account)).to.equal(0);
        expect(await v8.gpFilledB(1, account)).to.equal(0);
        expect(await v8.globalIncome(account)).to.equal(0);
        expect((await v8.members(account)).highestSlot).to.equal(account === sponsor ? 2 : 1);
        expect(await v8.activatedAmount(account)).to.equal(account === sponsor ? 60_000_000n : 30_000_000n);
      }
      expect(await token.balanceOf(proxy)).to.equal(proxyBalanceBefore);
      expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore);

      await expect(v8.migrateApprovedGlobalPoolMembers())
        .to.be.revertedWithCustomError(v8, "GlobalPoolMigrationUnavailable")
        .withArgs(sponsor);
    });

    it("upgrades safely to V9 and registers only the five approved Matrix members without payment", async function () {
      const { owner, outsider, token, boss } = await migrationFixture();
      const proxy = await boss.getAddress();
      const sponsor = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
      const accounts = [
        "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
        "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
        "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
        "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
        "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4"
      ];

      await boss.migrateMembers([{
        account: sponsor, sponsor: owner.address, level: 2, amount: 60_000_000n
      }]);
      await boss.finalizeMigration();

      const V8 = await ethers.getContractFactory("UsdtBossEducationalV8");
      const v8: any = await upgrades.upgradeProxy(proxy, V8, { kind: "uups" });
      const queueBefore = await v8.queueLength(1);
      const sponsorBefore = await v8.members(sponsor);
      const proxyBalanceBefore = await token.balanceOf(proxy);
      const ownerBalanceBefore = await token.balanceOf(owner.address);

      const V9 = await ethers.getContractFactory("UsdtBossEducationalV9");
      const v9: any = await upgrades.upgradeProxy(proxy, V9, { kind: "uups" });
      expect(await v9.version()).to.equal(9);
      await expect(v9.connect(outsider).registerApprovedMatrixMembers())
        .to.be.revertedWithCustomError(v9, "OwnableUnauthorizedAccount");

      await expect(v9.registerApprovedMatrixMembers())
        .to.emit(v9, "ApprovedMatrixMemberRegistered")
        .withArgs(accounts[0], sponsor, 1, 30_000_000n);

      expect(await v9.queueLength(1)).to.equal(queueBefore + 5n);
      expect((await v9.members(sponsor)).directCount).to.equal(sponsorBefore.directCount + 5n);
      for (let index = 0; index < accounts.length; index += 1) {
        const account = accounts[index];
        const member = await v9.members(account);
        expect(member.joined).to.equal(true);
        expect(member.sponsor).to.equal(sponsor);
        expect(member.highestSlot).to.equal(1);
        expect(member.withdrawable).to.equal(0);
        expect(await v9.activatedAmount(account)).to.equal(30_000_000n);
        expect(await v9.queueAccount(1, queueBefore + BigInt(index))).to.equal(account);
        expect(await v9.matrixParent(1, account)).to.equal(ethers.ZeroAddress);
        expect(await v9.childrenFilled(1, account)).to.equal(0);
        expect(await v9.cycleGross(1, account)).to.equal(0);
        expect(await v9.matrixIncome(account)).to.equal(0);
        expect(await v9.wasMigrated(account)).to.equal(false);
      }
      expect(await token.balanceOf(proxy)).to.equal(proxyBalanceBefore);
      expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore);

      await expect(v9.registerApprovedMatrixMembers())
        .to.be.revertedWithCustomError(v9, "ApprovedMatrixRegistrationUnavailable")
        .withArgs(accounts[0]);
    });

    it("upgrades safely to V10 and atomically replaces the approved migrated wallet", async function () {
      const [owner, treasury, outsider] = await ethers.getSigners();
      const source = "0x8451866ccC54ABc2f49D1e2bb2041C46035FE8f6";
      const replacement = "0xaF9168210B45EB0F660dEF7D08cA0BA7E2272BEf";
      const sponsor = "0xe2054Ed8e010618501838d6116BfdCDC4955CfdA";
      const directs = [
        "0x24D9DBa9ab961d258545F01650D02f71549032a8",
        "0x666fD2C19Dd6F0de63e75Cd17aA5310e2AC299b0",
        "0x7B88734fe780bF583eFD60D662de1D67cad4d373",
        "0x3F3a42dc8288B5a80aAaF1e1386993074be79522",
      ];
      const growthChildren = [directs[0], directs[1]];
      const token: any = await ethers.deployContract("MockUSDT18");
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.deployProxy(V6, [
        await token.getAddress(), treasury.address, owner.address, owner.address,
      ], { kind: "uups" });
      const proxy = await v6.getAddress();
      const price1 = await v6.slotPrice(1);
      const price2 = await v6.slotPrice(2);

      await v6.migrateMembers([
        { account: sponsor, sponsor: owner.address, level: 1, amount: price1 },
        { account: source, sponsor, level: 2, amount: price2 },
        ...directs.map(account => ({ account, sponsor: source, level: 1, amount: price1 })),
      ]);
      await v6.backfillLegacyIdentities([{ account: source, userId: 139875 }]);
      await v6.backfillLegacyIncome([{ account: source, amount: ethers.parseUnits("57", 18) }]);
      await v6.backfillLegacyGlobal([{ account: source, level: 1 }]);
      await v6.backfillLegacyGrowth([
        { tree: 1, sourceId: 21, account: source, parent: owner.address,
          generationId: 10, position: 1, level: 2, position1Income: 20_000_000n, position2Income: 20_000_000n },
        { tree: 1, sourceId: 42, account: growthChildren[0], parent: source,
          generationId: 21, position: 1, level: 3, position1Income: 0, position2Income: 0 },
        { tree: 1, sourceId: 43, account: growthChildren[1], parent: source,
          generationId: 21, position: 2, level: 3, position1Income: 0, position2Income: 0 },
        { tree: 2, sourceId: 21, account: source, parent: owner.address,
          generationId: 4, position: 1, level: 2, position1Income: 0, position2Income: 0 },
      ]);
      await v6.finalizeMigration();

      const V9 = await ethers.getContractFactory("UsdtBossEducationalV9");
      await upgrades.upgradeProxy(proxy, V9, { kind: "uups" });
      const V10 = await ethers.getContractFactory("UsdtBossEducationalV10");
      await upgrades.validateUpgrade(proxy, V10, { kind: "uups" });
      const v10: any = await upgrades.upgradeProxy(proxy, V10, { kind: "uups" });

      const balancesBefore = await Promise.all([
        token.balanceOf(proxy), token.balanceOf(source), token.balanceOf(replacement), token.balanceOf(owner.address),
      ]);
      await expect(v10.connect(outsider).migrateApprovedAccountAddress())
        .to.be.revertedWithCustomError(v10, "OwnableUnauthorizedAccount");
      await expect(v10.migrateApprovedAccountAddress())
        .to.emit(v10, "AccountAddressMigrated")
        .withArgs(source, replacement, 139875);

      expect(await v10.version()).to.equal(10);
      const moved = await v10.members(replacement);
      expect(moved.joined).to.equal(true);
      expect(moved.sponsor).to.equal(sponsor);
      expect(moved.directCount).to.equal(4);
      expect(moved.highestSlot).to.equal(2);
      expect((await v10.members(source)).joined).to.equal(false);
      expect(await v10.activatedAmount(replacement)).to.equal(price2);
      expect(await v10.wasMigrated(replacement)).to.equal(true);
      expect(await v10.legacyUserId(replacement)).to.equal(139875);
      expect(await v10.legacyIdAccount(139875)).to.equal(replacement);
      expect(await v10.legacyIncome(replacement)).to.equal(ethers.parseUnits("57", 18));
      expect(await v10.legacyGlobalLevel(replacement)).to.equal(1);
      expect(await v10.legacyUserId(source)).to.equal(0);
      expect(await v10.legacyIncome(source)).to.equal(0);

      for (const direct of directs) expect((await v10.members(direct)).sponsor).to.equal(replacement);
      const queue1 = await Promise.all(Array.from({ length: Number(await v10.queueLength(1)) }, (_, index) => v10.queueAccount(1, index)));
      const queue2 = await Promise.all(Array.from({ length: Number(await v10.queueLength(2)) }, (_, index) => v10.queueAccount(2, index)));
      expect(queue1).to.include(replacement).and.not.include(source);
      expect(queue2).to.include(replacement).and.not.include(source);

      expect((await v10.legacyGrowth(1, replacement)).imported).to.equal(true);
      expect((await v10.legacyGrowth(2, replacement)).imported).to.equal(true);
      expect((await v10.legacyGrowth(1, growthChildren[0])).parent).to.equal(replacement);
      expect((await v10.legacyGrowth(1, growthChildren[1])).parent).to.equal(replacement);
      expect(await v10.legacyGrowthChild(1, replacement, 0)).to.equal(growthChildren[0]);
      expect(await v10.legacyGrowthChild(1, replacement, 1)).to.equal(growthChildren[1]);
      expect(await v10.legacyGrowthChild(1, owner.address, 0)).to.equal(replacement);
      expect(await v10.legacyGrowthChild(2, owner.address, 0)).to.equal(replacement);
      expect((await v10.legacyGrowth(1, source)).imported).to.equal(false);

      expect(await Promise.all([
        token.balanceOf(proxy), token.balanceOf(source), token.balanceOf(replacement), token.balanceOf(owner.address),
      ])).to.deep.equal(balancesBefore);
      await expect(v10.migrateApprovedAccountAddress())
        .to.be.revertedWithCustomError(v10, "AccountAddressMigrationUnavailable");
    });

    it("upgrades safely from V10 and activates the five V9 wallets in Global Pool without payment", async function () {
      const [owner, treasury, outsider] = await ethers.getSigners();
      const sponsor = "0xb71ef909500A60dddcE6A5dADCC096a27B1Cf759";
      const oldGlobalAccounts = [
        "0xB59717583D6401dB907E76A09026c6e586Af838c",
        "0xaee81e154c995De728f4Eece7e8175aF6537A9A8",
        "0x95b2015747AFBFAEC90A7a9A19B1729d94F0CDb6",
        "0x693Ec52a03A0068204A819856028251759b5cFB1",
        "0x49c9cFe47Cbc37388D772e7B155031D2dF21c228",
      ];
      const accounts = [
        "0x940F87CD3b50C280B5AE42E97c62950C5C658F6b",
        "0xaDFCd5780A96Ca8a9f543674A40753438E825965",
        "0x8E34bA6Fe622d53ca1994C211A4912D622F8DA1C",
        "0x9bC8259870b5c2c6a60d55Eb8E6bB4EF563107C6",
        "0x11AD0bC070fBEE83622a86a5780b3948bB7059F4",
      ];
      const token: any = await ethers.deployContract("MockUSDT");
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.deployProxy(V6, [
        await token.getAddress(), treasury.address, owner.address, owner.address,
      ], { kind: "uups" });
      const proxy = await v6.getAddress();
      await v6.migrateMembers([
        { account: sponsor, sponsor: owner.address, level: 2, amount: await v6.slotPrice(2) },
        ...oldGlobalAccounts.map(account => ({
          account, sponsor, level: 1, amount: 30_000_000n,
        })),
      ]);
      await v6.finalizeMigration();

      const V8 = await ethers.getContractFactory("UsdtBossEducationalV8");
      const v8: any = await upgrades.upgradeProxy(proxy, V8, { kind: "uups" });
      await v8.migrateApprovedGlobalPoolMembers();
      const V9 = await ethers.getContractFactory("UsdtBossEducationalV9");
      const v9: any = await upgrades.upgradeProxy(proxy, V9, { kind: "uups" });
      await v9.registerApprovedMatrixMembers();
      const V10 = await ethers.getContractFactory("UsdtBossEducationalV10");
      const v10: any = await upgrades.upgradeProxy(proxy, V10, { kind: "uups" });

      const queueBefore = await v10.globalQueueLengthA(1);
      const balancesBefore = await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ]);
      const V11 = await ethers.getContractFactory("UsdtBossEducationalV11");
      await upgrades.validateUpgrade(proxy, V11, { kind: "uups" });
      const v11: any = await upgrades.upgradeProxy(proxy, V11, { kind: "uups" });

      expect(await v11.version()).to.equal(11);
      await expect(v11.connect(outsider).activateApprovedGlobalPoolMembers())
        .to.be.revertedWithCustomError(v11, "OwnableUnauthorizedAccount");
      await expect(v11.activateApprovedGlobalPoolMembers())
        .to.emit(v11, "ApprovedGlobalPoolMemberActivated")
        .withArgs(accounts[0], sponsor, 1);

      expect(await v11.globalQueueLengthA(1)).to.equal(queueBefore + 5n);
      for (let index = 0; index < accounts.length; index += 1) {
        const account = accounts[index];
        const global = await v11.globalMembers(account);
        expect(global.joined).to.equal(true);
        expect(global.highestLevel).to.equal(1);
        expect(await v11.globalQueueAccountA(1, queueBefore + BigInt(index))).to.equal(account);
        expect((await v11.members(account)).sponsor).to.equal(sponsor);
        expect((await v11.members(account)).highestSlot).to.equal(1);
        expect(await v11.activatedAmount(account)).to.equal(30_000_000n);
        expect(await v11.gpFilledA(1, account)).to.equal(0);
        expect(await v11.gpFilledB(1, account)).to.equal(0);
        expect(await v11.globalIncome(account)).to.equal(0);
      }
      expect(await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ])).to.deep.equal(balancesBefore);
      await expect(v11.activateApprovedGlobalPoolMembers())
        .to.be.revertedWithCustomError(v11, "ApprovedGlobalPoolActivationUnavailable")
        .withArgs(accounts[0]);
    });

    it("upgrades safely to V12 and activates historical Global Pool users without payment", async function () {
      const [owner, treasury, sponsor, historicalA, historicalB, outsider] = await ethers.getSigners();
      const token: any = await ethers.deployContract("MockUSDT");
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.deployProxy(V6, [
        await token.getAddress(), treasury.address, owner.address, owner.address,
      ], { kind: "uups" });
      const proxy = await v6.getAddress();

      await v6.migrateMembers([
        { account: sponsor.address, sponsor: owner.address, level: 1, amount: 30_000_000n },
        { account: historicalA.address, sponsor: sponsor.address, level: 1, amount: 30_000_000n },
        { account: historicalB.address, sponsor: historicalA.address, level: 1, amount: 30_000_000n },
      ]);
      await v6.finalizeMigration();
      await v6.backfillLegacyGlobal([
        { account: historicalA.address, level: 2 },
        { account: historicalB.address, level: 1 },
      ]);
      await v6.finalizeLegacyGlobal();

      await token.mint(sponsor.address, 20_000_000n);
      await token.connect(sponsor).approve(proxy, 20_000_000n);
      await v6.connect(sponsor).joinGlobalPool(owner.address);

      const queueBefore = await v6.globalQueueLengthA(1);
      const contractBalanceBefore = await token.balanceOf(proxy);
      const sponsorBalanceBefore = await token.balanceOf(sponsor.address);
      const bootstrapFillBefore = await v6.gpFilledA(1, owner.address);

      const V12 = await ethers.getContractFactory("UsdtBossEducationalV12");
      await upgrades.validateUpgrade(proxy, V12, { kind: "uups" });
      const v12: any = await upgrades.upgradeProxy(proxy, V12, { kind: "uups" });

      expect(await v12.version()).to.equal(12);
      await expect(v12.connect(outsider).activateLegacyGlobalPoolMembers([historicalA.address]))
        .to.be.revertedWithCustomError(v12, "OwnableUnauthorizedAccount");
      await expect(v12.activateLegacyGlobalPoolMembers([outsider.address]))
        .to.be.revertedWithCustomError(v12, "LegacyGlobalActivationUnavailable")
        .withArgs(outsider.address);
      await expect(v12.activateLegacyGlobalPoolMembers([historicalA.address, historicalA.address]))
        .to.be.revertedWithCustomError(v12, "LegacyGlobalActivationUnavailable")
        .withArgs(historicalA.address);

      await expect(v12.activateLegacyGlobalPoolMembers([historicalA.address, historicalB.address]))
        .to.emit(v12, "LegacyGlobalPoolMemberActivated")
        .withArgs(historicalA.address, sponsor.address, 1, 2)
        .and.to.emit(v12, "LegacyGlobalPoolMemberActivated")
        .withArgs(historicalB.address, historicalA.address, 1, 1);

      expect(await v12.globalQueueLengthA(1)).to.equal(queueBefore + 2n);
      expect(await v12.globalQueueAccountA(1, queueBefore)).to.equal(historicalA.address);
      expect(await v12.globalQueueAccountA(1, queueBefore + 1n)).to.equal(historicalB.address);
      expect((await v12.globalMembers(historicalA.address)).highestLevel).to.equal(1);
      expect((await v12.globalMembers(historicalB.address)).highestLevel).to.equal(1);
      expect(await v12.legacyGlobalLevel(historicalA.address)).to.equal(2);
      expect(await v12.legacyGlobalLevel(historicalB.address)).to.equal(1);
      expect(await v12.gpFilledA(1, historicalA.address)).to.equal(0);
      expect(await v12.gpFilledB(1, historicalA.address)).to.equal(0);
      expect(await v12.gpFilledA(1, owner.address)).to.equal(bootstrapFillBefore);
      expect(await token.balanceOf(proxy)).to.equal(contractBalanceBefore);
      expect(await token.balanceOf(sponsor.address)).to.equal(sponsorBalanceBefore);

      await expect(v12.activateLegacyGlobalPoolMembers([historicalA.address]))
        .to.be.revertedWithCustomError(v12, "LegacyGlobalActivationUnavailable")
        .withArgs(historicalA.address);
    });

    it("upgrades safely to V13 and completes Level 1 only for the five verified legacy users", async function () {
      const [owner, treasury, outsider] = await ethers.getSigners();
      const accounts = [
        "0x4de3bdF7fAE0E6b65080d03D615e389109Beaf0b",
        "0xe2054Ed8e010618501838d6116BfdCDC4955CfdA",
        "0x3476BA0F301301C6E430C7d51742Dc326ecF9310",
        "0x8Dd7bB8C99372B6Ce274a2cd1C9b9EABb4C79d18",
        "0x8f43A3b2cF8eE64Cb1A2F81E37DeC53c231cbE9D",
      ];
      const token: any = await ethers.deployContract("MockUSDT");
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.deployProxy(V6, [
        await token.getAddress(), treasury.address, owner.address, owner.address,
      ], { kind: "uups" });
      const proxy = await v6.getAddress();
      await v6.migrateMembers(accounts.map(account => ({
        account, sponsor: owner.address, level: 1, amount: 30_000_000n,
      })));
      await v6.finalizeMigration();
      await v6.backfillLegacyGlobal(accounts.map(account => ({ account, level: 2 })));
      await v6.finalizeLegacyGlobal();

      const V12 = await ethers.getContractFactory("UsdtBossEducationalV12");
      const v12: any = await upgrades.upgradeProxy(proxy, V12, { kind: "uups" });
      await v12.activateLegacyGlobalPoolMembers(accounts);
      const queue1Before = await v12.globalQueueLengthA(1);
      const queue2Before = await v12.globalQueueLengthA(2);
      const balancesBefore = await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ]);

      const V13 = await ethers.getContractFactory("UsdtBossEducationalV13");
      await upgrades.validateUpgrade(proxy, V13, { kind: "uups" });
      const v13: any = await upgrades.upgradeProxy(proxy, V13, { kind: "uups" });
      expect(await v13.version()).to.equal(13);
      await expect(v13.connect(outsider).completeApprovedLegacyGlobalLevelOne())
        .to.be.revertedWithCustomError(v13, "OwnableUnauthorizedAccount");
      await expect(v13.completeApprovedLegacyGlobalLevelOne())
        .to.emit(v13, "LegacyGlobalLevelOneCompleted")
        .withArgs(accounts[0], 2, 5, 2);

      expect(await v13.globalQueueLengthA(1)).to.equal(queue1Before);
      expect(await v13.globalQueueLengthA(2)).to.equal(queue2Before + 5n);
      for (let index = 0; index < accounts.length; index += 1) {
        const account = accounts[index];
        expect((await v13.globalMembers(account)).highestLevel).to.equal(2);
        expect(await v13.legacyGlobalLevel(account)).to.equal(2);
        expect(await v13.gpFilledA(1, account)).to.equal(2);
        expect(await v13.gpFilledB(1, account)).to.equal(5);
        expect(await v13.gpFilledA(2, account)).to.equal(0);
        expect(await v13.gpFilledB(2, account)).to.equal(0);
        expect(await v13.globalIncome(account)).to.equal(0);
        expect(await v13.globalQueueAccountA(2, queue2Before + BigInt(index))).to.equal(account);
      }
      expect(await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ])).to.deep.equal(balancesBefore);
      await expect(v13.completeApprovedLegacyGlobalLevelOne())
        .to.be.revertedWithCustomError(v13, "LegacyLevelOneCompletionUnavailable")
        .withArgs(accounts[0]);
    });

    it("upgrades safely to V14 and clears only duplicate historical Global Pool state", async function () {
      const [owner, treasury, historicalA, historicalB, outsider] = await ethers.getSigners();
      const accounts = [historicalA.address, historicalB.address];
      const token: any = await ethers.deployContract("MockUSDT");
      const V6 = await ethers.getContractFactory("UsdtBossEducationalV6");
      const v6: any = await upgrades.deployProxy(V6, [
        await token.getAddress(), treasury.address, owner.address, owner.address,
      ], { kind: "uups" });
      const proxy = await v6.getAddress();
      await v6.migrateMembers(accounts.map(account => ({
        account, sponsor: owner.address, level: 1, amount: 30_000_000n,
      })));
      await v6.finalizeMigration();
      await v6.backfillLegacyGlobal([
        { account: historicalA.address, level: 2 },
        { account: historicalB.address, level: 1 },
      ]);
      await v6.finalizeLegacyGlobal();

      const V12 = await ethers.getContractFactory("UsdtBossEducationalV12");
      const v12: any = await upgrades.upgradeProxy(proxy, V12, { kind: "uups" });
      await v12.activateLegacyGlobalPoolMembers(accounts);
      const queueBefore = await v12.globalQueueLengthA(1);
      const balancesBefore = await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ]);

      const V14 = await ethers.getContractFactory("UsdtBossEducationalV14");
      await upgrades.validateUpgrade(proxy, V14, { kind: "uups" });
      const v14: any = await upgrades.upgradeProxy(proxy, V14, { kind: "uups" });
      expect(await v14.version()).to.equal(14);
      await expect(v14.connect(outsider).clearAllLegacyGlobalPoolRecords(accounts))
        .to.be.revertedWithCustomError(v14, "OwnableUnauthorizedAccount");
      await expect(v14.clearAllLegacyGlobalPoolRecords([historicalA.address]))
        .to.be.revertedWithCustomError(v14, "LegacyGlobalClearIncomplete")
        .withArgs(2, 1);

      await expect(v14.clearAllLegacyGlobalPoolRecords(accounts))
        .to.emit(v14, "LegacyGlobalRecordCleared")
        .withArgs(historicalA.address, 2)
        .and.to.emit(v14, "LegacyGlobalRecordsCleared")
        .withArgs(2);

      expect(await v14.legacyGlobalCount()).to.equal(0);
      expect(await v14.legacyGlobalLevel(historicalA.address)).to.equal(0);
      expect(await v14.legacyGlobalLevel(historicalB.address)).to.equal(0);
      expect(await v14.globalQueueLengthA(1)).to.equal(queueBefore);
      for (const account of accounts) {
        expect((await v14.globalMembers(account)).joined).to.equal(true);
        expect((await v14.globalMembers(account)).highestLevel).to.equal(1);
        expect(await v14.globalIncome(account)).to.equal(0);
        expect(await v14.gpFilledA(1, account)).to.equal(0);
        expect(await v14.gpFilledB(1, account)).to.equal(0);
      }
      expect(await Promise.all([
        token.balanceOf(proxy), token.balanceOf(owner.address), token.balanceOf(treasury.address),
        ...accounts.map(account => token.balanceOf(account)),
      ])).to.deep.equal(balancesBefore);
      await expect(v14.clearAllLegacyGlobalPoolRecords(accounts))
        .to.be.revertedWithCustomError(v14, "LegacyGlobalClearIncomplete")
        .withArgs(0, 2);
    });
  });
});
