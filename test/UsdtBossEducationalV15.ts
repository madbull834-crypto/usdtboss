import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("UsdtBossEducationalV15 Nth-upline routing", function () {
  async function upgradeWithMigratedChain(
    records: Array<{ account: string; sponsor: string; level: number; amount: bigint }>
  ) {
    const [root, treasury] = await ethers.getSigners();
    const token: any = await ethers.deployContract("MockUSDT");
    const V14 = await ethers.getContractFactory("UsdtBossEducationalV14");
    const proxy: any = await upgrades.deployProxy(V14, [
      await token.getAddress(), treasury.address, root.address, root.address
    ], { kind: "uups" });

    await proxy.migrateMembers(records);
    await proxy.finalizeMigration();

    const V15 = await ethers.getContractFactory("UsdtBossEducationalV15");
    await upgrades.validateUpgrade(await proxy.getAddress(), V15, { kind: "uups" });
    const boss: any = await upgrades.upgradeProxy(await proxy.getAddress(), V15, { kind: "uups" });
    await boss.waitForDeployment();

    expect(await boss.version()).to.equal(15n);
    return { root, treasury, token, boss };
  }

  async function fundJoiners(token: any, boss: any, joiners: any[]) {
    for (const joiner of joiners) {
      await token.mint(joiner.address, 30_000_000n);
      await token.connect(joiner).approve(await boss.getAddress(), 30_000_000n);
    }
  }

  it("sends a Slot-2 activation to the second upline", async function () {
    const [root, , second, first, account, d1, d2, d3] = await ethers.getSigners();
    const { token, boss } = await upgradeWithMigratedChain([
      { account: second.address, sponsor: root.address, level: 2, amount: 60_000_000n },
      { account: first.address, sponsor: second.address, level: 2, amount: 60_000_000n }
    ]);
    await fundJoiners(token, boss, [account, d1, d2, d3]);

    await boss.connect(account).join(first.address);
    for (const direct of [d1, d2, d3]) await boss.connect(direct).join(account.address);

    expect((await boss.members(account.address)).highestSlot).to.equal(2);
    expect(await boss.matrixParent(2, account.address)).to.equal(second.address);
    expect(await token.balanceOf(second.address)).to.equal(60_000_000n);
  });

  it("skips an inactive second upline and pays the next eligible upline", async function () {
    const [root, , third, second, first, account, d1, d2, d3] = await ethers.getSigners();
    const { token, boss } = await upgradeWithMigratedChain([
      { account: third.address, sponsor: root.address, level: 2, amount: 60_000_000n },
      { account: second.address, sponsor: third.address, level: 1, amount: 30_000_000n },
      { account: first.address, sponsor: second.address, level: 2, amount: 60_000_000n }
    ]);
    await fundJoiners(token, boss, [account, d1, d2, d3]);

    await boss.connect(account).join(first.address);
    for (const direct of [d1, d2, d3]) await boss.connect(direct).join(account.address);

    expect(await boss.matrixParent(2, account.address)).to.equal(third.address);
    expect(await token.balanceOf(third.address)).to.equal(60_000_000n);
  });

  it("selects the third upline for Slot 3 and falls back to root when unavailable", async function () {
    const [root, , third, second, first, account, shortFirst, shortAccount] = await ethers.getSigners();
    const { boss } = await upgradeWithMigratedChain([
      { account: third.address, sponsor: root.address, level: 3, amount: 120_000_000n },
      { account: second.address, sponsor: third.address, level: 3, amount: 120_000_000n },
      { account: first.address, sponsor: second.address, level: 3, amount: 120_000_000n },
      { account: account.address, sponsor: first.address, level: 2, amount: 60_000_000n },
      { account: shortFirst.address, sponsor: root.address, level: 3, amount: 120_000_000n },
      { account: shortAccount.address, sponsor: shortFirst.address, level: 2, amount: 60_000_000n }
    ]);

    expect(await boss.upgradeRecipient(account.address, 3)).to.equal(third.address);

    expect(await boss.upgradeRecipient(shortAccount.address, 3)).to.equal(root.address);
  });

  it("reopens a completed root cycle so later fallback payments are paid", async function () {
    const signers = await ethers.getSigners();
    const [root, , first] = signers;
    const accounts = signers.slice(3, 7);
    const directs = signers.slice(7, 19);
    const { token, boss } = await upgradeWithMigratedChain([
      { account: first.address, sponsor: root.address, level: 2, amount: 60_000_000n }
    ]);
    await fundJoiners(token, boss, [...accounts, ...directs]);

    for (const account of accounts) await boss.connect(account).join(first.address);
    for (let i = 0; i < accounts.length; i++) {
      for (const direct of directs.slice(i * 3, i * 3 + 3)) {
        await boss.connect(direct).join(accounts[i].address);
      }
      expect(await boss.matrixParent(2, accounts[i].address)).to.equal(root.address);
    }

    expect(await boss.childrenFilled(2, root.address)).to.equal(1n);
    expect(await token.balanceOf(root.address)).to.equal(240_000_000n);
  });
});
