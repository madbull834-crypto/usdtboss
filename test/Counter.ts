import { expect } from "chai";
import { ethers } from "hardhat";

describe("Counter", function () {
  it("starts at zero", async function () {
    const counter = await ethers.deployContract("Counter");
    expect(await counter.count()).to.equal(0n);
  });

  it("increments and emits the new count", async function () {
    const [caller] = await ethers.getSigners();
    const counter = await ethers.deployContract("Counter");
    await expect(counter.increment())
      .to.emit(counter, "CountChanged")
      .withArgs(1n, caller.address);
    expect(await counter.count()).to.equal(1n);
  });
});
