const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);

describe('Integration: Withdraw Cap (Buffer-Only Withdrawals)', () => {
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

        // Fund users and approve
        await token.transfer(user1.address, tokens(20000));
        await token.connect(user1).approve(dbank.address, tokens(20000));

        await token.transfer(user2.address, tokens(10000));
        await token.connect(user2).approve(dbank.address, tokens(10000));
    });

    describe('SUCCESS: Withdraw within buffer', () => {

        it('user withdraws full deposit when nothing is allocated to strategies', async () => {
            // User deposits 5000
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // Buffer should be 5000 (nothing allocated)
            expect(await dbank.buffer()).to.equal(tokens(5000));

            // maxWithdraw should equal user's full position
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(5000));

            // Withdraw succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(5000), user1.address, user1.address)
            ).to.not.be.reverted;

            // Buffer is now 0
            expect(await dbank.buffer()).to.equal(0);
            // User has no shares left
            expect(await dbank.balanceOf(user1.address)).to.equal(0);
        });

        it('user withdraws partial amount within buffer after owner allocates to strategy', async () => {
            // User deposits 5000
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // Owner allocates 3500 from buffer to strategy
            await dbank.connect(deployer).allocate(1, tokens(3500));

            // Buffer should be 1500
            expect(await dbank.buffer()).to.equal(tokens(1500));

            // maxWithdraw should be capped to buffer (1500)
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(1500));

            // Withdraw 1500 (exactly the buffer) succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(1500), user1.address, user1.address)
            ).to.not.be.reverted;

            // Buffer is now 0
            expect(await dbank.buffer()).to.equal(0);
        });

        it('maxWithdraw updates correctly after each withdrawal', async () => {
            // Two users deposit
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(user2).deposit(tokens(3000), user2.address);
            // Buffer = 8000

            // Owner allocates 5000 to strategy
            await dbank.connect(deployer).allocate(1, tokens(5000));
            // Buffer = 3000

            // user1 maxWithdraw = min(user1Assets=5000, buffer=3000) = 3000
            const maxW1Before = await dbank.maxWithdraw(user1.address);
            expect(maxW1Before).to.equal(tokens(3000));

            // user1 withdraws 2000
            await dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address);
            // Buffer = 1000

            // After withdrawal, maxWithdraw should update for both users
            const maxW1After = await dbank.maxWithdraw(user1.address);
            // user1 now has ~3000 in assets (withdrew 2000 from 5000), buffer = 1000
            // maxWithdraw = min(~3000, 1000) = 1000
            expect(maxW1After).to.equal(tokens(1000));

            const maxW2After = await dbank.maxWithdraw(user2.address);
            // user2 has 3000 in assets, buffer = 1000
            // maxWithdraw = min(3000, 1000) = 1000
            expect(maxW2After).to.equal(tokens(1000));
        });

        it('sequential withdrawals reduce buffer correctly', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            // Buffer = 5000

            // First withdrawal: 2000
            await dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address);
            expect(await dbank.buffer()).to.equal(tokens(3000));

            // Second withdrawal: 1500
            await dbank.connect(user1).withdraw(tokens(1500), user1.address, user1.address);
            expect(await dbank.buffer()).to.equal(tokens(1500));

            // Third withdrawal: 1500 (remaining buffer)
            await dbank.connect(user1).withdraw(tokens(1500), user1.address, user1.address);
            expect(await dbank.buffer()).to.equal(0);
        });
    });

    describe('FAILURE: Withdraw exceeding buffer', () => {

        it('reverts when withdrawal exceeds buffer (capital allocated to strategy)', async () => {
            // User deposits 5000
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // Owner allocates 3500 to strategy → buffer = 1500
            await dbank.connect(deployer).allocate(1, tokens(3500));
            expect(await dbank.buffer()).to.equal(tokens(1500));

            // Attempt to withdraw 2000 (exceeds buffer of 1500) should revert
            await expect(
                dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');
        });

        it('reverts when buffer is fully depleted', async () => {
            // User deposits 5000
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // Owner allocates all 5000 to strategy → buffer = 0
            await dbank.connect(deployer).allocate(1, tokens(5000));
            expect(await dbank.buffer()).to.equal(0);

            // maxWithdraw should be 0
            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);

            // Any withdrawal should revert
            await expect(
                dbank.connect(user1).withdraw(tokens(1), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');
        });

        it('reverts on second withdrawal when buffer is exhausted by first', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);

            // Owner allocates 4000 → buffer = 1000
            await dbank.connect(deployer).allocate(1, tokens(4000));

            // First withdrawal: 1000 (exhausts buffer)
            await expect(
                dbank.connect(user1).withdraw(tokens(1000), user1.address, user1.address)
            ).to.not.be.reverted;
            expect(await dbank.buffer()).to.equal(0);

            // Second withdrawal: any amount should revert
            await expect(
                dbank.connect(user1).withdraw(tokens(100), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');
        });

        it('maxWithdraw returns 0 when buffer is empty', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(deployer).allocate(1, tokens(5000));

            expect(await dbank.maxWithdraw(user1.address)).to.equal(0);
            expect(await dbank.maxRedeem(user1.address)).to.equal(0);
        });

        it('maxWithdraw correctly caps to buffer even with high user balance', async () => {
            // User deposits a large amount
            await dbank.connect(user1).deposit(tokens(10000), user1.address);

            // Allocate most to strategy, leave small buffer
            await dbank.connect(deployer).allocate(1, tokens(9500));
            expect(await dbank.buffer()).to.equal(tokens(500));

            // maxWithdraw should be 500 (buffer), not 10000 (user balance)
            const maxW = await dbank.maxWithdraw(user1.address);
            expect(maxW).to.equal(tokens(500));

            // Withdraw 500 succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(500), user1.address, user1.address)
            ).to.not.be.reverted;

            // Withdraw 1 more fails
            await expect(
                dbank.connect(user1).withdraw(tokens(1), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');
        });
    });

    describe('Edge cases', () => {

        it('perTxCap still applies even when buffer is larger', async () => {
            await dbank.connect(user1).deposit(tokens(10000), user1.address);
            // Buffer = 10000

            // Set perTxCap to 2000
            await dbank.setPerTxCap(tokens(2000));

            // maxWithdraw should be min(10000, 10000, 2000) = 2000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(2000));

            // Trying to withdraw 3000 should fail (exceeds perTxCap)
            await expect(
                dbank.connect(user1).withdraw(tokens(3000), user1.address, user1.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');

            // Withdraw 2000 succeeds
            await expect(
                dbank.connect(user1).withdraw(tokens(2000), user1.address, user1.address)
            ).to.not.be.reverted;
        });

        it('buffer cap takes precedence over perTxCap when buffer is smaller', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(deployer).allocate(1, tokens(4000));
            // Buffer = 1000, perTxCap = 1000000

            // maxWithdraw = min(5000, 1000, 1000000) = 1000
            expect(await dbank.maxWithdraw(user1.address)).to.equal(tokens(1000));
        });

        it('multiple users can withdraw from shared buffer until exhausted', async () => {
            await dbank.connect(user1).deposit(tokens(5000), user1.address);
            await dbank.connect(user2).deposit(tokens(3000), user2.address);
            // Buffer = 8000

            await dbank.connect(deployer).allocate(1, tokens(6000));
            // Buffer = 2000

            // user1 withdraws 1500
            await dbank.connect(user1).withdraw(tokens(1500), user1.address, user1.address);
            expect(await dbank.buffer()).to.equal(tokens(500));

            // user2 tries to withdraw 1000 — exceeds remaining buffer (500)
            await expect(
                dbank.connect(user2).withdraw(tokens(1000), user2.address, user2.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');

            // user2 withdraws 500 — exact buffer remaining
            await expect(
                dbank.connect(user2).withdraw(tokens(500), user2.address, user2.address)
            ).to.not.be.reverted;

            expect(await dbank.buffer()).to.equal(0);
        });
    });
});
