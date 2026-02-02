const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);
const YEAR = 365 * 24 * 3600;

describe('Integration Flow', () => {
    let token, configManager, strategyRouter, mockS1, dbank;
    let deployer, user;

    beforeEach(async () => {
        [deployer, user] = await ethers.getSigners();

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

        // Increase caps for integration flow amounts
        await dbank.setTvlCap(tokens(1000000));
        await dbank.setPerTxCap(tokens(1000000));

        // Fund user and approve dBank only
        await token.transfer(user.address, tokens(10000));
        await token.connect(user).approve(dbank.address, tokens(10000));
    });

    it('happy path: vault allocation earns yield, user withdraws up to buffer', async () => {
        // 1. User deposits 5000 to vault
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. Owner allocates 3500 from vault buffer to strategy
        await dbank.connect(deployer).allocate(1, tokens(3500));

        // Buffer should be 1500
        expect(await dbank.buffer()).to.equal(tokens(1500));

        // Record assets for shares before yield
        const shares = await dbank.balanceOf(user.address);
        const assetsBefore = await dbank.convertToAssets(shares);

        // 3. Advance time 1 year (strategy accrues 5% yield)
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // 4. Shares should represent more assets after yield accrual
        const assetsAfter = await dbank.convertToAssets(shares);
        expect(assetsAfter).to.be.gt(assetsBefore);

        // 5. maxWithdraw is capped to buffer (1500), not full position
        const maxW = await dbank.maxWithdraw(user.address);
        expect(maxW).to.equal(tokens(1500));

        // 6. Withdrawing more than buffer reverts
        await expect(
            dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
        ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');

        // 7. Withdraw within buffer succeeds
        await expect(
            dbank.connect(user).withdraw(tokens(1500), user.address, user.address)
        ).to.not.be.reverted;

        // Buffer is now 0
        expect(await dbank.buffer()).to.equal(0);
    });

    it('user allocates via dBank, withdrawal limited to unallocated', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy via dBank.allocateForUser
        await dbank.connect(user).allocateForUser(1, tokens(3500));

        // 3. maxWithdraw = unallocated = 1500
        expect(await dbank.maxWithdraw(user.address)).to.equal(tokens(1500));

        // 4. Can withdraw unallocated portion
        await expect(
            dbank.connect(user).withdraw(tokens(1500), user.address, user.address)
        ).to.not.be.reverted;

        // 5. Cannot withdraw more (0 unallocated remaining)
        expect(await dbank.maxWithdraw(user.address)).to.equal(0);
    });

    it('user allocates and unallocates, then withdraws full', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await dbank.connect(user).allocateForUser(1, tokens(3500));

        // 3. maxWithdraw = 1500
        expect(await dbank.maxWithdraw(user.address)).to.equal(tokens(1500));

        // 4. Unallocate 3500
        await dbank.connect(user).unallocateForUser(1, tokens(3500), 100);

        // 5. maxWithdraw = 5000 (fully unallocated)
        expect(await dbank.maxWithdraw(user.address)).to.equal(tokens(5000));

        // 6. Full withdrawal succeeds
        await expect(
            dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
        ).to.not.be.reverted;

        expect(await dbank.balanceOf(user.address)).to.equal(0);
    });

    it('un-allocate after yield accrual', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 via dBank
        await dbank.connect(user).allocateForUser(1, tokens(3500));

        // 3. Owner also allocates some buffer for vault-level yield
        await dbank.connect(deployer).allocate(1, tokens(500));
        // Buffer = 1000

        // 4. Advance time 1 year
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // 5. User un-allocates from strategy
        await dbank.connect(user).unallocateForUser(1, tokens(3500), 100);

        // 6. Now fully unallocated, but buffer may be limited
        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(0);

        // 7. maxWithdraw is capped by buffer
        const maxW = await dbank.maxWithdraw(user.address);
        const buffer = await dbank.buffer();
        expect(maxW).to.equal(buffer);

        // 8. Withdraw up to buffer succeeds
        await expect(
            dbank.connect(user).withdraw(maxW, user.address, user.address)
        ).to.not.be.reverted;
    });

    it('full flow: deposit → allocate → yield → withdraw → unallocate → withdraw (user-reported scenario)', async () => {
        // Exact replication of the user-reported scenario:
        // Deposit 5000, allocate 3500 to S1, advance 1 year (5% APR),
        // withdraw 1500 (unallocated), unallocate 3100, then withdraw remaining.

        // ---------- STEP 1: Deposit 5000 USDC ----------
        await dbank.connect(user).deposit(tokens(5000), user.address);

        expect(await dbank.buffer()).to.equal(tokens(5000));
        expect(await dbank.balanceOf(user.address)).to.equal(tokens(5000));
        expect(await dbank.totalSupply()).to.equal(tokens(5000));
        expect(await dbank.totalAssets()).to.equal(tokens(5000));

        // ---------- STEP 2: Allocate 3500 to Strategy 1 ----------
        await dbank.connect(user).allocateForUser(1, tokens(3500));

        expect(await dbank.buffer()).to.equal(tokens(1500));
        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(tokens(3500));
        expect(await dbank.getUserStrategyAllocation(user.address, 1)).to.equal(tokens(3500));
        expect(await dbank.getUnallocated(user.address)).to.equal(tokens(1500));
        expect(await dbank.maxWithdraw(user.address)).to.equal(tokens(1500));
        // totalAssets unchanged (tokens moved from buffer to strategy, not created)
        expect(await dbank.totalAssets()).to.equal(tokens(5000));

        // ---------- STEP 3: Advance blockchain 1 year (5% APR) ----------
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // MockS1 totalAssets ≈ 3500 * 1.05 = 3675
        const s1Assets = await mockS1.totalAssets();
        expect(s1Assets).to.be.closeTo(tokens(3675), tokens(1)); // ~5% yield

        // totalAssets = buffer(1500) + strategy(~3675) ≈ 5175
        const totalAssetsAfterYield = await dbank.totalAssets();
        expect(totalAssetsAfterYield).to.be.closeTo(tokens(5175), tokens(1));

        // PPS > 1 (yield accrued)
        const pps = await dbank.pricePerShare();
        expect(pps).to.be.gt(ethers.utils.parseUnits("1", 18));

        // User's total value ≈ 5175, allocated = 3500 (principal), unallocated ≈ 1675
        const unallocated = await dbank.getUnallocated(user.address);
        expect(unallocated).to.be.closeTo(tokens(1675), tokens(1));

        // maxWithdraw = min(unallocated≈1675, buffer=1500) = 1500
        expect(await dbank.maxWithdraw(user.address)).to.equal(tokens(1500));

        // ---------- STEP 4: Withdraw 1500 (full buffer / unallocated portion) ----------
        const sharesBefore = await dbank.balanceOf(user.address);
        await dbank.connect(user).withdraw(tokens(1500), user.address, user.address);

        const sharesAfter = await dbank.balanceOf(user.address);
        expect(sharesAfter).to.be.lt(sharesBefore);
        expect(await dbank.buffer()).to.equal(0);
        // User still has shares, but buffer is empty
        expect(await dbank.maxWithdraw(user.address)).to.equal(0);

        // Allocations unchanged
        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(tokens(3500));

        // ---------- STEP 5: Unallocate 3100 (partial, includes some yield) ----------
        // User's allocation value ≈ 3675, unallocating 3100 (less than full value)
        await dbank.connect(user).unallocateForUser(1, tokens(3100), 100);

        // principalToReduce = min(3100, 3500) = 3100
        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(tokens(400));
        expect(await dbank.getUserStrategyAllocation(user.address, 1)).to.equal(tokens(400));

        // Buffer replenished with 3100
        expect(await dbank.buffer()).to.equal(tokens(3100));

        // Strategy still has remaining assets (~575)
        const s1AssetsAfterUnalloc = await mockS1.totalAssets();
        expect(s1AssetsAfterUnalloc).to.be.closeTo(tokens(575), tokens(2));

        // Router tracking consistent with dBank
        expect(await strategyRouter.strategyAllocated(1)).to.equal(tokens(400));

        // totalAssets = buffer(3100) + strategy(~575) ≈ 3675
        const totalAssetsAfterUnalloc = await dbank.totalAssets();
        expect(totalAssetsAfterUnalloc).to.be.closeTo(tokens(3675), tokens(2));

        // PPS should still be > 1
        const ppsAfterUnalloc = await dbank.pricePerShare();
        expect(ppsAfterUnalloc).to.be.gt(ethers.utils.parseUnits("1", 18));

        // User's unallocated = ownerAssets - 400
        const ownerAssets = await dbank.convertToAssets(sharesAfter);
        const expectedUnallocated = ownerAssets.sub(tokens(400));
        const actualUnallocated = await dbank.getUnallocated(user.address);
        expect(actualUnallocated).to.equal(expectedUnallocated);

        // ---------- STEP 6: Verify maxWithdraw makes sense ----------
        // maxWithdraw = min(unallocated≈3275, buffer=3100) = 3100
        const maxW = await dbank.maxWithdraw(user.address);
        expect(maxW).to.equal(tokens(3100));

        // ---------- STEP 7: Withdraw remaining buffer (3100) ----------
        await dbank.connect(user).withdraw(tokens(3100), user.address, user.address);

        expect(await dbank.buffer()).to.equal(0);
        // User still has some shares (backing the remaining 400 allocated + strategy value)
        const finalShares = await dbank.balanceOf(user.address);
        expect(finalShares).to.be.gt(0);
        expect(await dbank.maxWithdraw(user.address)).to.equal(0); // buffer empty

        // totalAssets should equal remaining strategy value (~575)
        const finalTotalAssets = await dbank.totalAssets();
        expect(finalTotalAssets).to.be.closeTo(tokens(575), tokens(2));

        // User's shares worth ≈ 575 (= finalTotalAssets since they're the only depositor)
        const finalShareValue = await dbank.convertToAssets(finalShares);
        expect(finalShareValue).to.be.closeTo(tokens(575), tokens(2));

        // ---------- STEP 8: Unallocate remaining principal and withdraw ----------
        // Get remaining allocation (400 principal)
        const remainingAlloc = await dbank.getUserStrategyAllocation(user.address, 1);
        expect(remainingAlloc).to.equal(tokens(400));

        // Unallocate remaining principal (400)
        // Note: MockS1 yield is virtual — router only holds deposited principal tokens.
        // In production strategies (Aave, etc.), yield would be backed by real tokens.
        await dbank.connect(user).unallocateForUser(1, tokens(400), 100);

        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(0);
        expect(await dbank.buffer()).to.equal(tokens(400));

        // Now can withdraw the remaining buffer
        const finalMaxW = await dbank.maxWithdraw(user.address);
        expect(finalMaxW).to.equal(tokens(400));

        await dbank.connect(user).withdraw(finalMaxW, user.address, user.address);
        expect(await dbank.balanceOf(user.address)).to.equal(0);
        expect(await dbank.totalSupply()).to.equal(0);
    });

    it('allocateForUser is atomic: reverts if strategy deposit fails', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. Pause the strategy
        await mockS1.pause(true);

        // 3. allocateForUser should revert atomically
        await expect(
            dbank.connect(user).allocateForUser(1, tokens(3000))
        ).to.be.reverted;

        // 4. State unchanged: buffer and allocations unchanged
        expect(await dbank.buffer()).to.equal(tokens(5000));
        expect(await dbank.getUserTotalAllocated(user.address)).to.equal(0);
    });
});
