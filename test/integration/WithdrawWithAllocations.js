const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);
const YEAR = 365 * 24 * 3600;

describe('Integration: Withdraw With Strategy Allocations', () => {
    let token, configManager, strategyRouter, mockS1, dbank;
    let deployer, user1, user2;

    beforeEach(async () => {
        [deployer, user1, user2] = await ethers.getSigners();

        const Token = await ethers.getContractFactory('Token');
        token = await Token.deploy('USDC Token', 'USDC', '10000000');

        const ConfigManager = await ethers.getContractFactory('ConfigManager');
        configManager = await ConfigManager.deploy();

        const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address);

        const MockS1 = await ethers.getContractFactory('MockS1');
        mockS1 = await MockS1.deploy(token.address);
        await mockS1.setParams(500, tokens(1000000)); // 5% APR, 1M cap

        await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000));

        const dBank = await ethers.getContractFactory('dBank');
        dbank = await dBank.deploy(
            token.address,
            'dBank USDC Vault',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        );

        // Set caps high enough for tests
        await dbank.setTvlCap(tokens(1000000));
        await dbank.setPerTxCap(tokens(1000000));

        // Fund users and approve both dBank and StrategyRouter
        await token.transfer(user1.address, tokens(30000));
        await token.connect(user1).approve(dbank.address, tokens(30000));
        await token.connect(user1).approve(strategyRouter.address, tokens(30000));

        await token.transfer(user2.address, tokens(20000));
        await token.connect(user2).approve(dbank.address, tokens(20000));
        await token.connect(user2).approve(strategyRouter.address, tokens(20000));
    });

    // =========================================================
    // Allocations do NOT block vault withdrawals
    // =========================================================
    describe('Allocations do not block withdrawals', () => {

        it('user can withdraw full balance even with strategy allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            expect(await dbank.balanceOf(user1.address)).to.equal(tokens(10000));

            // Allocate 6000 to strategy (from wallet)
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));
            expect(await strategyRouter.getUserTotalAllocated(user1.address)).to.equal(tokens(6000));

            // Allocations are independent - user can withdraw full vault balance
            await expect(
                dbank.connect(user1).withdraw(tokens(10000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });

        it('withdrawal succeeds up to buffer regardless of allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            // Buffer = 10000, withdraw 5000 succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;
        });

        it('maxWithdraw returns full balance even when fully allocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            // Allocations don't reduce maxWithdraw
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(5000));
            expect(await dbank.maxRedeem(user1.address)).to.equal(tokens(5000));

            // Withdrawal of any amount within balance succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(1), user1.address, user1.address)
            ).to.not.be.reverted;
        });

        it('redeem succeeds regardless of allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            // Redeem all 10000 shares succeeds
            await expect(
                dbank.connect(user1).redeem(tokens(10000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });
    });

    // =========================================================
    // SUCCESS: Withdraw within limits (buffer, perTxCap)
    // =========================================================
    describe('SUCCESS: Withdraw within limits', () => {

        it('user withdraws full balance when no allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            expect(await dbank.balanceOf(user1.address)).to.equal(tokens(10000));

            // maxWithdraw = full balance
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(10000));

            await expect(
                dbank.connect(user1).withdraw(maxW, user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });

        it('user with zero allocations withdraws freely', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // No allocations
            expect(await strategyRouter.getUserTotalAllocated(user1.address)).to.equal(0);

            // Full withdrawal succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
            expect(await dbank.buffer()).to.equal(0);
        });

        it('partial withdrawal within buffer succeeds', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            // Withdraw 2000 (within buffer = 10000)
            await expect(
                dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address)
            ).to.not.be.reverted;

            // Buffer decreased
            expect(await dbank.buffer()).to.equal(tokens(8000));
        });
    });

    // =========================================================
    // maxWithdraw and maxRedeem ignore allocations
    // =========================================================
    describe('maxWithdraw and maxRedeem with allocations', () => {

        it('maxWithdraw returns full share value regardless of allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            const maxW = await dbank.maxWithdraw(user1.address);
            // Full share value = 10000, buffer = 10000, so maxW = 10000
            expect(maxW).to.equal(tokens(10000));
        });

        it('maxRedeem returns full share count regardless of allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            const maxR = await dbank.maxRedeem(user1.address);
            // Full shares = 10000
            expect(maxR).to.equal(tokens(10000));
        });

        it('maxWithdraw respects buffer cap when buffer < share value', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(2000));

            // Allocate 7000 from vault buffer to strategy
            await dbank.connect(deployer).allocate(1, tokens(7000));
            // Buffer now = 3000

            const maxW = await dbank.maxWithdraw(user1.address);
            // min(ownerAssets=10000, buffer=3000) = 3000
            expect(maxW).to.equal(tokens(3000));
        });

        it('maxWithdraw respects perTxCap when perTxCap < share value', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(2000));

            // Set perTxCap to 1000
            await dbank.setPerTxCap(tokens(1000));

            const maxW = await dbank.maxWithdraw(user1.address);
            // min(ownerAssets=10000, buffer=10000, perTxCap=1000) = 1000
            expect(maxW).to.equal(tokens(1000));
        });

        it('maxWithdraw returns full balance even when fully allocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            // Allocations don't reduce maxWithdraw
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(5000));
        });

        it('maxRedeem returns full shares even when fully allocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            // Allocations don't reduce maxRedeem
            expect(await dbank.maxRedeem(user1.address)).to.equal(tokens(5000));
        });
    });

    // =========================================================
    // Unallocate then withdraw (no longer necessary, but still works)
    // =========================================================
    describe('Unallocate then withdraw', () => {

        it('maxWithdraw unchanged by un-allocating (already full)', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            // Before un-allocation: maxWithdraw = full balance
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(10000));

            // Un-allocate 3000 (provide router liquidity first)
            await token.transfer(strategyRouter.address, tokens(3000));
            await strategyRouter.connect(user1).withdrawFromStrategy(1, tokens(3000), 100);

            // After un-allocating: maxWithdraw still = full balance
            expect(await strategyRouter.getUserTotalAllocated(user1.address)).to.equal(tokens(3000));
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(10000));
        });

        it('full withdrawal succeeds whether or not user has allocations', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            // maxWithdraw = 5000 (full balance, allocations don't reduce it)
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(5000));

            // Full withdrawal succeeds without needing to un-allocate first
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });
    });

    // =========================================================
    // Multiple users with different allocations
    // =========================================================
    describe('Multiple users with different allocations', () => {

        it('each user can withdraw their full share value independently', async () => {
            // user1: deposit 10000, allocate 8000
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(8000));

            // user2: deposit 5000, allocate 0
            await dbank.connect(user2).deposit(tokens(5000), user2.address);

            // user1 maxWithdraw = 10000 (full balance, buffer=15000)
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(10000));

            // user2 maxWithdraw = 5000 (full balance)
            expect(await dbank.maxWithdraw(user2.address)).to.equal(tokens(5000));

            // Both can withdraw their full balance
            await expect(
                dbank.connect(user1).withdraw(tokens(10000), user1.address, user1.address)
            ).to.not.be.reverted;

            await expect(
                dbank.connect(user2).withdraw(tokens(5000), user2.address, user2.address)
            ).to.not.be.reverted;
        });

        it('users with different allocation ratios have same withdrawal rights', async () => {
            // user1: deposit 10000, allocate 5000
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            // user2: deposit 10000, allocate 2000
            await dbank.connect(user2).deposit(tokens(10000), user2.address);
            await strategyRouter.connect(user2).depositToStrategy(1, tokens(2000));

            // Both have full maxWithdraw = 10000 (allocations don't reduce it)
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(10000));
            expect(await dbank.maxWithdraw(user2.address)).to.equal(tokens(10000));
        });
    });

    // =========================================================
    // Yield accrual interaction
    // =========================================================
    describe('Yield accrual with allocations', () => {

        it('vault-level allocation + yield: buffer cap still applies', async () => {
            // user1 deposits 10000, allocates 4000 from wallet to strategy
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(4000));

            // Owner also allocates 6000 from vault buffer to strategy
            await dbank.connect(deployer).allocate(1, tokens(6000));
            // Buffer now = 4000 (10000 - 6000)

            // maxWithdraw = min(ownerAssets=10000, buffer=4000) = 4000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(4000));

            // Advance 1 year for yield accrual
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // Strategy earned yield -> totalAssets increased
            const totalAssets = await dbank.totalAssets();
            expect(totalAssets).to.be.gt(tokens(10000));

            // maxWithdraw still buffer-capped (ownerAssets > 10000, but buffer = 4000)
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(4000));
        });

        it('maxWithdraw returns full share value after yield (buffer-capped)', async () => {
            // user1 deposits 10000, allocates 8000 from wallet
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(8000));

            // Owner allocates 5000 from vault buffer to strategy
            await dbank.connect(deployer).allocate(1, tokens(5000));
            // Buffer = 5000

            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // Vault totalAssets includes yield on the 5000 vault allocation
            const totalAssets = await dbank.totalAssets();
            expect(totalAssets).to.be.gt(tokens(10000));

            // maxWithdraw = min(ownerAssets>10000, buffer=5000) = 5000
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(5000));

            // Withdrawal within buffer succeeds
            await expect(
                dbank.connect(user1).withdraw(maxW, user1.address, user1.address)
            ).to.not.be.reverted;
        });
    });

    // =========================================================
    // Edge cases
    // =========================================================
    describe('Edge cases', () => {

        it('user can withdraw all even with near-total allocation', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            // Allocate 9999 from wallet, leaving nothing
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(9999));

            // maxWithdraw = full balance (allocations don't affect it)
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(10000));

            // Can withdraw full balance
            await expect(
                dbank.connect(user1).withdraw(tokens(10000), user1.address, user1.address)
            ).to.not.be.reverted;
        });

        it('user with allocations but no vault shares has maxWithdraw = 0', async () => {
            // user1 never deposited to vault but allocated to strategy from wallet
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(5000));

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);
        });

        it('sequential withdrawals reduce balance correctly regardless of allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await strategyRouter.connect(user1).depositToStrategy(1, tokens(6000));

            // First withdrawal: 2000
            await dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address);
            // Remaining shares: 8000, buffer: 8000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(8000));

            // Second withdrawal: 4000
            await dbank.connect(user1).withdraw(tokens(4000), user1.address, user1.address);
            // Remaining shares: 4000, buffer: 4000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(4000));

            // Third withdrawal: remaining 4000
            await expect(
                dbank.connect(user1).withdraw(tokens(4000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });
    });
});
