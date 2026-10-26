import { expect } from "chai";
import { ethers } from "hardhat";

describe("Reentrancy challenge (assignment 6.1)", function () {
  async function setup(name: "VulnerableVault" | "FixedVault") {
    const [owner, victim, stranger] = await ethers.getSigners();
    const vault = await ethers.deployContract(name);
    const attacker = await ethers.deployContract("Attacker", [await vault.getAddress()]);
    await vault.connect(victim).deposit({ value: ethers.parseEther("0.002") });
    return { owner, victim, stranger, vault, attacker };
  }

  it("drains 0.003 with 0.001; victim's recorded claim becomes insolvent", async function () {
    const { victim, vault, attacker } = await setup("VulnerableVault");
    await attacker.attack({ value: ethers.parseEther("0.001") });
    expect(await vault.vaultBalance()).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(ethers.parseEther("0.003"));
    expect(await attacker.receiveCount()).to.equal(3n);
    expect(await vault.balances(await attacker.getAddress())).to.equal(0n);
    expect(await vault.balances(victim.address)).to.equal(ethers.parseEther("0.002"));
    await expect(vault.connect(victim).withdraw()).to.be.revertedWith("Vault: send failed");
  });

  it("CEI rejects the same attack and rolls back the attacker's deposit", async function () {
    const { victim, vault, attacker } = await setup("FixedVault");
    await expect(attacker.attack({ value: ethers.parseEther("0.001") })).to.be.revertedWith("Vault: send failed");
    expect(await vault.vaultBalance()).to.equal(ethers.parseEther("0.002"));
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(0n);
    expect(await vault.balances(await attacker.getAddress())).to.equal(0n);
    expect(await vault.balances(victim.address)).to.equal(ethers.parseEther("0.002"));
    expect(await attacker.receiveCount()).to.equal(0n);
    await vault.connect(victim).withdraw();
    expect(await vault.vaultBalance()).to.equal(0n);
  });

  for (const name of ["VulnerableVault", "FixedVault"] as const) {
    it(`${name}: normal withdrawal succeeds once`, async function () {
      const { victim, vault } = await setup(name);
      await expect(vault.connect(victim).withdraw()).to.changeEtherBalances(
        [vault, victim], [ethers.parseEther("-0.002"), ethers.parseEther("0.002")],
      );
      expect(await vault.balances(victim.address)).to.equal(0n);
      await expect(vault.connect(victim).withdraw()).to.be.revertedWith("Vault: nothing to withdraw");
    });
  }

  it("only the owner can start an attack or collect its proceeds", async function () {
    const { owner, stranger, vault, attacker } = await setup("VulnerableVault");
    await expect(attacker.connect(stranger).attack({ value: 1n })).to.be.revertedWith("Attacker: only owner");
    await expect(attacker.attack()).to.be.revertedWith("Attacker: zero value");
    await attacker.attack({ value: ethers.parseEther("0.001") });
    await expect(attacker.connect(stranger).collect()).to.be.revertedWith("Attacker: only owner");
    await expect(attacker.collect()).to.changeEtherBalances(
      [attacker, owner], [ethers.parseEther("-0.003"), ethers.parseEther("0.003")],
    );
    expect(await vault.vaultBalance()).to.equal(0n);
  });
});
