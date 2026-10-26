import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const AMOUNT = ethers.parseUnits("30", 18);

async function deployFixture() {
    const [deployer, buyer, seller, arbiter, stranger] = await ethers.getSigners();
    const token = await ethers.deployContract("YRHToken"); // 换成你的合约名
    await token.mint(buyer.address, ethers.parseUnits("100", 18)); // deployer 是 owner
    const escrow = await ethers.deployContract("Escrow", [arbiter.address]);
    const deadline = (await time.latest()) + 3600;
    return { token, escrow, deployer, buyer, seller, arbiter, stranger, deadline };
}

describe("Escrow", function () {
    it("createOrder 记录订单并发出事件", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);
        await expect(
            escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书")
        )
            .to.emit(escrow, "OrderCreated")
            .withArgs(0, buyer.address, seller.address, await token.getAddress(), AMOUNT, deadline);

        const order = await escrow.getOrder(0);
        expect(order.buyer).to.equal(buyer.address);
        expect(order.status).to.equal(0); // Created
        expect(await escrow.orderCount()).to.equal(1);
    });

    it("未 approve 时 deposit 失败", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        // 报错文字请和你 ZSToken.sol 里的 require 完全一致
        await expect(escrow.connect(buyer).deposit(0)).to.be.revertedWith("YRHToken: transfer amount exceeds allowance");
    });

    // ================= 补齐的 6 个用例 =================

    it("approve 后 deposit 成功，代币进入 Escrow，状态变为 Paid", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

        // 1. 创建订单
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");

        // 2. approve 给 Escrow 合约
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);

        // 3. 执行 deposit，并检查事件
        await expect(escrow.connect(buyer).deposit(0))
            .to.emit(escrow, "OrderPaid")
            .withArgs(0);

        // 4. 检查状态和余额
        const order = await escrow.getOrder(0);
        expect(order.status).to.equal(1); // Paid

        const escrowBalance = await token.balanceOf(await escrow.getAddress());
        expect(escrowBalance).to.equal(AMOUNT);
    });

    it("非买家调用 confirm 失败", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

        // 准备环境：走到 Paid 状态
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
        await escrow.connect(buyer).deposit(0);

        // 用卖家尝试调用 confirm，应该被 onlyBuyer 拦截
        await expect(escrow.connect(seller).confirm(0))
            .to.be.revertedWith("Escrow: caller is not the buyer");
    });

    it("confirm 后卖家收到代币，状态变为 Completed", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

        // 准备环境：走到 Paid 状态
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
        await escrow.connect(buyer).deposit(0);

        // 买家确认收货
        await expect(escrow.connect(buyer).confirm(0))
            .to.emit(escrow, "OrderCompleted")
            .withArgs(0);

        // 检查状态和卖家余额
        const order = await escrow.getOrder(0);
        expect(order.status).to.equal(2); // Completed

        const sellerBalance = await token.balanceOf(seller.address);
        expect(sellerBalance).to.equal(AMOUNT);
    });

    it("deadline 之前 refund 失败, deadline 之后 refund 成功并退回买家", async function () {
        const { token, escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

        // 准备环境：走到 Paid 状态
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
        await escrow.connect(buyer).deposit(0);

        // 时间还没到，尝试退款
        await expect(escrow.connect(buyer).refund(0))
            .to.be.revertedWith("Escrow: deadline not reached");

        // 将链上时间快进到 deadline 之后
        await time.increaseTo(deadline + 1); // 或者用 time.increase(3600)

        // 再次尝试退款
        await expect(escrow.connect(buyer).refund(0))
            .to.emit(escrow, "OrderRefunded")
            .withArgs(0);

        // 检查状态和买家余额（买家初始 100，退款后应该还是 100）
        const order = await escrow.getOrder(0);
        expect(order.status).to.equal(3); // Refunded

        const buyerBalance = await token.balanceOf(buyer.address);
        expect(buyerBalance).to.equal(ethers.parseUnits("100", 18));
    });

    it("非仲裁人调用 resolve 失败", async function () {
        const { token, escrow, buyer, seller, stranger, deadline } = await loadFixture(deployFixture);

        // 准备环境：走到 Disputed 状态
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
        await escrow.connect(buyer).deposit(0);
        await escrow.connect(seller).dispute(0); // 卖家发起争议

        // 路人尝试仲裁，应该被 onlyArbiter 拦截
        await expect(escrow.connect(stranger).resolve(0, true))
            .to.be.revertedWith("Escrow: caller is not the arbiter");
    });

    it("dispute 后仲裁人 resolve(false) 退款给买家，状态变为 Refunded", async function () {
        const { token, escrow, buyer, seller, arbiter, deadline } = await loadFixture(deployFixture);

        // 准备环境：走到 Paid 状态
        await escrow.connect(buyer).createOrder(seller.address, await token.getAddress(), AMOUNT, deadline, "一本书");
        await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
        await escrow.connect(buyer).deposit(0);

        // 买家发起争议
        await escrow.connect(buyer).dispute(0);

        // 仲裁人裁决：false (退给买家)
        await expect(escrow.connect(arbiter).resolve(0, false))
            .to.emit(escrow, "OrderResolved")
            .withArgs(0, false);

        // 检查状态和买家余额（买家初始 100，退款后应该还是 100）
        const order = await escrow.getOrder(0);
        expect(order.status).to.equal(3); // Refunded

        const buyerBalance = await token.balanceOf(buyer.address);
        expect(buyerBalance).to.equal(ethers.parseUnits("100", 18));
    });
});