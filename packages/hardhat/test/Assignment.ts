import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

async function fixture() {
  const [, buyer, seller, arbiter, stranger] = await ethers.getSigners();
  const token = await ethers.deployContract("YRHToken");
  const escrow = await ethers.deployContract("Escrow", [arbiter.address]);
  const amount = ethers.parseUnits("30", 18);
  await token.mint(buyer.address, amount * 3n);
  await escrow
    .connect(buyer)
    .createOrder(seller.address, await token.getAddress(), amount, (await time.latest()) + 3600, "验收订单");
  await token.connect(buyer).approve(await escrow.getAddress(), amount);
  await escrow.connect(buyer).deposit(0);
  return { token, escrow, buyer, seller, arbiter, stranger, amount };
}

describe("Assignment permissions and settlement", function () {
  it("seller cannot confirm; stranger cannot dispute or arbitrate", async function () {
    const { escrow, seller, stranger } = await loadFixture(fixture);
    await expect(escrow.connect(seller).confirm(0)).to.be.revertedWith("Escrow: caller is not the buyer");
    await expect(escrow.connect(stranger).dispute(0)).to.be.revertedWith("Escrow: caller is not buyer or seller");
    await expect(escrow.connect(stranger).resolve(0, false)).to.be.revertedWith("Escrow: caller is not the arbiter");
  });
  it("arbiter cannot settle an undisputed order", async function () {
    const { escrow, arbiter } = await loadFixture(fixture);
    await expect(escrow.connect(arbiter).resolve(0, false)).to.be.revertedWith("Escrow: wrong status");
    expect((await escrow.getOrder(0)).status).to.equal(1);
  });
  it("seller wins arbitration exactly once and receives the escrowed amount", async function () {
    const { token, escrow, buyer, seller, arbiter, amount } = await loadFixture(fixture);
    await escrow.connect(seller).dispute(0);
    await escrow.connect(arbiter).resolve(0, true);
    expect((await escrow.getOrder(0)).status).to.equal(2);
    expect(await token.balanceOf(seller.address)).to.equal(amount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
    await expect(escrow.connect(arbiter).resolve(0, true)).to.be.revertedWith("Escrow: wrong status");
    await expect(escrow.connect(buyer).confirm(0)).to.be.revertedWith("Escrow: wrong status");
  });
  it("insufficient allowance reverts without changing status or balances", async function () {
    const { token, escrow, buyer, seller, amount } = await loadFixture(fixture);
    await escrow
      .connect(buyer)
      .createOrder(seller.address, await token.getAddress(), amount, (await time.latest()) + 3600, "授权不足");
    await expect(escrow.connect(buyer).deposit(1)).to.be.revertedWith("YRHToken: transfer amount exceeds allowance");
    expect((await escrow.getOrder(1)).status).to.equal(0);
    expect(await token.balanceOf(buyer.address)).to.equal(amount * 2n);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
  });
});
