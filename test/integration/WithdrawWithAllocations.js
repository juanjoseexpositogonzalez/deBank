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

        // Fund users and approve dBank only (no router approval needed)
        await token.transfer(user1.address, tokens(30000));
        await token.connect(user1).approve(dbank.address, tokens(30000));

        await token.transfer(user2.address, tokens(20000));
        await token.connect(user2).approve(dbank.address, tokens(20000));
    });

    // =========================================================
    // Allocations BLOCK vault withdrawals (contract-enforced)
    // =========================================================
    describe('Allocations block withdrawals', () => {

        it('user cannot withdraw allocated portion', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);

            // Allocate 6000 via dBank (from buffer)
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // maxWithdraw = 10000 - 6000 = 4000
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(4000));

            // Cannot withdraw 5000 (exceeds unallocated)
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');

            // Can withdraw exactly 4000
            await expect(
                dbank.connect(user1).withdraw(tokens(4000), user1.address, user1.address)
            ).to.not.be.reverted;
        });

        it('maxWithdraw reflects unallocated amount', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(4000));
            expect(await dbank.getUnallocated(user1.address)).to.equal(tokens(4000));
            expect(await dbank.getUserTotalAllocated(user1.address)).to.equal(tokens(6000));
        });

        it('redeem blocked for allocated portion', async () => {
            // Two users so buffer is large enough to isolate allocation check
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user2).deposit(tokens(10000), user2.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // Buffer = 14000, but user1 unallocated = 4000
            // Redeeming all 10000 shares → assets ≈ 10000 > unallocated 4000
            await expect(
                dbank.connect(user1).redeem(tokens(10000), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientUnallocated');
        });

        it('maxRedeem consistent with maxWithdraw', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            const maxR = await dbank.maxRedeem(user1.address);
            const maxW = await dbank.maxWithdraw(user1.address);
            // maxRedeem = convertToShares(maxWithdraw)
            const expectedShares = await dbank.convertToShares(maxW);
            expect(maxR).to.equal(expectedShares);
        });
    });

    // =========================================================
    // SUCCESS: Withdraw within unallocated limits
    // =========================================================
    describe('SUCCESS: Withdraw within unallocated limits', () => {

        it('user withdraws full balance when no allocations', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);

            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(10000));

            await expect(
                dbank.connect(user1).withdraw(maxW, user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });

        it('user with zero allocations withdraws freely', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            expect(await dbank.getUserTotalAllocated(user1.address)).to.equal(0);

            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;

            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });

        it('partial withdrawal within unallocated succeeds', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // Withdraw 2000 (within unallocated = 4000)
            await expect(
                dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address)
            ).to.not.be.reverted;

            // maxWithdraw updated
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(2000));
        });
    });

    // =========================================================
    // maxWithdraw respects all caps (unallocated, buffer, perTxCap)
    // =========================================================
    describe('maxWithdraw respects all caps', () => {

        it('maxWithdraw = min(unallocated, buffer, perTxCap)', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));
            // unallocated = 4000, buffer = 4000

            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(4000));
        });

        it('maxWithdraw respects buffer cap when buffer < unallocated', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);

            // Owner allocates 7000 from vault buffer to strategy (admin rebalancing)
            await dbank.connect(deployer).allocate(1, tokens(7000));
            // Buffer now = 3000, user has no allocations, unallocated = 10000

            const maxW = await dbank.maxWithdraw(user1.address);
            // min(unallocated=10000, buffer=3000) = 3000
            expect(maxW).to.equal(tokens(3000));
        });

        it('maxWithdraw respects perTxCap', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.setPerTxCap(tokens(1000));

            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(1000));
        });

        it('maxWithdraw = 0 when fully allocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(5000));

            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);
            expect(await dbank.getUnallocated(user1.address)).to.equal(0);
        });
    });

    // =========================================================
    // Unallocate then withdraw
    // =========================================================
    describe('Unallocate then withdraw', () => {

        it('unallocating increases maxWithdraw', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(8000));

            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(2000));

            // Unallocate 3000
            await dbank.connect(user1).unallocateForUser(1, tokens(3000), 100);

            // maxWithdraw = 10000 - 5000 = 5000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(5000));
        });

        it('full unallocate restores full withdrawal ability', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(5000));

            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);

            // Unallocate all
            await dbank.connect(user1).unallocateForUser(1, tokens(5000), 100);

            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(5000));

            // Full withdrawal succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;
        });
    });

    // =========================================================
    // Multiple users with different allocations
    // =========================================================
    describe('Multiple users with different allocations', () => {

        it('each user has independent allocation limits', async () => {
            // user1: deposit 10000, allocate 8000
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(8000));

            // user2: deposit 5000, no allocations
            await dbank.connect(user2).deposit(tokens(5000), user2.address);

            // user1: maxWithdraw ≈ 2000 (tiny yield may accrue between blocks)
            const maxW1 = await dbank.maxWithdraw(user1.address);
            expect(maxW1).to.be.closeTo(tokens(2000), tokens(1));

            // user2: maxWithdraw ≈ 5000
            const maxW2 = await dbank.maxWithdraw(user2.address);
            expect(maxW2).to.be.closeTo(tokens(5000), tokens(1));
        });

        it('users with different allocation ratios have proportional withdrawal rights', async () => {
            // user1: deposit 10000, allocate 5000
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(5000));

            // user2: deposit 10000, allocate 2000
            await dbank.connect(user2).deposit(tokens(10000), user2.address);
            await dbank.connect(user2).allocateForUser(1, tokens(2000));

            // user1 maxWithdraw ≈ 5000 (unallocated, tiny yield between blocks)
            const maxW1 = await dbank.maxWithdraw(user1.address);
            expect(maxW1).to.be.closeTo(tokens(5000), tokens(1));
            // user2 maxWithdraw ≈ 8000 (unallocated)
            const maxW2 = await dbank.maxWithdraw(user2.address);
            expect(maxW2).to.be.closeTo(tokens(8000), tokens(1));
        });
    });

    // =========================================================
    // Yield accrual interaction
    // =========================================================
    describe('Yield accrual with allocations', () => {

        it('yield increases unallocated portion (allocation is fixed principal)', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // Before yield: unallocated = 4000
            expect(await dbank.getUnallocated(user1.address)).to.equal(tokens(4000));

            // Owner allocates some buffer to strategy for vault-level yield
            await dbank.connect(deployer).allocate(1, tokens(2000));

            // Advance 1 year for yield accrual
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // totalAssets increased (yield on allocated)
            const totalAssets = await dbank.totalAssets();
            expect(totalAssets).to.be.gt(tokens(10000));

            // User's ownerAssets increased with yield, but allocation stays at 6000
            // So unallocated = ownerAssets - 6000 > 4000
            const unallocated = await dbank.getUnallocated(user1.address);
            expect(unallocated).to.be.gt(tokens(4000));
        });

        it('maxWithdraw buffer-capped even with yield', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // Owner allocates remaining buffer
            await dbank.connect(deployer).allocate(1, tokens(3000));
            // Buffer = 1000

            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // maxWithdraw capped by buffer (1000) even though unallocated > 1000
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(1000));
        });
    });

    // =========================================================
    // Edge cases
    // =========================================================
    describe('Edge cases', () => {

        it('cannot allocate more than unallocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            await expect(
                dbank.connect(user1).allocateForUser(1, tokens(6000))
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientUnallocated');
        });

        it('cannot allocate when fully allocated', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(5000));

            await expect(
                dbank.connect(user1).allocateForUser(1, tokens(1))
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientUnallocated');
        });

        it('user with no vault shares has maxWithdraw = 0', async () => {
            expect(await dbank.balanceOf(user1.address)).to.equal(0);
            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);
        });

        it('sequential withdrawals reduce unallocated correctly', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(4000));

            // unallocated ≈ 6000 (tiny yield between blocks)
            await dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address);
            const unalloc1 = await dbank.getUnallocated(user1.address);
            expect(unalloc1).to.be.closeTo(tokens(4000), tokens(1));

            await dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address);
            const unalloc2 = await dbank.getUnallocated(user1.address);
            expect(unalloc2).to.be.closeTo(tokens(2000), tokens(1));

            // Cannot withdraw more than remaining unallocated
            await expect(
                dbank.connect(user1).withdraw(tokens(3000), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');
        });

        it('transfer blocked if it would leave sender under-collateralized', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(6000));

            // Try to transfer 5000 shares (would leave 5000 shares worth of assets but 6000 allocated)
            await expect(
                dbank.connect(user1).transfer(user2.address, tokens(5000))
            ).to.be.revertedWithCustomError(dbank, 'dBank__AllocationTransferRestriction');

            // Transfer 4000 shares should succeed (leaves 6000 shares >= 6000 allocated)
            await expect(
                dbank.connect(user1).transfer(user2.address, tokens(4000))
            ).to.not.be.reverted;
        });
    });
});
