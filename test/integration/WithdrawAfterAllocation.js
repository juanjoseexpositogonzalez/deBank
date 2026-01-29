const { expect } = require('chai');
const { ethers } = require('hardhat');

// Helper to parse tokens with 18 decimals
const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);

describe('Integration: Withdraw After Allocation Bug', () => {
    let token, dBank, strategyRouter, configManager, mockS1;
    let deployer, user;
    
    const INITIAL_SUPPLY = tokens(1000000);
    const DEPOSIT_AMOUNT = tokens(5000);
    const ALLOCATION_AMOUNT = tokens(4000);
    const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

    beforeEach(async () => {
        [deployer, user] = await ethers.getSigners();

        // Deploy Token (18 decimals)
        const Token = await ethers.getContractFactory('Token');
        token = await Token.deploy('USD Coin', 'USDC', INITIAL_SUPPLY);
        await token.deployed();

        // Deploy ConfigManager
        const ConfigManager = await ethers.getContractFactory('ConfigManager');
        configManager = await ConfigManager.deploy();
        await configManager.deployed();

        // Deploy StrategyRouter
        const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address);
        await strategyRouter.deployed();

        // Deploy dBank
        const DBank = await ethers.getContractFactory('dBank');
        dBank = await DBank.deploy(
            token.address,
            'dBank USDC',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        );
        await dBank.deployed();
        
        // Configure dBank caps for 18 decimal tokens
        await dBank.setTvlCap(tokens(10000000)); // 10M cap
        await dBank.setPerTxCap(tokens(1000000)); // 1M per tx cap

        // Deploy MockS1 strategy
        const MockS1 = await ethers.getContractFactory('MockS1');
        mockS1 = await MockS1.deploy(token.address);
        await mockS1.deployed();

        // Configure MockS1 with 5% APR and high cap
        await mockS1.setParams(500, tokens(1000000)); // 500 bps = 5% APR

        // Register MockS1 in StrategyRouter
        await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000));

        // Transfer tokens to user for testing
        await token.transfer(user.address, tokens(10000));
    });

    describe('Bug Reproduction: User cannot withdraw unallocated funds', () => {
        
        it('should allow user to withdraw unallocated funds after allocating to strategy', async () => {
            // Step 1: User deposits 5000 USDC to dBank
            await token.connect(user).approve(dBank.address, DEPOSIT_AMOUNT);
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            
            const sharesAfterDeposit = await dBank.balanceOf(user.address);
            console.log('Shares after deposit:', ethers.utils.formatUnits(sharesAfterDeposit, 18));
            expect(sharesAfterDeposit).to.equal(DEPOSIT_AMOUNT); // 1:1 initially
            
            // Step 2: User allocates 4000 USDC to strategy S1 (from their wallet, NOT from dBank)
            // User needs tokens in their wallet to allocate
            await token.connect(user).approve(strategyRouter.address, ALLOCATION_AMOUNT);
            await strategyRouter.connect(user).depositToStrategy(1, ALLOCATION_AMOUNT);
            
            const userAllocated = await strategyRouter.getUserTotalAllocated(user.address);
            console.log('User total allocated:', ethers.utils.formatUnits(userAllocated, 18));
            expect(userAllocated).to.equal(ALLOCATION_AMOUNT);
            
            // User's shares in dBank should be unchanged (allocation is separate)
            const sharesAfterAllocation = await dBank.balanceOf(user.address);
            console.log('Shares after allocation:', ethers.utils.formatUnits(sharesAfterAllocation, 18));
            expect(sharesAfterAllocation).to.equal(DEPOSIT_AMOUNT);
            
            // Step 3: Advance blockchain 1 year to accrue yield
            await ethers.provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS]);
            await ethers.provider.send('evm_mine');
            
            // Check strategy has accrued yield
            const strategyAssets = await mockS1.totalAssets();
            console.log('Strategy total assets after 1 year:', ethers.utils.formatUnits(strategyAssets, 18));
            expect(strategyAssets).to.be.gt(ALLOCATION_AMOUNT); // Should have grown with 5% APR
            
            // Check dBank total assets and PPS
            const totalAssets = await dBank.totalAssets();
            const totalSupply = await dBank.totalSupply();
            const pps = totalAssets.mul(ethers.utils.parseUnits('1', 18)).div(totalSupply);
            console.log('dBank total assets:', ethers.utils.formatUnits(totalAssets, 18));
            console.log('dBank total supply:', ethers.utils.formatUnits(totalSupply, 18));
            console.log('dBank PPS:', ethers.utils.formatUnits(pps, 18));
            
            // Step 4: User tries to withdraw their unallocated funds (1000 USDC worth)
            // According to the frontend model: unallocated = 5000 shares - 4000 allocated = 1000
            // But the contract calculates differently using convertToShares
            
            const unallocatedValue = DEPOSIT_AMOUNT.sub(ALLOCATION_AMOUNT); // 1000 USDC
            console.log('Expected unallocated value:', ethers.utils.formatUnits(unallocatedValue, 18));
            
            // Calculate what the contract thinks is unallocated
            const allocatedSharesContractView = await dBank.convertToShares(userAllocated);
            const unallocatedSharesContractView = sharesAfterAllocation.sub(allocatedSharesContractView);
            console.log('Contract view - allocated shares:', ethers.utils.formatUnits(allocatedSharesContractView, 18));
            console.log('Contract view - unallocated shares:', ethers.utils.formatUnits(unallocatedSharesContractView, 18));
            
            // Convert unallocated shares to assets to see max withdrawable
            const maxWithdrawableAssets = await dBank.convertToAssets(unallocatedSharesContractView);
            console.log('Max withdrawable assets (contract view):', ethers.utils.formatUnits(maxWithdrawableAssets, 18));
            
            // THIS IS THE BUG: User should be able to withdraw 1000 USDC 
            // (their unallocated deposit), but the contract may reject it
            
            // Try to withdraw the unallocated funds
            // The user deposited 5000 USDC to dBank and allocated 4000 from wallet
            // So they should be able to withdraw all 5000 from dBank
            // But the contract incorrectly links the allocation to the dBank shares
            
            console.log('\n--- Attempting withdrawal ---');
            console.log('Attempting to withdraw:', ethers.utils.formatUnits(unallocatedValue, 18), 'USDC');
            
            // This should succeed but may fail due to the bug
            await expect(
                dBank.connect(user).withdraw(unallocatedValue, user.address, user.address)
            ).to.not.be.reverted;
            
            // Verify withdrawal succeeded
            const sharesAfterWithdraw = await dBank.balanceOf(user.address);
            console.log('Shares after withdraw:', ethers.utils.formatUnits(sharesAfterWithdraw, 18));
            
            const userTokenBalance = await token.balanceOf(user.address);
            console.log('User token balance after withdraw:', ethers.utils.formatUnits(userTokenBalance, 18));
        });
        
        it('should show the bug: contract rejects valid withdrawal', async () => {
            // Same setup as above
            await token.connect(user).approve(dBank.address, DEPOSIT_AMOUNT);
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            
            await token.connect(user).approve(strategyRouter.address, ALLOCATION_AMOUNT);
            await strategyRouter.connect(user).depositToStrategy(1, ALLOCATION_AMOUNT);
            
            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS]);
            await ethers.provider.send('evm_mine');
            
            // Log the state
            const userShares = await dBank.balanceOf(user.address);
            const userAllocated = await strategyRouter.getUserTotalAllocated(user.address);
            const totalAssets = await dBank.totalAssets();
            const totalSupply = await dBank.totalSupply();
            
            console.log('\n--- State after 1 year ---');
            console.log('User shares in dBank:', ethers.utils.formatUnits(userShares, 18));
            console.log('User allocated to strategies:', ethers.utils.formatUnits(userAllocated, 18));
            console.log('dBank total assets:', ethers.utils.formatUnits(totalAssets, 18));
            console.log('dBank total supply:', ethers.utils.formatUnits(totalSupply, 18));
            
            // Calculate what contract thinks
            const allocatedShares = await dBank.convertToShares(userAllocated);
            const unallocatedShares = userShares.gt(allocatedShares) 
                ? userShares.sub(allocatedShares) 
                : ethers.BigNumber.from(0);
            
            console.log('\n--- Contract calculation ---');
            console.log('allocatedShares = convertToShares(4000):', ethers.utils.formatUnits(allocatedShares, 18));
            console.log('unallocatedShares = 5000 - allocatedShares:', ethers.utils.formatUnits(unallocatedShares, 18));
            
            // Max the user can withdraw according to contract
            const maxWithdrawable = await dBank.convertToAssets(unallocatedShares);
            console.log('Max withdrawable (contract):', ethers.utils.formatUnits(maxWithdrawable, 18));
            
            // What user SHOULD be able to withdraw (full deposit since allocation is separate)
            console.log('What user should be able to withdraw: 5000 USDC (full deposit)');
            
            // Try to withdraw 1000 USDC (the "unallocated" amount in frontend model)
            const withdrawAmount = tokens(1000);
            const sharesToBurn = await dBank.convertToShares(withdrawAmount);
            
            console.log('\n--- Withdrawal attempt ---');
            console.log('Withdraw amount:', ethers.utils.formatUnits(withdrawAmount, 18), 'USDC');
            console.log('Shares to burn:', ethers.utils.formatUnits(sharesToBurn, 18));
            console.log('Unallocated shares:', ethers.utils.formatUnits(unallocatedShares, 18));
            console.log('Will revert?', sharesToBurn.gt(unallocatedShares) ? 'YES (BUG!)' : 'NO');
            
            if (sharesToBurn.gt(unallocatedShares)) {
                // This demonstrates the bug
                await expect(
                    dBank.connect(user).withdraw(withdrawAmount, user.address, user.address)
                ).to.be.revertedWithCustomError(dBank, 'dBank__SharesAllocated');
                
                console.log('\n*** BUG CONFIRMED: Valid withdrawal was rejected ***');
            } else {
                // If it doesn't revert, the calculation shows no bug in this scenario
                await dBank.connect(user).withdraw(withdrawAmount, user.address, user.address);
                console.log('\nWithdrawal succeeded');
            }
        });
    });
    
    describe('Expected behavior after fix', () => {
        it('user should be able to withdraw full deposit regardless of strategy allocations', async () => {
            // User deposits 5000 to dBank
            await token.connect(user).approve(dBank.address, DEPOSIT_AMOUNT);
            await dBank.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            
            // User allocates 4000 from wallet to strategy (NOT from dBank)
            await token.connect(user).approve(strategyRouter.address, ALLOCATION_AMOUNT);
            await strategyRouter.connect(user).depositToStrategy(1, ALLOCATION_AMOUNT);
            
            // Advance 1 year
            await ethers.provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS]);
            await ethers.provider.send('evm_mine');
            
            // User should be able to withdraw their original deposit (5000 USDC)
            // The shares are worth more now due to yield, but we withdraw the original amount
            const userShares = await dBank.balanceOf(user.address);
            
            console.log('User shares:', ethers.utils.formatUnits(userShares, 18));
            console.log('Original deposit:', ethers.utils.formatUnits(DEPOSIT_AMOUNT, 18));
            
            // Withdraw the original deposit amount
            // After the fix, this should NOT revert with SharesAllocated
            await expect(
                dBank.connect(user).withdraw(DEPOSIT_AMOUNT, user.address, user.address)
            ).to.not.be.reverted;
            
            console.log('SUCCESS: User withdrew full original deposit');
            
            // Verify the withdrawal
            const userTokenBalance = await token.balanceOf(user.address);
            console.log('User token balance after withdraw:', ethers.utils.formatUnits(userTokenBalance, 18));
            expect(userTokenBalance).to.be.gte(DEPOSIT_AMOUNT);
        });
    });
});
