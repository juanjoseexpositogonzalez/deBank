const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);
const YEAR = 365 * 24 * 3600;

// Tolerance for rounding: 1e12 wei = 0.000001 USDC (single-user)
const DUST = ethers.BigNumber.from('1000000000000');
// Multi-user scenarios have slightly higher rounding from compound PPS divisions
const DUST_MULTI = ethers.BigNumber.from('10000000000000'); // 1e13 = 0.00001 USDC

describe('Integration: Full Withdraw Cycle (deposit -> allocate -> withdraw -> unallocate -> withdraw)', () => {
    let token, configManager, strategyRouter, mockS1, dbank;
    let deployer, user1;

    beforeEach(async () => {
        [deployer, user1] = await ethers.getSigners();

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

        // Fund user and approve dBank
        await token.transfer(user1.address, tokens(100000));
        await token.connect(user1).approve(dbank.address, tokens(100000));
    });

    // =========================================================
    // Exact user workflow: deposit 3000 -> allocate 2500 ->
    // withdraw 500 -> unallocate 2500 -> withdraw 2500
    // =========================================================

    describe('Immediate cycle (no time advancement)', () => {
        it('user ends with 0 shares and 0 balance after full cycle', async () => {
            const walletBefore = await token.balanceOf(user1.address);

            // Step 1: Deposit 3000
            await dbank.connect(user1).deposit(tokens(3000), user1.address);

            let shares = await dbank.balanceOf(user1.address);
            let totalAssets = await dbank.totalAssets();
            let buffer = await dbank.buffer();
            expect(shares).to.equal(tokens(3000));
            expect(totalAssets).to.equal(tokens(3000));
            expect(buffer).to.equal(tokens(3000));

            // Step 2: Allocate 2500 to S1
            await dbank.connect(user1).allocateForUser(1, tokens(2500));

            shares = await dbank.balanceOf(user1.address);
            buffer = await dbank.buffer();
            totalAssets = await dbank.totalAssets();
            const allocated = await dbank.getUserTotalAllocated(user1.address);

            expect(shares).to.equal(tokens(3000));
            expect(buffer).to.equal(tokens(500));
            expect(allocated).to.equal(tokens(2500));

            // Step 3: Withdraw 500 USDC
            const maxW = await dbank.maxWithdraw(user1.address);
            // maxWithdraw limited by buffer (500) and unallocated (ownerAssets - 2500)
            expect(maxW).to.be.closeTo(tokens(500), DUST);

            await dbank.connect(user1).withdraw(tokens(500), user1.address, user1.address);

            buffer = await dbank.buffer();
            expect(buffer).to.equal(tokens(0));

            // Step 4: Unallocate 2500 from S1
            await dbank.connect(user1).unallocateForUser(1, tokens(2500), 50);

            const allocatedAfter = await dbank.getUserTotalAllocated(user1.address);
            buffer = await dbank.buffer();
            totalAssets = await dbank.totalAssets();

            expect(allocatedAfter).to.equal(tokens(0));
            expect(buffer).to.equal(tokens(2500));
            // totalAssets may have tiny rounding from MockS1 yield between blocks
            expect(totalAssets).to.be.closeTo(tokens(2500), DUST);

            // Step 5: Withdraw 2500 USDC
            const maxW2 = await dbank.maxWithdraw(user1.address);
            expect(maxW2).to.be.closeTo(tokens(2500), DUST);

            await dbank.connect(user1).withdraw(maxW2, user1.address, user1.address);

            // Final state: everything should be 0 or near-0
            shares = await dbank.balanceOf(user1.address);
            buffer = await dbank.buffer();
            totalAssets = await dbank.totalAssets();
            const totalSupply = await dbank.totalSupply();
            const finalMaxW = await dbank.maxWithdraw(user1.address);

            expect(shares).to.equal(0);
            expect(buffer).to.equal(0);
            expect(totalSupply).to.equal(0);
            expect(finalMaxW).to.equal(0);
            // totalAssets could be near-0 from MockS1 rounding dust
            expect(totalAssets).to.be.closeTo(ethers.BigNumber.from(0), DUST);

            // User got all their money back
            const walletAfter = await token.balanceOf(user1.address);
            expect(walletAfter).to.equal(walletBefore);
        });
    });

    describe('Cycle with yield accrual (1 year time advancement)', () => {
        it('full cycle ends with 0 shares/balance even after yield accrual', async () => {
            const walletBefore = await token.balanceOf(user1.address);

            // Step 1: Deposit 3000
            await dbank.connect(user1).deposit(tokens(3000), user1.address);

            // Step 2: Allocate 2500 to S1
            await dbank.connect(user1).allocateForUser(1, tokens(2500));

            // Advance time by 1 year (5% APR on 2500 -> ~125 USDC yield)
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // Verify yield accrued
            const strategyAssets = await mockS1.totalAssets();
            expect(strategyAssets).to.be.gt(tokens(2600));

            // PPS should be > 1 (yield increased totalAssets but not totalSupply)
            const pps = await dbank.pricePerShare();
            expect(pps).to.be.gt(ethers.utils.parseUnits('1', 18));

            // Step 3: Withdraw 500 USDC
            // maxWithdraw capped by buffer (500)
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(500));

            await dbank.connect(user1).withdraw(tokens(500), user1.address, user1.address);

            // Because PPS > 1, fewer than 500 shares are burned
            let shares = await dbank.balanceOf(user1.address);
            expect(shares).to.be.gt(tokens(2500));

            let buffer = await dbank.buffer();
            expect(buffer).to.equal(0);

            // Step 4: Unallocate 2500 from S1
            await dbank.connect(user1).unallocateForUser(1, tokens(2500), 50);

            buffer = await dbank.buffer();
            expect(buffer).to.equal(tokens(2500));

            // router.userTotalAssets(dBank) = 0 because strategyAllocated[1] = 0
            const routerAssets = await strategyRouter.userTotalAssets(dbank.address);
            expect(routerAssets).to.equal(0);

            // totalAssets = buffer(2500) + router(0) = 2500
            const totalAssets = await dbank.totalAssets();
            expect(totalAssets).to.equal(tokens(2500));

            // Step 5: Withdraw 2500 USDC
            const maxW2 = await dbank.maxWithdraw(user1.address);
            expect(maxW2).to.equal(tokens(2500));

            await dbank.connect(user1).withdraw(tokens(2500), user1.address, user1.address);

            // Final state: all zero
            shares = await dbank.balanceOf(user1.address);
            buffer = await dbank.buffer();
            const finalTotalAssets = await dbank.totalAssets();
            const totalSupply = await dbank.totalSupply();
            const finalMaxW = await dbank.maxWithdraw(user1.address);

            expect(buffer).to.equal(0);
            expect(totalSupply).to.equal(0);
            expect(shares).to.equal(0);
            expect(finalMaxW).to.equal(0);
            // totalAssets could be near-0 (MockS1 residual principal from rounding)
            expect(finalTotalAssets).to.be.closeTo(ethers.BigNumber.from(0), DUST);

            // User got exactly 3000 back (yield stays as dust in strategy)
            const walletAfter = await token.balanceOf(user1.address);
            expect(walletAfter).to.equal(walletBefore);
        });

        it('maxWithdraw returns correct value at each step with yield', async () => {
            // Step 1: Deposit 3000
            await dbank.connect(user1).deposit(tokens(3000), user1.address);

            // Step 2: Allocate 2500
            await dbank.connect(user1).allocateForUser(1, tokens(2500));

            // maxWithdraw = min(unallocated, buffer, perTxCap) = min(500, 500, 1M) = 500
            let maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(500));

            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);

            // After yield: ownerAssets = shares * totalAssets / totalSupply > 3000
            // unallocated = ownerAssets - 2500 > 500
            // But buffer is still 500, so maxWithdraw = 500
            maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(500));

            // Step 3: Withdraw 500
            await dbank.connect(user1).withdraw(tokens(500), user1.address, user1.address);

            // maxWithdraw = 0 (buffer empty)
            maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(0);

            // Step 4: Unallocate 2500
            await dbank.connect(user1).unallocateForUser(1, tokens(2500), 50);

            // maxWithdraw = min(unallocated=ownerAssets, buffer=2500, perTxCap) = 2500
            maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(2500));

            // Step 5: Withdraw 2500
            await dbank.connect(user1).withdraw(tokens(2500), user1.address, user1.address);

            maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(0);
        });
    });

    describe('Multiple rounds of allocate-unallocate', () => {
        it('three rounds of allocate/unallocate then full withdrawal leaves 0', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            for (let round = 0; round < 3; round++) {
                await dbank.connect(user1).allocateForUser(1, tokens(1000));

                // Advance some time
                await ethers.provider.send('evm_increaseTime', [30 * 24 * 3600]); // 30 days
                await ethers.provider.send('evm_mine', []);

                await dbank.connect(user1).unallocateForUser(1, tokens(1000), 50);
            }

            // Withdraw max
            const maxW = await dbank.maxWithdraw(user1.address);
            await dbank.connect(user1).withdraw(maxW, user1.address, user1.address);

            // After full withdrawal, user should have 0 shares
            expect(await dbank.balanceOf(user1.address)).to.equal(0);
            expect(await dbank.totalSupply()).to.equal(0);
            expect(await dbank.buffer()).to.equal(0);
            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);
        });
    });

    describe('Two users with independent allocations', () => {
        let user2;

        beforeEach(async () => {
            [, , user2] = await ethers.getSigners();
            await token.transfer(user2.address, tokens(100000));
            await token.connect(user2).approve(dbank.address, tokens(100000));
        });

        it('user1 full cycle while user2 has active allocation', async () => {
            // User2 deposits and allocates
            await dbank.connect(user2).deposit(tokens(5000), user2.address);
            await dbank.connect(user2).allocateForUser(1, tokens(3000));

            // Advance time
            await ethers.provider.send('evm_increaseTime', [90 * 24 * 3600]); // 90 days
            await ethers.provider.send('evm_mine', []);

            // User1 does the exact cycle: deposit 3000, allocate 2500, withdraw 500,
            // unallocate 2500, withdraw remaining
            await dbank.connect(user1).deposit(tokens(3000), user1.address);
            await dbank.connect(user1).allocateForUser(1, tokens(2500));

            // Advance more time
            await ethers.provider.send('evm_increaseTime', [30 * 24 * 3600]); // 30 days
            await ethers.provider.send('evm_mine', []);

            // User1 withdraws 500
            const maxW1 = await dbank.maxWithdraw(user1.address);
            const withdrawAmount1 = maxW1.lt(tokens(500)) ? maxW1 : tokens(500);
            await dbank.connect(user1).withdraw(withdrawAmount1, user1.address, user1.address);

            // User1 unallocates 2500
            await dbank.connect(user1).unallocateForUser(1, tokens(2500), 50);

            // User1 withdraws remaining
            const maxW2 = await dbank.maxWithdraw(user1.address);
            if (maxW2.gt(0)) {
                await dbank.connect(user1).withdraw(maxW2, user1.address, user1.address);
            }

            // User1 should have 0 or near-0 shares
            // In multi-user scenarios, integer division rounding can leave
            // dust shares (< 0.00001 USDC) — this is expected ERC-4626 behavior
            const user1FinalShares = await dbank.balanceOf(user1.address);
            const user1FinalMaxW = await dbank.maxWithdraw(user1.address);
            expect(user1FinalShares).to.be.closeTo(ethers.BigNumber.from(0), DUST_MULTI);
            expect(user1FinalMaxW).to.be.closeTo(ethers.BigNumber.from(0), DUST_MULTI);

            // User2 still has their deposit + allocations
            expect(await dbank.balanceOf(user2.address)).to.be.gt(0);
            expect(await dbank.getUserTotalAllocated(user2.address)).to.equal(tokens(3000));
        });
    });
});
