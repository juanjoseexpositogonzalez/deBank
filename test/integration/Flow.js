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

        // Fund user and approve
        await token.transfer(user.address, tokens(10000));
        await token.connect(user).approve(dbank.address, tokens(10000));
        await token.connect(user).approve(strategyRouter.address, tokens(10000));
    });

    it('happy path: un-allocate then withdraw after yield accrual', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await strategyRouter.connect(user).depositToStrategy(1, tokens(3500));

        // Record assets for shares before yield
        const shares = await dbank.balanceOf(user.address);
        const assetsBefore = await dbank.convertToAssets(shares);

        // 3. Advance time 1 year
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // 4. Shares should represent more assets after yield accrual
        const assetsAfter = await dbank.convertToAssets(shares);
        expect(assetsAfter).to.be.gt(assetsBefore);

        // Provide router liquidity to cover virtual yield
        const principal = await mockS1.principal();
        const strategyTotalAssets = await mockS1.totalAssets();
        const yieldAmount = strategyTotalAssets.sub(principal);
        if (yieldAmount.gt(0)) {
            await token.transfer(strategyRouter.address, yieldAmount);
        }

        // User un-allocates from strategy
        await strategyRouter.connect(user).withdrawFromStrategy(1, strategyTotalAssets, 100);

        // User withdraws from vault successfully
        await expect(
            dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
        ).to.not.be.reverted;
    });

    it('fail path: withdraw blocked while user has allocations', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await strategyRouter.connect(user).depositToStrategy(1, tokens(3500));

        // 3. User tries to withdraw more than unallocated shares
        await expect(
            dbank.connect(user).withdraw(tokens(2000), user.address, user.address)
        ).to.be.revertedWithCustomError(dbank, 'dBank__SharesAllocated');
    });

    it('un-allocate then withdraw shares after yield accrual', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await strategyRouter.connect(user).depositToStrategy(1, tokens(3500));

        // 3. Advance time 1 year
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // Provide router liquidity to cover virtual yield
        const principal = await mockS1.principal();
        const strategyTotalAssets = await mockS1.totalAssets();
        const yieldAmount = strategyTotalAssets.sub(principal);
        if (yieldAmount.gt(0)) {
            await token.transfer(strategyRouter.address, yieldAmount);
        }

        // 4. User un-allocates from strategy (withdraws full position)
        await strategyRouter.connect(user).withdrawFromStrategy(1, strategyTotalAssets, 100);

        // 5. User withdraws from vault successfully
        await expect(
            dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
        ).to.not.be.reverted;
    });

    it('un-allocate then withdraw assets (explicit withdraw flow)', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await strategyRouter.connect(user).depositToStrategy(1, tokens(3500));

        // 3. Advance time 1 year
        await ethers.provider.send('evm_increaseTime', [YEAR]);
        await ethers.provider.send('evm_mine', []);

        // Provide router liquidity to cover virtual yield
        const principal = await mockS1.principal();
        const strategyTotalAssets = await mockS1.totalAssets();
        const yieldAmount = strategyTotalAssets.sub(principal);
        if (yieldAmount.gt(0)) {
            await token.transfer(strategyRouter.address, yieldAmount);
        }

        // 4. User un-allocates from strategy
        await strategyRouter.connect(user).withdrawFromStrategy(1, strategyTotalAssets, 100);

        // 5. Withdraw a partial amount (assets-based withdrawal)
        await expect(
            dbank.connect(user).withdraw(tokens(1500), user.address, user.address)
        ).to.not.be.reverted;
    });
});
