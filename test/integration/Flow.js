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

    it('happy path: vault allocation earns yield, user withdraws', async () => {
        // 1. User deposits 5000 to vault
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. Owner allocates 3500 from vault buffer to strategy
        await dbank.connect(deployer).allocate(1, tokens(3500));

        // Record assets for shares before yield
        const shares = await dbank.balanceOf(user.address);
        const assetsBefore = await dbank.convertToAssets(shares);

        // 3. Advance time 1 year (strategy accrues 5% yield)
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

        // User withdraws original deposit - vault auto-pulls from strategy
        await expect(
            dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
        ).to.not.be.reverted;
    });

    it('withdraw succeeds even when user has allocations (allocations are separate)', async () => {
        // 1. User deposits 5000
        await dbank.connect(user).deposit(tokens(5000), user.address);

        // 2. User allocates 3500 to strategy
        await strategyRouter.connect(user).depositToStrategy(1, tokens(3500));

        // 3. User can withdraw because strategy allocations don't block vault withdrawals
        await expect(
            dbank.connect(user).withdraw(tokens(2000), user.address, user.address)
        ).to.not.be.reverted;
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
