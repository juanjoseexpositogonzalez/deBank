// Seeding script to initialize test/demo environment
// Seed balances, allowances, and initial vault configuration
//
// Usage: npx hardhat run scripts/seed.js --network <network>
// Requires environment variables or parameters with deployed contract addresses

require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");

// Helper to parse tokens
// We'll get token decimals dynamically
let tokenDecimals = 18; // Default value

async function getTokenDecimals(tokenContract) {
    try {
        return await tokenContract.decimals();
    } catch (error) {
        return 18; // Fallback to 18 decimals
    }
}

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), tokenDecimals);
};

// Helper for ConfigManager values (uses 6 decimals, not token decimals)
const tokens6 = (n) => {
    return ethers.utils.parseUnits(n.toString(), 6);
};

async function main() {
    const [deployer, ...users] = await ethers.getSigners();
    const network = hre.network.name;
    const { chainId } = await ethers.provider.getNetwork();
    const isSepolia = network === "sepolia" || chainId === 11155111;
    const isBaseSepolia = network === "baseSepolia" || chainId === 84532;

    console.log(`Running seed on network: ${network} (chainId=${chainId})`);
    console.log("With account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    // Get gas price and increase it slightly to ensure transactions go through
    const gasPrice = await deployer.provider.getGasPrice();
    const increasedGasPrice = gasPrice.mul(110).div(100); // Increase by 10%
    console.log(`Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (using ${ethers.utils.formatUnits(increasedGasPrice, 'gwei')} gwei)\n`);

    // Helper function to get transaction options with current nonce and gas price
    // For localhost, we get the nonce fresh each time to avoid conflicts
    const getTxOptions = async () => {
        const currentNonce = await deployer.getTransactionCount("pending");
        return {
            nonce: currentNonce,
            gasPrice: increasedGasPrice
        };
    };

    // ============================================================
    // Configuration: Deployed contract addresses
    // ============================================================
    // Addresses can come from environment variables or config.json (fallback).
    // We avoid positional CLI args because Hardhat injects its own argv.
    const chainKey = String(chainId);
    const cfgNet = (config && config[chainKey]) ? config[chainKey] : {};

    const resolveAddress = (envVar, cfgPath, label) => {
        const envVal = process.env[envVar];
        if (envVal && envVal.trim() !== "") return envVal.trim();
        return cfgPath && cfgPath.address ? cfgPath.address : undefined;
    };

    const TOKEN_ADDRESS = resolveAddress("token", cfgNet.token, "Token");
    const DBANK_ADDRESS = resolveAddress("dbank", cfgNet.dbank, "dBank");
    const STRATEGY_ROUTER_ADDRESS = resolveAddress("strategyRouter", cfgNet.strategyRouter, "StrategyRouter");
    const CONFIG_MANAGER_ADDRESS = resolveAddress("configManager", cfgNet.configManager, "ConfigManager");
    const MOCKS1_ADDRESS = resolveAddress("mockS1", cfgNet.mockS1, "MockS1"); // Optional

    if (!TOKEN_ADDRESS || !DBANK_ADDRESS || !STRATEGY_ROUTER_ADDRESS || !CONFIG_MANAGER_ADDRESS) {
        console.error("ERROR: Missing contract addresses.");
        console.error("Use environment variables or pass addresses as arguments:");
        console.error("  TOKEN_ADDRESS=<addr> DBANK_ADDRESS=<addr> STRATEGY_ROUTER_ADDRESS=<addr> CONFIG_MANAGER_ADDRESS=<addr> [MOCKS1_ADDRESS=<addr>] npx hardhat run scripts/seed.js --network <network>");
        console.error("Or:");
        console.error("  npx hardhat run scripts/seed.js --network <network> <token> <dbank> <router> <config> [mockS1]");
        process.exit(1);
    }

    console.log("Contract addresses (source: env overrides > config.json):");
    console.log(`  chainKey:           ${chainKey}`);
    console.log(`  Token:              ${TOKEN_ADDRESS}`);
    console.log(`  dBank:              ${DBANK_ADDRESS}`);
    console.log(`  StrategyRouter:     ${STRATEGY_ROUTER_ADDRESS}`);
    console.log(`  ConfigManager:      ${CONFIG_MANAGER_ADDRESS}`);
    if (MOCKS1_ADDRESS) {
        console.log(`  MockS1:             ${MOCKS1_ADDRESS}`);
    }
    console.log();

    // ============================================================
    // Validate that contracts exist at provided addresses
    // ============================================================
    const assertHasCode = async (address, label) => {
        const code = await ethers.provider.getCode(address);
        if (!code || code === "0x") {
            throw new Error(`No contract code at ${address} for ${label} on network ${network} (chainId=${chainId}).`);
        }
    };

    await assertHasCode(TOKEN_ADDRESS, "Token");
    await assertHasCode(DBANK_ADDRESS, "dBank");
    await assertHasCode(STRATEGY_ROUTER_ADDRESS, "StrategyRouter");
    await assertHasCode(CONFIG_MANAGER_ADDRESS, "ConfigManager");
    if (MOCKS1_ADDRESS) {
        await assertHasCode(MOCKS1_ADDRESS, "MockS1");
    }

    // ============================================================
    // Get contract instances
    // ============================================================
    const Token = await ethers.getContractFactory('Token');
    const dBank = await ethers.getContractFactory('dBank');
    const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
    const ConfigManager = await ethers.getContractFactory('ConfigManager');
    const MockS1 = await ethers.getContractFactory('MockS1');

    const token = Token.attach(TOKEN_ADDRESS);
    const dbank = dBank.attach(DBANK_ADDRESS);
    const strategyRouter = StrategyRouter.attach(STRATEGY_ROUTER_ADDRESS);
    const configManager = ConfigManager.attach(CONFIG_MANAGER_ADDRESS);
    
    // Attach MockS1 if address provided
    let mockS1 = null;
    if (MOCKS1_ADDRESS) {
        mockS1 = MockS1.attach(MOCKS1_ADDRESS);
    }

    // Get token decimals
    tokenDecimals = await getTokenDecimals(token);
    console.log(`Token decimals: ${tokenDecimals}\n`);

    // ============================================================
    // Configuration parameters
    // ============================================================
    const BUFFER_TARGET_BPS = 1200; // 12%
    const PERFORMANCE_FEE_BPS = 2500; // 25% (2500 bps)
    const TVL_CAP = tokens(isSepolia ? 1000 : 100000); // smaller on Sepolia
    const PER_TX_CAP = tokens(isSepolia ? 200 : 5000); // smaller on Sepolia

    // ConfigManager parameters (uses 6 decimals format: e6)
    const CONFIG_LIQUIDITY_BUFFER_BPS = 1200; // 12%
    const CONFIG_MAX_SLIPPAGE_BPS = 30; // 0.3%
    const CONFIG_TVL_GLOBAL_CAP = tokens6(isSepolia ? 1000 : 100000);
    const CONFIG_PER_TX_CAP = tokens6(isSepolia ? 200 : 5000);
    const CONFIG_PERFORMANCE_FEE_BPS = 2500; // 25% (2500 bps)
    const CONFIG_EPOCH_DURATION = 7; // 7 days
    const CONFIG_SETTLEMENT_WINDOW_UTC = 12 * 3600; // 12 hours in seconds
    const CONFIG_STRATEGY_CAP_S1 = tokens6(isSepolia ? 1000 : 100000);
    const CONFIG_STRATEGY_CAP_S2 = tokens6(isSepolia ? 500 : 50000);
    const CONFIG_STRATEGY_CAP_S3 = tokens6(isSepolia ? 250 : 25000);

    // Amounts to fund test accounts (reduced on Sepolia)
    const USER_BALANCE = tokens(isSepolia ? 500 : 100000);
    const DEPOSIT_AMOUNT_DEPLOYER = tokens(isSepolia ? 200 : 5000);
    const DEPOSIT_AMOUNT_USER1 = tokens(isSepolia ? 100 : 5000);
    const DEPOSIT_AMOUNT_USER2 = tokens(isSepolia ? 50 : 3000);
    const DEPOSIT_AMOUNT_USER3 = tokens(isSepolia ? 30 : 2000);

    // Number of test users to create (maximum 3)
    const NUM_SEED_USERS = Math.min(3, users.length);

    console.log("==========================================");
    console.log("STEP 1: Fund test accounts");
    console.log("==========================================\n");

    // Check deployer balance
    const deployerBalance = await token.balanceOf(deployer.address);
    const requiredBalance = USER_BALANCE.mul(NUM_SEED_USERS);
    
    if (deployerBalance.lt(requiredBalance)) {
        console.log(`⚠ Warning: Deployer balance (${ethers.utils.formatEther(deployerBalance)}) is less than required (${ethers.utils.formatEther(requiredBalance)})`);
        console.log("  Will attempt to fund with available balance.\n");
    }

    // Fund test accounts
    for (let i = 0; i < NUM_SEED_USERS; i++) {
        const user = users[i];
        const amount = USER_BALANCE;
        const balance = await token.balanceOf(user.address);
        
        if (balance.lt(amount)) {
            const transferAmount = amount.sub(balance);
            if (deployerBalance.gte(transferAmount)) {
                console.log(`  Funding account ${i + 1} (${user.address})...`);
                const tx = await token.transfer(user.address, transferAmount);
                await tx.wait();
                console.log(`  ✓ Transferred ${ethers.utils.formatEther(transferAmount)} tokens\n`);
            } else {
                console.log(`  ⚠ Insufficient funds to fund account ${i + 1}\n`);
            }
        } else {
            console.log(`  ✓ Account ${i + 1} already has sufficient balance\n`);
        }
    }

    console.log("==========================================");
    console.log("STEP 2: Configure Allowances");
    console.log("==========================================\n");

    // Configure allowances for each user
    for (let i = 0; i < NUM_SEED_USERS; i++) {
        const user = users[i];
        const allowance = await token.allowance(user.address, DBANK_ADDRESS);
        const requiredAllowance = tokens(isSepolia ? 1000 : 1000000); // smaller on Sepolia

        if (allowance.lt(requiredAllowance)) {
            console.log(`  Configuring allowance for user ${i + 1}...`);
            const tokenUser = token.connect(user);
            const tx = await tokenUser.approve(DBANK_ADDRESS, requiredAllowance);
            await tx.wait();
            console.log(`  ✓ Allowance configured: ${ethers.utils.formatEther(requiredAllowance)} tokens\n`);
        } else {
            console.log(`  ✓ User ${i + 1} already has sufficient allowance\n`);
        }
    }

    console.log("==========================================");
    console.log("STEP 2.5: Configure ConfigManager (Owner)");
    console.log("==========================================\n");

    // Verify that deployer is the ConfigManager owner
    const configManagerOwner = await configManager.owner();
    if (configManagerOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`  ⚠ Warning: Deployer (${deployer.address}) is not the ConfigManager owner (${configManagerOwner})`);
        console.log(`    ConfigManager configuration will be skipped.\n`);
    } else {
        console.log(`  ✓ Deployer is ConfigManager owner\n`);

        // Configure liquidityBufferBps
        const currentLiquidityBufferBps = await configManager.liquidityBufferBps();
        if (currentLiquidityBufferBps.toString() !== CONFIG_LIQUIDITY_BUFFER_BPS.toString()) {
            console.log(`  Configuring liquidityBufferBps to ${CONFIG_LIQUIDITY_BUFFER_BPS} (${CONFIG_LIQUIDITY_BUFFER_BPS / 100}%)...`);
            const tx = await configManager.setLiquidityBufferBps(CONFIG_LIQUIDITY_BUFFER_BPS, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ liquidityBufferBps configured\n`);
        } else {
            console.log(`  ✓ liquidityBufferBps already configured correctly\n`);
        }

        // Configure maxSlippageBps
        const currentMaxSlippageBps = await configManager.maxSlippageBps();
        if (currentMaxSlippageBps.toString() !== CONFIG_MAX_SLIPPAGE_BPS.toString()) {
            console.log(`  Configuring maxSlippageBps to ${CONFIG_MAX_SLIPPAGE_BPS} (${CONFIG_MAX_SLIPPAGE_BPS / 10}%)...`);
            const tx = await configManager.setMaxSlippageBps(CONFIG_MAX_SLIPPAGE_BPS, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ maxSlippageBps configured\n`);
        } else {
            console.log(`  ✓ maxSlippageBps already configured correctly\n`);
        }

        // Configure tvlGlobalCap
        const currentTvlGlobalCap = await configManager.tvlGlobalCap();
        if (!currentTvlGlobalCap.eq(CONFIG_TVL_GLOBAL_CAP)) {
            console.log(`  Configuring tvlGlobalCap to ${ethers.utils.formatUnits(CONFIG_TVL_GLOBAL_CAP, 6)} tokens...`);
            const tx = await configManager.setTvlGlobalCap(CONFIG_TVL_GLOBAL_CAP, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ tvlGlobalCap configured\n`);
        } else {
            console.log(`  ✓ tvlGlobalCap already configured correctly\n`);
        }

        // Configure perTxCap
        const currentConfigPerTxCap = await configManager.perTxCap();
        if (!currentConfigPerTxCap.eq(CONFIG_PER_TX_CAP)) {
            console.log(`  Configuring perTxCap to ${ethers.utils.formatUnits(CONFIG_PER_TX_CAP, 6)} tokens...`);
            const tx = await configManager.setPerTxCap(CONFIG_PER_TX_CAP, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ perTxCap configured\n`);
        } else {
            console.log(`  ✓ perTxCap already configured correctly\n`);
        }

        // Configure performanceFeeBps
        const currentConfigPerformanceFeeBps = await configManager.performanceFeeBps();
        if (currentConfigPerformanceFeeBps.toString() !== CONFIG_PERFORMANCE_FEE_BPS.toString()) {
            console.log(`  Configuring performanceFeeBps to ${CONFIG_PERFORMANCE_FEE_BPS} (${CONFIG_PERFORMANCE_FEE_BPS / 100}%)...`);
            const tx = await configManager.setPerformanceFeeBps(CONFIG_PERFORMANCE_FEE_BPS, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ performanceFeeBps configured\n`);
        } else {
            console.log(`  ✓ performanceFeeBps already configured correctly\n`);
        }

        // Configure epochDuration
        const currentEpochDuration = await configManager.epochDuration();
        if (currentEpochDuration.toString() !== CONFIG_EPOCH_DURATION.toString()) {
            console.log(`  Configuring epochDuration to ${CONFIG_EPOCH_DURATION} days...`);
            const tx = await configManager.setEpochDuration(CONFIG_EPOCH_DURATION, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ epochDuration configured\n`);
        } else {
            console.log(`  ✓ epochDuration already configured correctly\n`);
        }

        // Configure settlementWindowUTC
        const currentSettlementWindowUTC = await configManager.settlementWindowUTC();
        if (currentSettlementWindowUTC.toString() !== CONFIG_SETTLEMENT_WINDOW_UTC.toString()) {
            console.log(`  Configuring settlementWindowUTC to ${CONFIG_SETTLEMENT_WINDOW_UTC} seconds (${CONFIG_SETTLEMENT_WINDOW_UTC / 3600} hours)...`);
            const tx = await configManager.setSettlementWindowUTC(CONFIG_SETTLEMENT_WINDOW_UTC, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ settlementWindowUTC configured\n`);
        } else {
            console.log(`  ✓ settlementWindowUTC already configured correctly\n`);
        }

        // Configure strategyCapS1
        const currentStrategyCapS1 = await configManager.strategyCapS1();
        if (!currentStrategyCapS1.eq(CONFIG_STRATEGY_CAP_S1)) {
            console.log(`  Configuring strategyCapS1 to ${ethers.utils.formatUnits(CONFIG_STRATEGY_CAP_S1, 6)} tokens...`);
            const tx = await configManager.setStrategyCapS1(CONFIG_STRATEGY_CAP_S1, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ strategyCapS1 configured\n`);
        } else {
            console.log(`  ✓ strategyCapS1 already configured correctly\n`);
        }

        // Configure strategyCapS2
        const currentStrategyCapS2 = await configManager.strategyCapS2();
        if (!currentStrategyCapS2.eq(CONFIG_STRATEGY_CAP_S2)) {
            console.log(`  Configuring strategyCapS2 to ${ethers.utils.formatUnits(CONFIG_STRATEGY_CAP_S2, 6)} tokens...`);
            const tx = await configManager.setStrategyCapS2(CONFIG_STRATEGY_CAP_S2, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ strategyCapS2 configured\n`);
        } else {
            console.log(`  ✓ strategyCapS2 already configured correctly\n`);
        }

        // Configure strategyCapS3
        const currentStrategyCapS3 = await configManager.strategyCapS3();
        if (!currentStrategyCapS3.eq(CONFIG_STRATEGY_CAP_S3)) {
            console.log(`  Configuring strategyCapS3 to ${ethers.utils.formatUnits(CONFIG_STRATEGY_CAP_S3, 6)} tokens...`);
            const tx = await configManager.setStrategyCapS3(CONFIG_STRATEGY_CAP_S3, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ strategyCapS3 configured\n`);
        } else {
            console.log(`  ✓ strategyCapS3 already configured correctly\n`);
        }

        // Configure feeRecipient (use deployer/owner)
        const currentConfigFeeRecipient = await configManager.feeRecipient();
        if (currentConfigFeeRecipient === ethers.constants.AddressZero || currentConfigFeeRecipient.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log(`  Configuring feeRecipient to ${deployer.address}...`);
            const tx = await configManager.setFeeRecipient(deployer.address, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ feeRecipient configured\n`);
        } else {
            console.log(`  ✓ feeRecipient already configured correctly\n`);
        }

        // Configure primaryOracle (use deployer/owner)
        const currentPrimaryOracle = await configManager.primaryOracle();
        if (currentPrimaryOracle === ethers.constants.AddressZero || currentPrimaryOracle.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log(`  Configuring primaryOracle to ${deployer.address}...`);
            const tx = await configManager.setPrimaryOracle(deployer.address, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ primaryOracle configured\n`);
        } else {
            console.log(`  ✓ primaryOracle already configured correctly\n`);
        }

        // Configure pauser (use deployer/owner)
        const currentPauser = await configManager.pauser();
        if (currentPauser === ethers.constants.AddressZero || currentPauser.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log(`  Configuring pauser to ${deployer.address}...`);
            const tx = await configManager.setPauser(deployer.address, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ pauser configured\n`);
        } else {
            console.log(`  ✓ pauser already configured correctly\n`);
        }

        // Configure harvester (use deployer/owner)
        const currentHarvester = await configManager.harvester();
        if (currentHarvester === ethers.constants.AddressZero || currentHarvester.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log(`  Configuring harvester to ${deployer.address}...`);
            const tx = await configManager.setHarvester(deployer.address, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ harvester configured\n`);
        } else {
            console.log(`  ✓ harvester already configured correctly\n`);
        }

        // Configure allocator (use deployer/owner)
        const currentAllocator = await configManager.allocator();
        if (currentAllocator === ethers.constants.AddressZero || currentAllocator.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log(`  Configuring allocator to ${deployer.address}...`);
            const tx = await configManager.setAllocator(deployer.address, await getTxOptions());
            await tx.wait();
            console.log(`  ✓ allocator configured\n`);
        } else {
            console.log(`  ✓ allocator already configured correctly\n`);
        }

        // Note: allowedVenues can be added via addAllowedVenue if needed
        // For now, we'll leave it empty as it's not critical for initial setup
        console.log(`  allowedVenues: Will remain empty for now (can be added later if needed)\n`);
    }

    console.log("==========================================");
    console.log("STEP 3: Configure Vault (Owner)");
    console.log("==========================================\n");

    // Verify that deployer is the owner
    const owner = await dbank.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.error(`ERROR: Deployer (${deployer.address}) is not the vault owner (${owner})`);
        process.exit(1);
    }

    // Configure bufferTargetBps
    const currentBufferTargetBps = await dbank.bufferTargetBps();
    if (currentBufferTargetBps.toString() !== BUFFER_TARGET_BPS.toString()) {
        console.log(`  Configuring bufferTargetBps to ${BUFFER_TARGET_BPS} (${BUFFER_TARGET_BPS / 100}%)...`);
        const tx = await dbank.setBufferTargetBps(BUFFER_TARGET_BPS, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ bufferTargetBps configured\n`);
    } else {
        console.log(`  ✓ bufferTargetBps already configured correctly\n`);
    }

    // Configure performanceFeeBps
    const currentPerformanceFeeBps = await dbank.performanceFeeBps();
    if (currentPerformanceFeeBps.toString() !== PERFORMANCE_FEE_BPS.toString()) {
        console.log(`  Configuring performanceFeeBps to ${PERFORMANCE_FEE_BPS} (${PERFORMANCE_FEE_BPS / 100}%)...`);
        const tx = await dbank.setPerformanceFeeBps(PERFORMANCE_FEE_BPS, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ performanceFeeBps configured\n`);
    } else {
        console.log(`  ✓ performanceFeeBps already configured correctly\n`);
    }

    // Configure feeRecipient (use deployer by default)
    const currentFeeRecipient = await dbank.feeRecipient();
    if (currentFeeRecipient === ethers.constants.AddressZero || currentFeeRecipient.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`  Configuring feeRecipient to ${deployer.address}...`);
        const tx = await dbank.setFeeRecipient(deployer.address, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ feeRecipient configured\n`);
    } else {
        console.log(`  ✓ feeRecipient already configured correctly\n`);
    }

    // Configure tvlCap
    const currentTvlCap = await dbank.tvlCap();
    if (!currentTvlCap.eq(TVL_CAP)) {
        console.log(`  Configuring tvlCap to ${ethers.utils.formatEther(TVL_CAP)} tokens...`);
        const tx = await dbank.setTvlCap(TVL_CAP, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ tvlCap configured\n`);
    } else {
        console.log(`  ✓ tvlCap already configured correctly\n`);
    }

    // Configure perTxCap
    const currentPerTxCap = await dbank.perTxCap();
    if (!currentPerTxCap.eq(PER_TX_CAP)) {
        console.log(`  Configuring perTxCap to ${ethers.utils.formatEther(PER_TX_CAP)} tokens...`);
        const tx = await dbank.setPerTxCap(PER_TX_CAP, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ perTxCap configured\n`);
    } else {
        console.log(`  ✓ perTxCap already configured correctly\n`);
    }

    // Ensure vault is not paused
    const isPaused = await dbank.paused();
    if (isPaused) {
        console.log(`  Unpausing vault...`);
        const tx = await dbank.pause(false, await getTxOptions());
        await tx.wait();
        console.log(`  ✓ Vault unpaused\n`);
    } else {
        console.log(`  ✓ Vault is already active (not paused)\n`);
    }

    console.log("==========================================");
    console.log("STEP 3.5: Verify StrategyRouter Configuration");
    console.log("==========================================\n");

    // Verify StrategyRouter owner
    const routerOwner = await strategyRouter.owner();
    if (routerOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`  ⚠ Warning: Deployer (${deployer.address}) is not the StrategyRouter owner (${routerOwner})`);
        console.log(`    Some operations may require the owner account.\n`);
    } else {
        console.log(`  ✓ Deployer is StrategyRouter owner\n`);
    }

    // Check registered strategies
    const totalStrategies = await strategyRouter.totalStrategies();
    console.log(`  Total registered strategies: ${totalStrategies}`);

    if (totalStrategies === 0) {
        console.log(`  ⚠ Warning: No strategies registered in StrategyRouter!`);
        console.log(`    Strategies should be registered during deployment.`);
        console.log(`    Expected: MockS1 (Strategy ID 1) should be registered.\n`);
    } else {
        // Check strategy S1 (MockS1)
        const strategy1Info = await strategyRouter.getStrategy(1);
        if (strategy1Info.strategy === ethers.constants.AddressZero) {
            console.log(`  ⚠ Warning: Strategy S1 (ID 1) is not registered\n`);
        } else {
            console.log(`  ✓ Strategy S1 (ID 1) is registered:`);
            console.log(`    Address: ${strategy1Info.strategy}`);
            console.log(`    Active: ${strategy1Info.active}`);
            console.log(`    Cap: ${ethers.utils.formatEther(strategy1Info.cap)} tokens`);
            console.log(`    Allocated: ${ethers.utils.formatEther(strategy1Info.allocated)} tokens`);
            
            // Get MockS1 address from router if not provided
            const mockS1Address = MOCKS1_ADDRESS || strategy1Info.strategy;
            
            // If we don't have mockS1 instance yet, create it
            if (!mockS1 && mockS1Address) {
                mockS1 = MockS1.attach(mockS1Address);
                console.log(`    ✓ Attached to MockS1 at ${mockS1Address}`);
            }
            
            // Check MockS1 state if we have the instance
            if (mockS1) {
                try {
                    const [aprBps, cap, paused, principal] = await mockS1.params();
                    const accumulator = await mockS1.accumulator();
                    const totalAssets = await mockS1.totalAssets();
                    
                    console.log(`    MockS1 state:`);
                    console.log(`      APR: ${aprBps.toString()} bps (${aprBps.toNumber() / 100}%)`);
                    console.log(`      Cap: ${ethers.utils.formatEther(cap)} tokens`);
                    console.log(`      Paused: ${paused}`);
                    console.log(`      Principal: ${ethers.utils.formatEther(principal)} tokens`);
                    console.log(`      Accumulator: ${ethers.utils.formatEther(accumulator)}`);
                    console.log(`      Total Assets: ${ethers.utils.formatEther(totalAssets)} tokens`);
                    
                    // Verify address matches
                    if (MOCKS1_ADDRESS && strategy1Info.strategy.toLowerCase() !== MOCKS1_ADDRESS.toLowerCase()) {
                        console.log(`    ⚠ Warning: Registered address (${strategy1Info.strategy}) does not match provided MockS1 address (${MOCKS1_ADDRESS})`);
                    }
                } catch (error) {
                    console.log(`    ⚠ Could not read MockS1 params: ${error.message}`);
                }
            }
            console.log();
        }

        // Check for other strategies (S2, S3)
        for (let i = 2; i <= 3; i++) {
            const strategyInfo = await strategyRouter.getStrategy(i);
            if (strategyInfo.strategy !== ethers.constants.AddressZero) {
                console.log(`  Strategy S${i} (ID ${i}):`);
                console.log(`    Address: ${strategyInfo.strategy}`);
                console.log(`    Active: ${strategyInfo.active}`);
                console.log(`    Cap: ${ethers.utils.formatEther(strategyInfo.cap)} tokens`);
                console.log(`    Allocated: ${ethers.utils.formatEther(strategyInfo.allocated)} tokens\n`);
            }
        }
    }

    // Check router's token balance and allowance
    const routerBalance = await token.balanceOf(STRATEGY_ROUTER_ADDRESS);
    console.log(`  StrategyRouter token balance: ${ethers.utils.formatEther(routerBalance)} tokens`);

    // Check if vault has approved router (if needed for future operations)
    const vaultRouterAllowance = await token.allowance(DBANK_ADDRESS, STRATEGY_ROUTER_ADDRESS);
    console.log(`  Vault's allowance to router: ${ethers.utils.formatEther(vaultRouterAllowance)} tokens\n`);

    console.log("==========================================");
    console.log("STEP 4: Initial Deposits");
    console.log("==========================================\n");

    // --- Deployer deposit (so the MetaMask default account has a vault position) ---
    {
        const deployerBal = await token.balanceOf(deployer.address);
        if (deployerBal.gte(DEPOSIT_AMOUNT_DEPLOYER)) {
            console.log(`  Performing deposit from deployer (${deployer.address})...`);
            console.log(`    Amount: ${ethers.utils.formatEther(DEPOSIT_AMOUNT_DEPLOYER)} tokens`);

            // Approve dBank to spend deployer tokens
            const allowance = await token.allowance(deployer.address, DBANK_ADDRESS);
            if (allowance.lt(DEPOSIT_AMOUNT_DEPLOYER)) {
                const approveTx = await token.approve(DBANK_ADDRESS, DEPOSIT_AMOUNT_DEPLOYER, await getTxOptions());
                await approveTx.wait();
                console.log(`    ✓ Allowance approved`);
            }

            try {
                const previewShares = await dbank.previewDeposit(DEPOSIT_AMOUNT_DEPLOYER);
                console.log(`    Expected shares: ${ethers.utils.formatEther(previewShares)}`);

                const tx = await dbank.deposit(DEPOSIT_AMOUNT_DEPLOYER, deployer.address, await getTxOptions());
                const receipt = await tx.wait();

                const depositEvent = receipt.events.find(e => e.event === 'Deposit');
                if (depositEvent) {
                    const { assets, shares } = depositEvent.args;
                    console.log(`    ✓ Deployer deposit successful:`);
                    console.log(`      Assets: ${ethers.utils.formatEther(assets)} tokens`);
                    console.log(`      Shares: ${ethers.utils.formatEther(shares)}\n`);
                } else {
                    console.log(`    ✓ Deployer deposit completed\n`);
                }
            } catch (error) {
                console.error(`    ✗ Deployer deposit error: ${error.message}\n`);
            }
        } else {
            console.log(`  ⚠ Deployer does not have sufficient funds to deposit ${ethers.utils.formatEther(DEPOSIT_AMOUNT_DEPLOYER)} tokens\n`);
        }
    }

    // Perform deposits from test accounts
    const depositAmounts = [DEPOSIT_AMOUNT_USER1, DEPOSIT_AMOUNT_USER2, DEPOSIT_AMOUNT_USER3];

    for (let i = 0; i < NUM_SEED_USERS; i++) {
        const user = users[i];
        const depositAmount = depositAmounts[i] || depositAmounts[0];
        const userBalance = await token.balanceOf(user.address);

        if (userBalance.lt(depositAmount)) {
            console.log(`  ⚠ User ${i + 1} does not have sufficient funds to deposit ${ethers.utils.formatEther(depositAmount)} tokens`);
            console.log(`    Available balance: ${ethers.utils.formatEther(userBalance)} tokens\n`);
            continue;
        }

        console.log(`  Performing deposit from user ${i + 1} (${user.address})...`);
        console.log(`    Amount: ${ethers.utils.formatEther(depositAmount)} tokens`);

        try {
            const dbankUser = dbank.connect(user);
            const previewShares = await dbankUser.previewDeposit(depositAmount);
            console.log(`    Expected shares: ${ethers.utils.formatEther(previewShares)}`);

            const tx = await dbankUser.deposit(depositAmount, user.address);
            const receipt = await tx.wait();

            // Extract information from Deposit event
            const depositEvent = receipt.events.find(e => e.event === 'Deposit');
            if (depositEvent) {
                const { assets, shares } = depositEvent.args;
                console.log(`    ✓ Deposit successful:`);
                console.log(`      Assets: ${ethers.utils.formatEther(assets)} tokens`);
                console.log(`      Shares: ${ethers.utils.formatEther(shares)}\n`);
            } else {
                console.log(`    ✓ Deposit completed\n`);
            }
        } catch (error) {
            console.error(`    ✗ Deposit error: ${error.message}\n`);
        }
    }

    console.log("==========================================");
    console.log("STEP 5: Final State and Validations");
    console.log("==========================================\n");

    // Get final state
    const totalAssets = await dbank.totalAssets();
    const totalSupply = await dbank.totalSupply();
    const buffer = await dbank.buffer();
    const routerAssets = await strategyRouter.totalAssets();
    const pricePerShare = totalSupply.gt(0) 
        ? totalAssets.mul(ethers.utils.parseUnits('1', 18)).div(totalSupply)
        : ethers.utils.parseUnits('1', 18);

    console.log("Vault State:");
    console.log(`  totalAssets:       ${ethers.utils.formatEther(totalAssets)} tokens`);
    console.log(`  totalSupply:       ${ethers.utils.formatEther(totalSupply)} shares`);
    console.log(`  buffer:            ${ethers.utils.formatEther(buffer)} tokens`);
    console.log(`  router.totalAssets: ${ethers.utils.formatEther(routerAssets)} tokens`);
    console.log(`  pricePerShare:     ${ethers.utils.formatEther(pricePerShare)} (1e18 = 1.0)`);

    // StrategyRouter state
    const routerTotalStrategies = await strategyRouter.totalStrategies();
    const routerTotalAllocated = await strategyRouter.getTotalAllocated();
    console.log(`\nStrategyRouter State:`);
    console.log(`  totalStrategies:  ${routerTotalStrategies}`);
    console.log(`  totalAllocated:   ${ethers.utils.formatEther(routerTotalAllocated)} tokens`);
    console.log(`  routerBalance:    ${ethers.utils.formatEther(await token.balanceOf(STRATEGY_ROUTER_ADDRESS))} tokens`);

    // Validation: totalAssets ≈ buffer + router.totalAssets()
    const expectedTotalAssets = buffer.add(routerAssets);
    const diff = totalAssets.sub(expectedTotalAssets).abs();
    if (diff.lt(ethers.utils.parseUnits('1', 15))) { // Tolerance of 0.001 tokens
        console.log(`  ✓ Validation: totalAssets ≈ buffer + router.totalAssets (difference: ${ethers.utils.formatEther(diff)} tokens)`);
    } else {
        console.log(`  ⚠ Warning: totalAssets does not exactly match buffer + router.totalAssets`);
        console.log(`    Expected: ${ethers.utils.formatEther(expectedTotalAssets)} tokens`);
        console.log(`    Actual:   ${ethers.utils.formatEther(totalAssets)} tokens`);
        console.log(`    Difference: ${ethers.utils.formatEther(diff)} tokens`);
    }

    // Show user balances
    console.log("\nUser Balances:");
    for (let i = 0; i < NUM_SEED_USERS; i++) {
        const user = users[i];
        const tokenBalance = await token.balanceOf(user.address);
        const sharesBalance = await dbank.balanceOf(user.address);
        const assetsFromShares = sharesBalance.gt(0) 
            ? await dbank.convertToAssets(sharesBalance)
            : ethers.BigNumber.from(0);

        console.log(`  User ${i + 1} (${user.address}):`);
        console.log(`    Token balance:  ${ethers.utils.formatEther(tokenBalance)} tokens`);
        console.log(`    Vault shares:   ${ethers.utils.formatEther(sharesBalance)} shares`);
        console.log(`    Vault assets:   ${ethers.utils.formatEther(assetsFromShares)} tokens`);
    }

    // Vault configuration
    const bufferTargetBps = await dbank.bufferTargetBps();
    const performanceFeeBps = await dbank.performanceFeeBps();
    const feeRecipient = await dbank.feeRecipient();
    const tvlCap = await dbank.tvlCap();
    const perTxCap = await dbank.perTxCap();
    const paused = await dbank.paused();

    console.log("\nVault Configuration:");
    console.log(`  bufferTargetBps:   ${bufferTargetBps} (${bufferTargetBps / 100}%)`);
    console.log(`  performanceFeeBps: ${performanceFeeBps} (${performanceFeeBps / 100}%)`);
    console.log(`  feeRecipient:      ${feeRecipient}`);
    console.log(`  tvlCap:            ${ethers.utils.formatEther(tvlCap)} tokens`);
    console.log(`  perTxCap:          ${ethers.utils.formatEther(perTxCap)} tokens`);
    console.log(`  paused:            ${paused ? 'Yes' : 'No'}`);

    // ConfigManager configuration summary
    const configLiquidityBufferBps = await configManager.liquidityBufferBps();
    const configMaxSlippageBps = await configManager.maxSlippageBps();
    const configTvlGlobalCap = await configManager.tvlGlobalCap();
    const configPerTxCap = await configManager.perTxCap();
    const configPerformanceFeeBps = await configManager.performanceFeeBps();
    const configEpochDuration = await configManager.epochDuration();
    const configSettlementWindowUTC = await configManager.settlementWindowUTC();
    const configStrategyCapS1 = await configManager.strategyCapS1();
    const configStrategyCapS2 = await configManager.strategyCapS2();
    const configStrategyCapS3 = await configManager.strategyCapS3();
    const configFeeRecipient = await configManager.feeRecipient();

    console.log("\nConfigManager Configuration:");
    console.log(`  liquidityBufferBps: ${configLiquidityBufferBps} (${configLiquidityBufferBps / 100}%)`);
    console.log(`  maxSlippageBps:     ${configMaxSlippageBps} (${configMaxSlippageBps / 10}%)`);
    console.log(`  tvlGlobalCap:       ${ethers.utils.formatUnits(configTvlGlobalCap, 6)} tokens`);
    console.log(`  perTxCap:           ${ethers.utils.formatUnits(configPerTxCap, 6)} tokens`);
    console.log(`  performanceFeeBps:  ${configPerformanceFeeBps} (${configPerformanceFeeBps / 100}%)`);
    console.log(`  epochDuration:     ${configEpochDuration} days`);
    console.log(`  settlementWindowUTC: ${configSettlementWindowUTC} seconds (${configSettlementWindowUTC / 3600} hours)`);
    console.log(`  strategyCapS1:      ${ethers.utils.formatUnits(configStrategyCapS1, 6)} tokens`);
    console.log(`  strategyCapS2:      ${ethers.utils.formatUnits(configStrategyCapS2, 6)} tokens`);
    console.log(`  strategyCapS3:      ${ethers.utils.formatUnits(configStrategyCapS3, 6)} tokens`);
    console.log(`  feeRecipient:       ${configFeeRecipient || 'Not set'}`);

    console.log("\n==========================================");
    console.log("✓ SEED COMPLETED");
    console.log("==========================================\n");
}

// Run the script
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

