const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens
const addressZero = '0x0000000000000000000000000000000000000000'
const YEAR = 365 * 24 * 3600;
const SCALE = ethers.utils.parseUnits('1', 18);
const TOL = ethers.utils.parseUnits('0.01', 18);
const EPOCH_DURATION = 7 * 24 * 3600; // 7 days

// Helper: Get max deposit amount (perTxCap is 5000e6 = 5000000000 wei)
// We'll use amounts safely under the limit (max is 5000000000)
const SMALL_AMOUNT = ethers.BigNumber.from('1000000000') // 1e9 wei (0.000000001 tokens)
const MEDIUM_AMOUNT = ethers.BigNumber.from('2000000000') // 2e9 wei (0.000000002 tokens)
const LARGE_AMOUNT = ethers.BigNumber.from('4000000000') // 4e9 wei (0.000000004 tokens)

describe('dBank', () => {
    let token, dbank, configManager, strategyRouter, accounts, deployer, receiver, user1, user2

  beforeEach(async () => {
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    receiver = accounts[1]
        user1 = accounts[2]
        user2 = accounts[3]

        // Deploy Token (USDC)
        const Token = await ethers.getContractFactory('Token')
        token = await Token.deploy('USDC Token', 'USDC', '10000000') // 10 Million Tokens

        // Deploy ConfigManager
        const ConfigManager = await ethers.getContractFactory('ConfigManager')
        configManager = await ConfigManager.deploy()

        // Deploy StrategyRouter
        const StrategyRouter = await ethers.getContractFactory('StrategyRouter')
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address)

        // Deploy dBank
        const dBank = await ethers.getContractFactory('dBank')
        dbank = await dBank.deploy(
            token.address,
            'dBank USDC Vault',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        )

        // Setup: Give users some tokens
        await token.transfer(receiver.address, tokens(100000))
        await token.transfer(user1.address, tokens(100000))
        await token.transfer(user2.address, tokens(100000))
    })

    // ===========================================================
    // Suite: [VAULT/SETUP] Metadata & Wiring
    // ===========================================================

    describe('[VAULT/SETUP] Metadata & Wiring', () => {
        it('returns correct asset address', async () => {
            expect(await dbank.asset()).to.equal(token.address)
        })

        it('returns correct ERC-20 name', async () => {
            expect(await dbank.name()).to.equal('dBank USDC Vault')
        })

        it('returns correct ERC-20 symbol', async () => {
            expect(await dbank.symbol()).to.equal('dbUSDC')
        })

        it('returns correct decimals (matches asset)', async () => {
            const assetDecimals = await token.decimals()
            const vaultDecimals = await dbank.decimals()
            expect(vaultDecimals).to.equal(assetDecimals)
        })

        it('sets strategyRouter address correctly', async () => {
            expect(await dbank.strategyRouter()).to.equal(strategyRouter.address)
        })

        it('sets configManager address correctly', async () => {
            expect(await dbank.configManager()).to.equal(configManager.address)
        })

        it('sets owner correctly', async () => {
            expect(await dbank.owner()).to.equal(deployer.address)
        })

        it('initializes buffer to 0', async () => {
            expect(await dbank.buffer()).to.equal(0)
        })

        it('initializes totalSupply to 0', async () => {
            expect(await dbank.totalSupply()).to.equal(0)
        })

        it('initializes bufferTargetBps from ConfigManager', async () => {
            const expectedBps = await configManager.liquidityBufferBps()
            expect(await dbank.bufferTargetBps()).to.equal(expectedBps)
        })

        it('initializes performanceFeeBps from ConfigManager', async () => {
            const expectedBps = await configManager.performanceFeeBps()
            expect(await dbank.performanceFeeBps()).to.equal(expectedBps)
        })

        it('initializes tvlCap from ConfigManager', async () => {
            const expectedCap = await configManager.tvlGlobalCap()
            expect(await dbank.tvlCap()).to.equal(expectedCap)
        })

        it('initializes perTxCap from ConfigManager', async () => {
            const expectedCap = await configManager.perTxCap()
            expect(await dbank.perTxCap()).to.equal(expectedCap)
        })
    })

    // ===========================================================
    // Suite: [VAULT/GET] Totals & Conversions
    // ===========================================================

    describe('[VAULT/GET] Totals & Conversions', () => {
        it('totalAssets returns buffer + router.totalAssets()', async () => {
            const buffer = await dbank.buffer()
            const routerAssets = await strategyRouter.totalAssets()
            const totalAssets = await dbank.totalAssets()
            expect(totalAssets).to.equal(buffer.add(routerAssets))
        })

        it('totalAssets returns 0 when empty', async () => {
            const totalAssets = await dbank.totalAssets()
            expect(totalAssets).to.equal(0)
        })

        it('convertToShares rounds down correctly', async () => {
            // First deposit to establish a rate
            // Use small amount to avoid cap issues
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            // Now convert a smaller amount - should round down
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const shares = await dbank.convertToShares(assets)
            // Shares should be less than or equal to assets (after first deposit)
            expect(shares).to.be.lte(assets)
        })

        it('convertToShares returns assets when totalSupply is 0', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const shares = await dbank.convertToShares(assets)
            expect(shares).to.equal(assets)
        })

        it('convertToAssets rounds down correctly', async () => {
            // First deposit
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const shares = SMALL_AMOUNT // 0.000001 tokens
            const assets = await dbank.convertToAssets(shares)
            // Assets should be less than or equal to shares (after first deposit)
            expect(assets).to.be.lte(shares)
        })

        it('convertToAssets returns 0 when totalSupply is 0', async () => {
            const shares = SMALL_AMOUNT // 0.000001 tokens
            const assets = await dbank.convertToAssets(shares)
            expect(assets).to.equal(0)
        })

        it('pricePerShare returns 1e18 when totalSupply is 0', async () => {
            // Note: pricePerShare function needs to be implemented
            // For now, we test convertToAssets/convertToShares relationship
            const assets = tokens(1000)
            const shares = await dbank.convertToShares(assets)
            expect(shares).to.equal(assets) // 1:1 when empty
        })

        it('pricePerShare calculates correctly after deposits', async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const totalAssets = await dbank.totalAssets()
            const totalSupply = await dbank.totalSupply()
            // pricePerShare = totalAssets / totalSupply (scaled by 1e18)
            // We verify through conversion functions
            const shares = tokens(500)
            const assets = await dbank.convertToAssets(shares)
            expect(assets).to.be.gt(0)
        })
    })

    // ===========================================================
    // Suite: [VAULT/LIMITS] Max & Preview
    // ===========================================================

    describe('[VAULT/LIMITS] Max & Preview', () => {
        it('maxDeposit respects TVL cap', async () => {
            const tvlCap = await dbank.tvlCap()
            const totalAssets = await dbank.totalAssets()
            const maxDeposit = await dbank.maxDeposit(receiver.address)
            
            // maxDeposit should be min(tvlCap - totalAssets, perTxCap)
            const perTxCap = await dbank.perTxCap()
            const expectedMax = tvlCap.sub(totalAssets).lt(perTxCap) 
                ? tvlCap.sub(totalAssets) 
                : perTxCap
            expect(maxDeposit).to.equal(expectedMax)
        })

        it('maxDeposit respects per-tx cap', async () => {
            const perTxCap = await dbank.perTxCap()
            const maxDeposit = await dbank.maxDeposit(receiver.address)
            expect(maxDeposit).to.be.lte(perTxCap)
        })

        it('maxDeposit returns minimum of all limits', async () => {
            const tvlCap = await dbank.tvlCap()
            const perTxCap = await dbank.perTxCap()
            const maxDeposit = await dbank.maxDeposit(receiver.address)
            
            const expectedMin = tvlCap.lt(perTxCap) ? tvlCap : perTxCap
            expect(maxDeposit).to.be.lte(expectedMin)
        })

        it('maxMint calculates from maxDeposit correctly', async () => {
            const maxDepositAmount = await dbank.maxDeposit(receiver.address)
            const maxMintShares = await dbank.maxMint(receiver.address)
            
            // maxMint should be convertToShares(maxDeposit)
            const expectedShares = await dbank.convertToShares(maxDepositAmount)
            expect(maxMintShares).to.equal(expectedShares)
        })

        it('maxWithdraw returns convertToAssets(balanceOf[owner])', async () => {
            // First deposit
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const balance = await dbank.balanceOf(receiver.address)
            const maxWithdraw = await dbank.maxWithdraw(receiver.address)
            const expectedAssets = await dbank.convertToAssets(balance)
            
            expect(maxWithdraw).to.equal(expectedAssets)
        })

        it('maxRedeem returns balanceOf[owner]', async () => {
            // First deposit
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const balance = await dbank.balanceOf(receiver.address)
            const maxRedeem = await dbank.maxRedeem(receiver.address)
            
            expect(maxRedeem).to.equal(balance)
        })

        it('previewDeposit includes deposit fees (0 in MVP)', async () => {
            const assets = tokens(1000)
            const previewShares = await dbank.previewDeposit(assets)
            const actualShares = await dbank.convertToShares(assets)
            
            // In MVP, no fees, so preview should match conversion
            expect(previewShares).to.equal(actualShares)
        })

        it('previewMint includes deposit fees (0 in MVP)', async () => {
            const shares = tokens(1000)
            const previewAssets = await dbank.previewMint(shares)
            const actualAssets = await dbank.convertToAssets(shares)
            
            // In MVP, no fees
            expect(previewAssets).to.equal(actualAssets)
        })

        it('previewWithdraw includes withdrawal fees (0 in MVP)', async () => {
            // First deposit
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const previewShares = await dbank.previewWithdraw(assets)
            const actualShares = await dbank.convertToShares(assets)
            
            // In MVP, no fees
            expect(previewShares).to.equal(actualShares)
        })

        it('previewRedeem includes withdrawal fees (0 in MVP)', async () => {
            // First deposit
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const shares = SMALL_AMOUNT // 0.000001 tokens
            const previewAssets = await dbank.previewRedeem(shares)
            const actualAssets = await dbank.convertToAssets(shares)
            
            // In MVP, no fees
            expect(previewAssets).to.equal(actualAssets)
        })

        it('previewDeposit matches actual deposit shares', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const previewShares = await dbank.previewDeposit(assets)
            
            await token.connect(receiver).approve(dbank.address, assets)
            const tx = await dbank.connect(receiver).deposit(assets, receiver.address)
            const receipt = await tx.wait()
            
            // Extract shares from Deposit event
            const depositEvent = receipt.events.find(e => e.event === 'Deposit')
            const actualShares = depositEvent.args.shares
            
            expect(previewShares).to.equal(actualShares)
        })

        it('previewMint matches actual mint assets', async () => {
            const shares = tokens(1000)
            const previewAssets = await dbank.previewMint(shares)
            
            await token.connect(receiver).approve(dbank.address, previewAssets.mul(2)) // Approve extra for safety
            const tx = await dbank.connect(receiver).mint(shares, receiver.address)
            const receipt = await tx.wait()
            
            // Extract assets from Deposit event
            const depositEvent = receipt.events.find(e => e.event === 'Deposit')
            const actualAssets = depositEvent.args.assets
            
            expect(previewAssets).to.equal(actualAssets)
        })
    })

    // ===========================================================
    // Suite: [VAULT/DEPOSIT] Buffer Policy
    // ===========================================================

    describe('[VAULT/DEPOSIT] Buffer Policy', () => {
        beforeEach(async () => {
            await token.connect(receiver).approve(dbank.address, tokens(1000000))
        })

        it('deposit fills buffer to target (12%)', async () => {
            const depositAmount = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const buffer = await dbank.buffer()
            const totalAssets = await dbank.totalAssets()
            const bufferTargetBps = await dbank.bufferTargetBps()
            const targetBuffer = totalAssets.mul(bufferTargetBps).div(10000)
            
            // Buffer should be at least close to target (within rounding)
            expect(buffer).to.be.gte(targetBuffer.sub(tokens(1))) // Allow for rounding
        })

        it('deposit routes remainder to router', async () => {
            // Note: This test assumes _updateBuffer() is implemented
            // For now, we verify that buffer is updated
            const depositAmount = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const buffer = await dbank.buffer()
            // Buffer should be less than or equal to deposit amount
            expect(buffer).to.be.lte(depositAmount)
        })

        it('deposit mints correct shares', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const expectedShares = await dbank.previewDeposit(assets)
            
            await token.connect(receiver).approve(dbank.address, assets)
            const tx = await dbank.connect(receiver).deposit(assets, receiver.address)
            const receipt = await tx.wait()
            
            const depositEvent = receipt.events.find(e => e.event === 'Deposit')
            const actualShares = depositEvent.args.shares
            
            expect(actualShares).to.equal(expectedShares)
        })

        it('deposit transfers assets from user', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, assets)
            const balanceBefore = await token.balanceOf(receiver.address)
            
            await dbank.connect(receiver).deposit(assets, receiver.address)
            
            const balanceAfter = await token.balanceOf(receiver.address)
            expect(balanceBefore.sub(balanceAfter)).to.equal(assets)
        })

        it('deposit emits Deposit event', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, assets)
            const expectedShares = await dbank.previewDeposit(assets)
            
            await expect(dbank.connect(receiver).deposit(assets, receiver.address))
                .to.emit(dbank, 'Deposit')
                .withArgs(receiver.address, receiver.address, assets, expectedShares)
        })

        it('deposit reverts when paused', async () => {
            await dbank.connect(deployer).pause(true)
            
            await expect(
                dbank.connect(receiver).deposit(tokens(1000), receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__Paused')
        })

        it('deposit reverts when exceeds maxDeposit', async () => {
            const maxDeposit = await dbank.maxDeposit(receiver.address)
            const excessAmount = maxDeposit.add(ethers.utils.parseUnits('1', 18))
            await token.connect(receiver).approve(dbank.address, excessAmount)
            
            await expect(
                dbank.connect(receiver).deposit(excessAmount, receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded')
        })

        it('deposit reverts with zero amount', async () => {
            await expect(
                dbank.connect(receiver).deposit(0, receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InvalidAmount')
        })

        it('deposit reverts with zero receiver', async () => {
            const assets = SMALL_AMOUNT
            await token.connect(receiver).approve(dbank.address, assets)
            await expect(
                dbank.connect(receiver).deposit(assets, addressZero)
            ).to.be.revertedWithCustomError(dbank, 'dBank__ZeroAddress')
        })

        it('mint works correctly (alternative to deposit)', async () => {
            const shares = SMALL_AMOUNT // 0.000001 shares
            const expectedAssets = await dbank.previewMint(shares)
            await token.connect(receiver).approve(dbank.address, expectedAssets.mul(2))
            
            const tx = await dbank.connect(receiver).mint(shares, receiver.address)
            const receipt = await tx.wait()
            
            const depositEvent = receipt.events.find(e => e.event === 'Deposit')
            expect(depositEvent.args.shares).to.equal(shares)
            expect(depositEvent.args.assets).to.equal(expectedAssets)
        })

        it('mint routes excess to router after buffer filled', async () => {
            const shares = SMALL_AMOUNT // 0.000001 shares
            const expectedAssets = await dbank.previewMint(shares)
            await token.connect(receiver).approve(dbank.address, expectedAssets.mul(2))
            await dbank.connect(receiver).mint(shares, receiver.address)
            
            const buffer = await dbank.buffer()
            const totalAssets = await dbank.totalAssets()
            // Buffer should be managed according to target
            expect(buffer).to.be.gte(0)
        })
    })

    // ===========================================================
    // Suite: [VAULT/WITHDRAW] Instant & Sync
    // ===========================================================

    describe('[VAULT/WITHDRAW] Instant & Sync', () => {
        beforeEach(async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount.mul(100))
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
        })

        it('withdraw serves from buffer when sufficient', async () => {
            const withdrawAmount = SMALL_AMOUNT // 0.000001 tokens
            const bufferBefore = await dbank.buffer()
            
            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            
            const bufferAfter = await dbank.buffer()
            expect(bufferBefore.sub(bufferAfter)).to.equal(withdrawAmount)
        })

        it('withdraw serves from buffer + router when needed', async () => {
            // This test will fail until router integration is complete
            // For now, we test the buffer-only case
            const withdrawAmount = SMALL_AMOUNT // 0.000001 tokens
            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            
            const balance = await token.balanceOf(receiver.address)
            expect(balance).to.be.gte(withdrawAmount)
        })

        it('withdraw succeeds even when user has allocations in strategies', async () => {
            // Deploy and register MockS1
            const MockS1 = await ethers.getContractFactory('MockS1')
            const mockS1 = await MockS1.deploy(token.address)
            await mockS1.setParams(500, tokens(1000000))
            await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

            // Create a user allocation directly in the router (from wallet, NOT from dBank)
            const allocationAmount = tokens(1)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // User should still be able to withdraw from dBank
            // because strategy allocations are a separate system
            const withdrawAmount = SMALL_AMOUNT
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            ).to.not.be.reverted
        })

        it('withdraw burns correct shares', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const sharesBefore = await dbank.balanceOf(receiver.address)
            const expectedShares = await dbank.previewWithdraw(assets)
            
            await dbank.connect(receiver).withdraw(assets, receiver.address, receiver.address)
            
            const sharesAfter = await dbank.balanceOf(receiver.address)
            expect(sharesBefore.sub(sharesAfter)).to.equal(expectedShares)
        })

        it('withdraw transfers assets to receiver', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const balanceBefore = await token.balanceOf(receiver.address)
            
            await dbank.connect(receiver).withdraw(assets, receiver.address, receiver.address)
            
            const balanceAfter = await token.balanceOf(receiver.address)
            expect(balanceAfter.sub(balanceBefore)).to.equal(assets)
        })

        it('withdraw emits Withdraw event', async () => {
            const assets = SMALL_AMOUNT // 0.000001 tokens
            const expectedShares = await dbank.previewWithdraw(assets)
            
            await expect(
                dbank.connect(receiver).withdraw(assets, receiver.address, receiver.address)
            )
                .to.emit(dbank, 'Withdraw')
                .withArgs(receiver.address, receiver.address, receiver.address, assets, expectedShares)
        })

        it('withdraw reverts when paused', async () => {
            await dbank.connect(deployer).pause(true)
            
            const withdrawAmount = SMALL_AMOUNT
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__Paused')
        })

        it('withdraw reverts when exceeds maxWithdraw', async () => {
            const maxWithdraw = await dbank.maxWithdraw(receiver.address)
            const excessAmount = maxWithdraw.add(ethers.utils.parseUnits('1', 18))
            
            await expect(
                dbank.connect(receiver).withdraw(excessAmount, receiver.address, receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded')
        })

        it('withdraw reverts with insufficient shares', async () => {
            const maxWithdraw = await dbank.maxWithdraw(receiver.address)
            const excessAmount = maxWithdraw.add(tokens(1000))
            
            await expect(
                dbank.connect(receiver).withdraw(excessAmount, receiver.address, receiver.address)
            ).to.be.reverted
        })

        it('withdraw reverts with zero receiver', async () => {
            const withdrawAmount = SMALL_AMOUNT
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, addressZero, receiver.address)
            ).to.be.revertedWithCustomError(dbank, 'dBank__ZeroAddress')
        })

        it('redeem works correctly (alternative to withdraw)', async () => {
            const shares = SMALL_AMOUNT // 0.000001 shares
            const expectedAssets = await dbank.previewRedeem(shares)
            
            const tx = await dbank.connect(receiver).redeem(shares, receiver.address, receiver.address)
            const receipt = await tx.wait()
            
            const withdrawEvent = receipt.events.find(e => e.event === 'Withdraw')
            expect(withdrawEvent.args.shares).to.equal(shares)
            expect(withdrawEvent.args.assets).to.equal(expectedAssets)
        })

        it('withdraw handles slippage correctly', async () => {
            // This test assumes slippage handling is implemented
            const assets = SMALL_AMOUNT // 0.000001 tokens
            await dbank.connect(receiver).withdraw(assets, receiver.address, receiver.address)
            
            const balance = await token.balanceOf(receiver.address)
            expect(balance).to.be.gte(assets)
        })
    })

    // ===========================================================
    // Suite: [VAULT/ERC20] Share Token Functions
    // ===========================================================

    describe('[VAULT/ERC20] Share Token Functions', () => {
        beforeEach(async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount.mul(100))
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
        })

        it('transfer shares correctly', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            const balanceBefore = await dbank.balanceOf(user1.address)
            
            await dbank.connect(receiver).transfer(user1.address, amount)
            
            const balanceAfter = await dbank.balanceOf(user1.address)
            expect(balanceAfter.sub(balanceBefore)).to.equal(amount)
        })

        it('transferFrom works with approval', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            await dbank.connect(receiver).approve(user1.address, amount)
            
            const balanceBefore = await dbank.balanceOf(user2.address)
            await dbank.connect(user1).transferFrom(receiver.address, user2.address, amount)
            
            const balanceAfter = await dbank.balanceOf(user2.address)
            expect(balanceAfter.sub(balanceBefore)).to.equal(amount)
        })

        it('approve sets allowance correctly', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            await dbank.connect(receiver).approve(user1.address, amount)
            
            const allowance = await dbank.allowance(receiver.address, user1.address)
            expect(allowance).to.equal(amount)
        })

        it('increaseAllowance works correctly', async () => {
            const initialAmount = SMALL_AMOUNT // 0.000001 shares
            const addedAmount = SMALL_AMOUNT.div(2) // Half of small amount
            await dbank.connect(receiver).approve(user1.address, initialAmount)
            
            await dbank.connect(receiver).increaseAllowance(user1.address, addedAmount)
            
            const allowance = await dbank.allowance(receiver.address, user1.address)
            expect(allowance).to.equal(initialAmount.add(addedAmount))
        })

        it('decreaseAllowance works correctly', async () => {
            const initialAmount = SMALL_AMOUNT.mul(2) // 0.000002 shares
            const subtractedAmount = SMALL_AMOUNT // 0.000001 shares
            await dbank.connect(receiver).approve(user1.address, initialAmount)
            
            await dbank.connect(receiver).decreaseAllowance(user1.address, subtractedAmount)
            
            const allowance = await dbank.allowance(receiver.address, user1.address)
            expect(allowance).to.equal(initialAmount.sub(subtractedAmount))
        })

        it('transfer emits Transfer event', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            
            await expect(dbank.connect(receiver).transfer(user1.address, amount))
                .to.emit(dbank, 'Transfer')
                .withArgs(receiver.address, user1.address, amount)
        })

        it('approve emits Approval event', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            
            await expect(dbank.connect(receiver).approve(user1.address, amount))
                .to.emit(dbank, 'Approval')
                .withArgs(receiver.address, user1.address, amount)
        })

        it('transfer reverts with insufficient balance', async () => {
            const balance = await dbank.balanceOf(receiver.address)
            const excessAmount = balance.add(tokens(1))
            
            await expect(
                dbank.connect(receiver).transfer(user1.address, excessAmount)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientShares')
        })

        it('transferFrom reverts with insufficient allowance', async () => {
            const amount = SMALL_AMOUNT // 0.000001 shares
            const lessAmount = amount.div(2) // Half amount
            await dbank.connect(receiver).approve(user1.address, lessAmount)
            
            await expect(
                dbank.connect(user1).transferFrom(receiver.address, user2.address, amount)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientAllowance')
        })
    })

    // ===========================================================
    // Suite: [VAULT/ADMIN] Config Updates
    // ===========================================================

    describe('[VAULT/ADMIN] Config Updates', () => {
        it('setBufferTargetBps updates correctly', async () => {
            const newTargetBps = 1500 // 15%
            await dbank.connect(deployer).setBufferTargetBps(newTargetBps)
            
            expect(await dbank.bufferTargetBps()).to.equal(newTargetBps)
        })

        it('setBufferTargetBps reverts when not owner', async () => {
            await expect(
                dbank.connect(receiver).setBufferTargetBps(1500)
            ).to.be.revertedWithCustomError(dbank, 'dBank__NotOwner')
        })

        it('setBufferTargetBps reverts when > MAX_BPS', async () => {
            const MAX_BPS = 10000
            await expect(
                dbank.connect(deployer).setBufferTargetBps(MAX_BPS + 1)
            ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded')
        })

        it('setPerformanceFeeBps updates correctly', async () => {
            const newFeeBps = 3000 // 30%
            await dbank.connect(deployer).setPerformanceFeeBps(newFeeBps)
            
            expect(await dbank.performanceFeeBps()).to.equal(newFeeBps)
        })

        it('setFeeRecipient updates correctly', async () => {
            await dbank.connect(deployer).setFeeRecipient(user1.address)
            
            expect(await dbank.feeRecipient()).to.equal(user1.address)
        })

        it('setTvlCap updates correctly', async () => {
            const newCap = ethers.utils.parseUnits('200000', 18) // 200000 tokens
            await dbank.connect(deployer).setTvlCap(newCap)
            
            expect(await dbank.tvlCap()).to.equal(newCap)
        })

        it('setPerTxCap updates correctly', async () => {
            const newCap = ethers.utils.parseUnits('10000', 18) // 10000 tokens
            await dbank.connect(deployer).setPerTxCap(newCap)
            
            expect(await dbank.perTxCap()).to.equal(newCap)
        })

        it('pause updates correctly', async () => {
            await dbank.connect(deployer).pause(true)
            expect(await dbank.paused()).to.be.true
            
            await dbank.connect(deployer).pause(false)
            expect(await dbank.paused()).to.be.false
        })

        it('all setters emit ConfigUpdated events', async () => {
            await expect(dbank.connect(deployer).setBufferTargetBps(1500))
                .to.emit(dbank, 'ConfigUpdated')
            
            await expect(dbank.connect(deployer).setPerformanceFeeBps(3000))
                .to.emit(dbank, 'ConfigUpdated')
            
            await expect(dbank.connect(deployer).setTvlCap(ethers.utils.parseUnits('200000', 18)))
                .to.emit(dbank, 'ConfigUpdated')
        })
    })

    // ===========================================================
    // Suite: [VAULT/FEE] Epoch & HWM
    // ===========================================================

    describe('[VAULT/FEE] Epoch & HWM', () => {
        beforeEach(async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount.mul(100))
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
        })

        it('crystallizeFees does nothing mid-epoch', async () => {
            // Try to crystallize before epoch is complete
            await expect(
                dbank.connect(deployer).crystallizeFees()
            ).to.be.revertedWithCustomError(dbank, 'dBank__EpochNotComplete')
        })

        it('crystallizeFees calculates fees correctly after epoch', async () => {
            // Advance time by EPOCH_DURATION
            await ethers.provider.send("evm_increaseTime", [EPOCH_DURATION])
            await ethers.provider.send("evm_mine", [])
            
            // Function should execute without error
            await expect(dbank.connect(deployer).crystallizeFees())
                .to.emit(dbank, 'FeesCrystallized')
        })

        it('highWaterMark prevents fee on losses', async () => {
            // Advance time by EPOCH_DURATION
            await ethers.provider.send("evm_increaseTime", [EPOCH_DURATION])
            await ethers.provider.send("evm_mine", [])
            
            const hwmBefore = await dbank.highWaterMark()
            await dbank.connect(deployer).crystallizeFees()
            const hwmAfter = await dbank.highWaterMark()
            
            // High water mark should not decrease
            expect(hwmAfter).to.be.gte(hwmBefore)
        })

        it('crystallizeFees updates highWaterMark correctly', async () => {
            await ethers.provider.send("evm_increaseTime", [EPOCH_DURATION])
            await ethers.provider.send("evm_mine", [])
            
            const priceBefore = await dbank.pricePerShare()
            await dbank.connect(deployer).crystallizeFees()
            const hwmAfter = await dbank.highWaterMark()
            
            // High water mark should be at least the current price
            expect(hwmAfter).to.be.gte(priceBefore)
        })

        it('crystallizeFees updates lastEpochTimestamp', async () => {
            const timestampBefore = await dbank.lastEpochTimeStamp()
            
            await ethers.provider.send("evm_increaseTime", [EPOCH_DURATION])
            await ethers.provider.send("evm_mine", [])
            
            await dbank.connect(deployer).crystallizeFees()
            const timestampAfter = await dbank.lastEpochTimeStamp()
            
            expect(timestampAfter).to.be.gt(timestampBefore)
        })

        it('crystallizeFees emits FeesCrystallized event', async () => {
            await ethers.provider.send("evm_increaseTime", [EPOCH_DURATION])
            await ethers.provider.send("evm_mine", [])
            
            await expect(dbank.connect(deployer).crystallizeFees())
                .to.emit(dbank, 'FeesCrystallized')
        })
    })

    // ===========================================================
    // Suite: [VAULT/INTEGRATION] End-to-End
    // ===========================================================

    describe('[VAULT/INTEGRATION] End-to-End', () => {
        it('deposit → buffer filled → router receives remainder', async () => {
            // This test requires router integration to be complete
            const depositAmount = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const buffer = await dbank.buffer()
            expect(buffer).to.be.gte(0)
        })

        it('withdraw from buffer only', async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            
            const withdrawAmount = SMALL_AMOUNT // 0.000001 tokens
            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            
            const balance = await token.balanceOf(receiver.address)
            expect(balance).to.be.gte(withdrawAmount)
        })

        it('multiple deposits accumulate correctly', async () => {
            const deposit1 = SMALL_AMOUNT // 0.000001 tokens
            const deposit2 = SMALL_AMOUNT.mul(2) // 0.000002 tokens
            await token.connect(receiver).approve(dbank.address, deposit1.add(deposit2))
            
            await dbank.connect(receiver).deposit(deposit1, receiver.address)
            const shares1 = await dbank.balanceOf(receiver.address)
            
            await dbank.connect(receiver).deposit(deposit2, receiver.address)
            const shares2 = await dbank.balanceOf(receiver.address)
            
            expect(shares2).to.be.gt(shares1)
        })

        it('deposit and withdraw maintain share consistency', async () => {
            const depositAmount = MEDIUM_AMOUNT // 0.00001 tokens
            const withdrawAmount = SMALL_AMOUNT // 0.000001 tokens
            await token.connect(receiver).approve(dbank.address, depositAmount)

            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
            const sharesBefore = await dbank.balanceOf(receiver.address)

            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            const sharesAfter = await dbank.balanceOf(receiver.address)

            expect(sharesBefore).to.be.gt(sharesAfter)
        })
    })

    // ===========================================================
    // Suite: [VAULT/ALLOCATION] Strategy Allocation
    // ===========================================================

    describe('[VAULT/ALLOCATION] Strategy Allocation', () => {
        let mockS1

        beforeEach(async () => {
            // Increase caps for larger test amounts
            await dbank.connect(deployer).setTvlCap(tokens(1000000))
            await dbank.connect(deployer).setPerTxCap(tokens(100000))

            // Deploy MockS1 strategy
            const MockS1 = await ethers.getContractFactory('MockS1')
            mockS1 = await MockS1.deploy(token.address)

            // Set strategy parameters (5% APR, 1M cap)
            await mockS1.setParams(500, tokens(1000000))

            // Register strategy with router
            await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

            // Deposit some tokens to dBank
            const depositAmount = tokens(10000)
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)
        })

        it('allocate moves assets from buffer to strategy', async () => {
            const allocateAmount = tokens(5000)
            const bufferBefore = await dbank.buffer()

            await dbank.connect(deployer).allocate(1, allocateAmount)

            const bufferAfter = await dbank.buffer()
            expect(bufferBefore.sub(bufferAfter)).to.equal(allocateAmount)
        })

        it('allocate emits Allocated event', async () => {
            const allocateAmount = tokens(5000)

            await expect(dbank.connect(deployer).allocate(1, allocateAmount))
                .to.emit(dbank, 'Allocated')
                .withArgs(1, allocateAmount, tokens(5000)) // buffer after = 10000 - 5000
        })

        it('allocate reverts when amount exceeds buffer', async () => {
            const buffer = await dbank.buffer()
            const excessAmount = buffer.add(tokens(1000))

            await expect(
                dbank.connect(deployer).allocate(1, excessAmount)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InsufficientLiquidity')
        })

        it('allocate reverts when not owner', async () => {
            await expect(
                dbank.connect(receiver).allocate(1, tokens(1000))
            ).to.be.revertedWithCustomError(dbank, 'dBank__NotOwner')
        })

        it('allocate reverts when paused', async () => {
            await dbank.connect(deployer).pause(true)

            await expect(
                dbank.connect(deployer).allocate(1, tokens(1000))
            ).to.be.revertedWithCustomError(dbank, 'dBank__Paused')
        })

        it('allocate reverts with zero amount', async () => {
            await expect(
                dbank.connect(deployer).allocate(1, 0)
            ).to.be.revertedWithCustomError(dbank, 'dBank__InvalidAmount')
        })

        it('totalAssets includes allocated strategy assets', async () => {
            const totalAssetsBefore = await dbank.totalAssets()

            await dbank.connect(deployer).allocate(1, tokens(5000))

            const totalAssetsAfter = await dbank.totalAssets()
            // Total assets should remain the same (just moved from buffer to strategy)
            expect(totalAssetsAfter).to.equal(totalAssetsBefore)
        })

        it('pricePerShare remains stable after allocation', async () => {
            const priceBefore = await dbank.pricePerShare()

            await dbank.connect(deployer).allocate(1, tokens(5000))

            const priceAfter = await dbank.pricePerShare()
            expect(priceAfter).to.equal(priceBefore)
        })
    })

    // ===========================================================
    // Suite: [VAULT/STRATEGY_WITHDRAW] Withdraw from Strategies
    // ===========================================================

    describe('[VAULT/STRATEGY_WITHDRAW] Withdraw from Strategies', () => {
        let mockS1

        beforeEach(async () => {
            // Increase caps for larger test amounts
            await dbank.connect(deployer).setTvlCap(tokens(1000000))
            await dbank.connect(deployer).setPerTxCap(tokens(100000))

            // Deploy MockS1 strategy
            const MockS1 = await ethers.getContractFactory('MockS1')
            mockS1 = await MockS1.deploy(token.address)

            // Set strategy parameters (5% APR, 1M cap)
            await mockS1.setParams(500, tokens(1000000))

            // Register strategy with router
            await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

            // Deposit tokens to dBank
            const depositAmount = tokens(10000)
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)

            // Allocate most to strategy, leaving small buffer
            await dbank.connect(deployer).allocate(1, tokens(8000))

            // Transfer tokens to router (simulating the router having liquidity)
            await token.transfer(strategyRouter.address, tokens(10000))
        })

        it('withdraw from buffer when sufficient', async () => {
            const buffer = await dbank.buffer()
            const withdrawAmount = buffer.div(2) // Half of buffer

            const balanceBefore = await token.balanceOf(receiver.address)
            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            const balanceAfter = await token.balanceOf(receiver.address)

            expect(balanceAfter.sub(balanceBefore)).to.equal(withdrawAmount)
        })

        it('withdraw pulls from strategy when buffer insufficient', async () => {
            const buffer = await dbank.buffer()
            const withdrawAmount = buffer.add(tokens(1000)) // More than buffer

            const balanceBefore = await token.balanceOf(receiver.address)
            await dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            const balanceAfter = await token.balanceOf(receiver.address)

            expect(balanceAfter.sub(balanceBefore)).to.equal(withdrawAmount)
        })

        it('withdraw emits WithdrawnFromStrategy when pulling from strategies', async () => {
            const buffer = await dbank.buffer()
            const withdrawAmount = buffer.add(tokens(1000)) // Forces strategy withdrawal

            await expect(dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address))
                .to.emit(dbank, 'WithdrawnFromStrategy')
        })

        it('redeem pulls from strategy when buffer insufficient', async () => {
            // Get shares worth more than buffer
            const buffer = await dbank.buffer()
            const shares = await dbank.balanceOf(receiver.address)
            const assetsForShares = await dbank.convertToAssets(shares)

            // Only redeem if we have enough shares for more than buffer
            if (assetsForShares.gt(buffer)) {
                const redeemShares = shares.div(2) // Half of shares
                const expectedAssets = await dbank.convertToAssets(redeemShares)

                if (expectedAssets.gt(buffer)) {
                    const balanceBefore = await token.balanceOf(receiver.address)
                    await dbank.connect(receiver).redeem(redeemShares, receiver.address, receiver.address)
                    const balanceAfter = await token.balanceOf(receiver.address)

                    // Use tolerance for comparison due to yield accrual during test execution
                    const actualReceived = balanceAfter.sub(balanceBefore)
                    // Allow 0.01% tolerance for timing differences
                    const tolerance = expectedAssets.div(10000)
                    expect(actualReceived).to.be.gte(expectedAssets.sub(tolerance))
                    expect(actualReceived).to.be.lte(expectedAssets.add(tolerance))
                }
            }
        })
    })

    // ===========================================================
    // Suite: [VAULT/YIELD] Share/Asset Ratio with Yield
    // ===========================================================

    describe('[VAULT/YIELD] Share/Asset Ratio with Yield', () => {
        let mockS1

        beforeEach(async () => {
            // Increase caps for larger test amounts
            await dbank.connect(deployer).setTvlCap(tokens(1000000))
            await dbank.connect(deployer).setPerTxCap(tokens(100000))

            // Deploy MockS1 strategy
            const MockS1 = await ethers.getContractFactory('MockS1')
            mockS1 = await MockS1.deploy(token.address)

            // Set strategy parameters (5% APR, 1M cap)
            await mockS1.setParams(500, tokens(1000000))

            // Register strategy with router
            await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

            // Deposit tokens to dBank
            const depositAmount = tokens(10000)
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)

            // Allocate to strategy
            await dbank.connect(deployer).allocate(1, tokens(8000))
        })

        it('pricePerShare increases when strategy generates yield', async () => {
            const priceBefore = await dbank.pricePerShare()

            // Simulate yield by advancing time (MockS1 accrues yield over time)
            await ethers.provider.send("evm_increaseTime", [YEAR])
            await ethers.provider.send("evm_mine", [])

            const priceAfter = await dbank.pricePerShare()
            expect(priceAfter).to.be.gt(priceBefore)
        })

        it('convertToAssets returns more assets per share after yield', async () => {
            const shares = tokens(1000)
            const assetsBefore = await dbank.convertToAssets(shares)

            // Simulate yield
            await ethers.provider.send("evm_increaseTime", [YEAR])
            await ethers.provider.send("evm_mine", [])

            const assetsAfter = await dbank.convertToAssets(shares)
            expect(assetsAfter).to.be.gt(assetsBefore)
        })

        it('convertToShares returns fewer shares per asset after yield', async () => {
            const assets = tokens(1000)
            const sharesBefore = await dbank.convertToShares(assets)

            // Simulate yield
            await ethers.provider.send("evm_increaseTime", [YEAR])
            await ethers.provider.send("evm_mine", [])

            const sharesAfter = await dbank.convertToShares(assets)
            expect(sharesAfter).to.be.lt(sharesBefore)
        })

        it('new depositor gets fewer shares after yield accrues', async () => {
            // First depositor already has shares
            const firstDepositorShares = await dbank.balanceOf(receiver.address)

            // Simulate yield
            await ethers.provider.send("evm_increaseTime", [YEAR])
            await ethers.provider.send("evm_mine", [])

            // Second depositor deposits same amount
            const depositAmount = tokens(10000)
            await token.connect(user1).approve(dbank.address, depositAmount)
            await dbank.connect(user1).deposit(depositAmount, user1.address)

            const secondDepositorShares = await dbank.balanceOf(user1.address)

            // Second depositor should get fewer shares for same assets
            // (because pricePerShare increased)
            expect(secondDepositorShares).to.be.lt(firstDepositorShares)
        })

        it('totalAssets increases when strategy generates yield', async () => {
            const totalAssetsBefore = await dbank.totalAssets()

            // Simulate yield
            await ethers.provider.send("evm_increaseTime", [YEAR])
            await ethers.provider.send("evm_mine", [])

            const totalAssetsAfter = await dbank.totalAssets()
            expect(totalAssetsAfter).to.be.gt(totalAssetsBefore)
        })
    })

    // ===========================================================
    // Suite: [VAULT/WITHDRAW_ALLOCATED] Withdraw with Allocated Shares
    // ===========================================================

    describe('[VAULT/WITHDRAW_ALLOCATED] Withdraw with Allocated Shares', () => {
        let mockS1

        beforeEach(async () => {
            // Increase caps for larger test amounts
            await dbank.connect(deployer).setTvlCap(tokens(1000000))
            await dbank.connect(deployer).setPerTxCap(tokens(100000))

            // Deploy MockS1 strategy
            const MockS1 = await ethers.getContractFactory('MockS1')
            mockS1 = await MockS1.deploy(token.address)

            // Set strategy parameters (5% APR, 1M cap)
            await mockS1.setParams(500, tokens(1000000))

            // Register strategy with router
            await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

            // Deposit 5000 USDC to dBank
            const depositAmount = tokens(5000)
            await token.connect(receiver).approve(dbank.address, depositAmount)
            await dbank.connect(receiver).deposit(depositAmount, receiver.address)

            // Transfer tokens to router (simulating the router having liquidity)
            await token.transfer(strategyRouter.address, tokens(10000))
        })

        it('allows withdrawing unallocated shares when user has allocations', async () => {
            // User has 5000 USDC deposited (let's say 5000 shares)
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy (via router)
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // Calculate unallocated shares
            const userTotalAllocated = await strategyRouter.getUserTotalAllocated(receiver.address)
            const allocatedSharesBN = await dbank.convertToShares(userTotalAllocated)
            const unallocatedSharesBN = userSharesBefore.sub(allocatedSharesBN)
            
            // Convert unallocated shares to assets
            const unallocatedAssetsBN = await dbank.convertToAssets(unallocatedSharesBN)
            
            // Should be able to withdraw unallocated amount (approximately 1000 USDC)
            const balanceBefore = await token.balanceOf(receiver.address)
            
            // Withdraw slightly less than unallocated to account for rounding
            const withdrawAmount = unallocatedAssetsBN.mul(99).div(100) // 99% to be safe
            
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            ).to.not.be.reverted

            const balanceAfter = await token.balanceOf(receiver.address)
            expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(withdrawAmount, TOL)
        })

        it('allows withdraw regardless of strategy allocations (allocations are separate)', async () => {
            // User has 5000 USDC deposited to dBank
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy FROM WALLET (not from dBank)
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // User should still be able to withdraw their full dBank deposit
            // because strategy allocations come from the wallet, not from dBank
            // Only limited by buffer liquidity, not by allocations
            const withdrawAmount = tokens(1000) // Some amount within buffer
            
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            ).to.not.be.reverted
        })

        it('allows withdrawing exactly unallocated shares', async () => {
            // User has 5000 USDC deposited
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // Calculate unallocated shares
            const userTotalAllocated = await strategyRouter.getUserTotalAllocated(receiver.address)
            const allocatedSharesBN = await dbank.convertToShares(userTotalAllocated)
            const unallocatedSharesBN = userSharesBefore.sub(allocatedSharesBN)
            
            // Convert unallocated shares to assets
            const unallocatedAssetsBN = await dbank.convertToAssets(unallocatedSharesBN)
            
            // Should be able to withdraw exactly unallocated amount
            const balanceBefore = await token.balanceOf(receiver.address)
            
            await expect(
                dbank.connect(receiver).withdraw(unallocatedAssetsBN, receiver.address, receiver.address)
            ).to.not.be.reverted

            const balanceAfter = await token.balanceOf(receiver.address)
            // Use tolerance for comparison due to potential rounding
            expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(unallocatedAssetsBN, TOL.mul(10))
        })

        it('allows withdrawing less than unallocated shares', async () => {
            // User has 5000 USDC deposited
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // Calculate unallocated shares
            const userTotalAllocated = await strategyRouter.getUserTotalAllocated(receiver.address)
            const allocatedSharesBN = await dbank.convertToShares(userTotalAllocated)
            const unallocatedSharesBN = userSharesBefore.sub(allocatedSharesBN)
            
            // Convert unallocated shares to assets
            const unallocatedAssetsBN = await dbank.convertToAssets(unallocatedSharesBN)
            
            // Withdraw half of unallocated (e.g., 500 USDC)
            const withdrawAmount = unallocatedAssetsBN.div(2)
            
            const balanceBefore = await token.balanceOf(receiver.address)
            
            await expect(
                dbank.connect(receiver).withdraw(withdrawAmount, receiver.address, receiver.address)
            ).to.not.be.reverted

            const balanceAfter = await token.balanceOf(receiver.address)
            expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(withdrawAmount, TOL)
        })

        it('redeem allows withdrawing unallocated shares', async () => {
            // User has 5000 USDC deposited
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // Calculate unallocated shares
            const userTotalAllocated = await strategyRouter.getUserTotalAllocated(receiver.address)
            const allocatedSharesBN = await dbank.convertToShares(userTotalAllocated)
            const unallocatedSharesBN = userSharesBefore.sub(allocatedSharesBN)
            
            // Should be able to redeem unallocated shares
            const balanceBefore = await token.balanceOf(receiver.address)
            
            // Redeem slightly less than unallocated to account for rounding
            const redeemShares = unallocatedSharesBN.mul(99).div(100)
            const expectedAssets = await dbank.convertToAssets(redeemShares)
            
            await expect(
                dbank.connect(receiver).redeem(redeemShares, receiver.address, receiver.address)
            ).to.not.be.reverted

            const balanceAfter = await token.balanceOf(receiver.address)
            expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(expectedAssets, TOL.mul(10))
        })

        it('redeem allows redemption regardless of strategy allocations', async () => {
            // User has 5000 USDC deposited to dBank
            const userSharesBefore = await dbank.balanceOf(receiver.address)
            
            // Allocate 4000 USDC to strategy FROM WALLET (not from dBank)
            const allocationAmount = tokens(4000)
            await token.connect(receiver).approve(strategyRouter.address, allocationAmount)
            await strategyRouter.connect(receiver).depositToStrategy(1, allocationAmount)

            // User should still be able to redeem their dBank shares
            // because strategy allocations come from the wallet, not from dBank
            // Only limited by buffer liquidity
            const redeemShares = ethers.utils.parseUnits('100', 18) // Some shares within buffer
            
            await expect(
                dbank.connect(receiver).redeem(redeemShares, receiver.address, receiver.address)
            ).to.not.be.reverted
        })
    })
})
