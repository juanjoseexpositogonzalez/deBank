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
