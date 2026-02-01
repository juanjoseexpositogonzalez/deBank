const { expect } = require('chai');
const { ethers } = require('hardhat');

// Helper to parse tokens with 18 decimals
const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);

describe('Integration: Withdraw After Allocation', () => {
    let token, dBank, strategyRouter, configManager, mockS1;
    let deployer, user;

    const INITIAL_SUPPLY = tokens(1000000);
    const DEPOSIT_AMOUNT = tokens(5000);
    const ALLOCATION_AMOUNT = tokens(4000);
    const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

    beforeEach(async () => {
        [deployer, user] = await ethers.getSigners();

        const Token = await ethers.getContractFactory('Token');
        token = await Token.deploy('USD Coin', 'USDC', INITIAL_SUPPLY);
        await token.deployed();

        const ConfigManager = await ethers.getContractFactory('ConfigManager');
        configManager = await ConfigManager.deploy();
        await configManager.deployed();

        const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address);
        await strategyRouter.deployed();

        const DBank = await ethers.getContractFactory('dBank');
        dBank = await DBank.deploy(
            token.address,
            'dBank USDC',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        );
        await dBank.deployed();

        await dBank.setTvlCap(tokens(10000000));
        await dBank.setPerTxCap(tokens(1000000));

        const MockS1 = await ethers.getContractFactory('MockS1');
        mockS1 = await MockS1.deploy(token.address);
        await mockS1.deployed();

        await mockS1.setParams(500, tokens(1000000));
        await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000));

        // Fund user and approve dBank
        await token.transfer(user.address, tokens(10000));
        await token.connect(user).approve(dBank.address, tokens(10000));
    });

    describe('Contract-enforced allocation-aware withdrawals', () => {

        it('maxWithdraw returns unallocated amount after allocating via dBank', async () => {
            // Deposit 5000 to dBank
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            expect(await dBank.balanceOf(user.address)).to.equal(DEPOSIT_AMOUNT);

            // Allocate 4000 via dBank.allocateForUser
            await dBank.connect(user).allocateForUser(1, ALLOCATION_AMOUNT);

            // Allocation tracking
            expect(await dBank.getUserTotalAllocated(user.address)).to.equal(ALLOCATION_AMOUNT);
            expect(await dBank.getUserStrategyAllocation(user.address, 1)).to.equal(ALLOCATION_AMOUNT);
            expect(await dBank.getUnallocated(user.address)).to.equal(tokens(1000));

            // maxWithdraw = unallocated = 1000
            const maxW = await dBank.maxWithdraw(user.address);
            expect(maxW).to.equal(tokens(1000));

            // Can withdraw unallocated portion
            await expect(
                dBank.connect(user).withdraw(tokens(1000), user.address, user.address)
            ).to.not.be.reverted;
        });

        it('cannot withdraw more than unallocated after allocating', async () => {
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            await dBank.connect(user).allocateForUser(1, ALLOCATION_AMOUNT);

            // Cannot withdraw 2000 (only 1000 unallocated)
            await expect(
                dBank.connect(user).withdraw(tokens(2000), user.address, user.address)
            ).to.be.revertedWithCustomError(dBank, 'dBank__CapExceeded');
        });

        it('yield accrual increases unallocated portion', async () => {
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            await dBank.connect(user).allocateForUser(1, ALLOCATION_AMOUNT);

            // Owner allocates vault buffer to strategy for yield
            await dBank.connect(deployer).allocate(1, tokens(500));

            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS]);
            await ethers.provider.send('evm_mine');

            // Total assets grew, user's ownerAssets grew, allocation stays at 4000
            const unallocated = await dBank.getUnallocated(user.address);
            expect(unallocated).to.be.gt(tokens(1000));
        });
    });

    describe('Unallocate then withdraw', () => {
        it('user can withdraw full deposit after un-allocating', async () => {
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            await dBank.connect(user).allocateForUser(1, ALLOCATION_AMOUNT);

            // maxWithdraw = 1000
            expect(await dBank.maxWithdraw(user.address)).to.equal(tokens(1000));

            // Unallocate all 4000
            await dBank.connect(user).unallocateForUser(1, ALLOCATION_AMOUNT, 100);

            // Now maxWithdraw = 5000
            expect(await dBank.maxWithdraw(user.address)).to.equal(DEPOSIT_AMOUNT);
            expect(await dBank.getUserTotalAllocated(user.address)).to.equal(0);

            // Full withdrawal succeeds
            await expect(
                dBank.connect(user).withdraw(DEPOSIT_AMOUNT, user.address, user.address)
            ).to.not.be.reverted;

            expect(await dBank.balanceOf(user.address)).to.equal(0);
        });

        it('partial unallocate increases maxWithdraw proportionally', async () => {
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            await dBank.connect(user).allocateForUser(1, ALLOCATION_AMOUNT);

            // Unallocate 2000 of the 4000
            await dBank.connect(user).unallocateForUser(1, tokens(2000), 100);

            // maxWithdraw = 5000 - 2000 = 3000
            expect(await dBank.maxWithdraw(user.address)).to.equal(tokens(3000));
            expect(await dBank.getUserTotalAllocated(user.address)).to.equal(tokens(2000));
        });
    });
});
