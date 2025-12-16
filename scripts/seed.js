// Seeding script to initialize test/demo environment
// Seed balances, allowances, and initial vault configuration
//
// Usage: npx hardhat run scripts/seed.js --network <network>
// Requires environment variables or parameters with deployed contract addresses

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = require("hardhat");

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

async function main() {
    const [deployer, ...users] = await ethers.getSigners();
    console.log("Running seed with account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    // ============================================================
    // Configuration: Deployed contract addresses
    // ============================================================
    // Addresses can come from environment variables or be passed as arguments
    // By default, we try to get them from process.env
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || process.argv[2];
    const DBANK_ADDRESS = process.env.DBANK_ADDRESS || process.argv[3];
    const STRATEGY_ROUTER_ADDRESS = process.env.STRATEGY_ROUTER_ADDRESS || process.argv[4];
    const CONFIG_MANAGER_ADDRESS = process.env.CONFIG_MANAGER_ADDRESS || process.argv[5];

    if (!TOKEN_ADDRESS || !DBANK_ADDRESS || !STRATEGY_ROUTER_ADDRESS || !CONFIG_MANAGER_ADDRESS) {
        console.error("ERROR: Missing contract addresses.");
        console.error("Use environment variables or pass addresses as arguments:");
        console.error("  TOKEN_ADDRESS=<addr> DBANK_ADDRESS=<addr> STRATEGY_ROUTER_ADDRESS=<addr> CONFIG_MANAGER_ADDRESS=<addr> npx hardhat run scripts/seed.js --network <network>");
        console.error("Or:");
        console.error("  npx hardhat run scripts/seed.js --network <network> <token> <dbank> <router> <config>");
        process.exit(1);
    }

    console.log("Contract addresses:");
    console.log(`  Token:              ${TOKEN_ADDRESS}`);
    console.log(`  dBank:              ${DBANK_ADDRESS}`);
    console.log(`  StrategyRouter:     ${STRATEGY_ROUTER_ADDRESS}`);
    console.log(`  ConfigManager:      ${CONFIG_MANAGER_ADDRESS}\n`);

    // ============================================================
    // Get contract instances
    // ============================================================
    const Token = await ethers.getContractFactory('Token');
    const dBank = await ethers.getContractFactory('dBank');
    const StrategyRouter = await ethers.getContractFactory('StrategyRouter');

    const token = Token.attach(TOKEN_ADDRESS);
    const dbank = dBank.attach(DBANK_ADDRESS);
    const strategyRouter = StrategyRouter.attach(STRATEGY_ROUTER_ADDRESS);

    // Get token decimals
    tokenDecimals = await getTokenDecimals(token);
    console.log(`Token decimals: ${tokenDecimals}\n`);

    // ============================================================
    // Configuration parameters
    // ============================================================
    const BUFFER_TARGET_BPS = 1200; // 12%
    const PERFORMANCE_FEE_BPS = 2500; // 25% (2500 bps)
    const TVL_CAP = tokens(100000); // 100K tokens
    const PER_TX_CAP = tokens(5000); // 5K tokens per transaction

    // Amounts to fund test accounts
    const USER_BALANCE = tokens(100000); // 100K tokens per user
    const DEPOSIT_AMOUNT_USER1 = tokens(10000); // 10K tokens
    const DEPOSIT_AMOUNT_USER2 = tokens(5000);  // 5K tokens
    const DEPOSIT_AMOUNT_USER3 = tokens(3000);  // 3K tokens

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
        const requiredAllowance = tokens(1000000); // Approve 1M tokens (more than enough)

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
        const tx = await dbank.setBufferTargetBps(BUFFER_TARGET_BPS);
        await tx.wait();
        console.log(`  ✓ bufferTargetBps configured\n`);
    } else {
        console.log(`  ✓ bufferTargetBps already configured correctly\n`);
    }

    // Configure performanceFeeBps
    const currentPerformanceFeeBps = await dbank.performanceFeeBps();
    if (currentPerformanceFeeBps.toString() !== PERFORMANCE_FEE_BPS.toString()) {
        console.log(`  Configuring performanceFeeBps to ${PERFORMANCE_FEE_BPS} (${PERFORMANCE_FEE_BPS / 100}%)...`);
        const tx = await dbank.setPerformanceFeeBps(PERFORMANCE_FEE_BPS);
        await tx.wait();
        console.log(`  ✓ performanceFeeBps configured\n`);
    } else {
        console.log(`  ✓ performanceFeeBps already configured correctly\n`);
    }

    // Configure feeRecipient (use deployer by default)
    const currentFeeRecipient = await dbank.feeRecipient();
    if (currentFeeRecipient === ethers.constants.AddressZero || currentFeeRecipient.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`  Configuring feeRecipient to ${deployer.address}...`);
        const tx = await dbank.setFeeRecipient(deployer.address);
        await tx.wait();
        console.log(`  ✓ feeRecipient configured\n`);
    } else {
        console.log(`  ✓ feeRecipient already configured correctly\n`);
    }

    // Configure tvlCap
    const currentTvlCap = await dbank.tvlCap();
    if (!currentTvlCap.eq(TVL_CAP)) {
        console.log(`  Configuring tvlCap to ${ethers.utils.formatEther(TVL_CAP)} tokens...`);
        const tx = await dbank.setTvlCap(TVL_CAP);
        await tx.wait();
        console.log(`  ✓ tvlCap configured\n`);
    } else {
        console.log(`  ✓ tvlCap already configured correctly\n`);
    }

    // Configure perTxCap
    const currentPerTxCap = await dbank.perTxCap();
    if (!currentPerTxCap.eq(PER_TX_CAP)) {
        console.log(`  Configuring perTxCap to ${ethers.utils.formatEther(PER_TX_CAP)} tokens...`);
        const tx = await dbank.setPerTxCap(PER_TX_CAP);
        await tx.wait();
        console.log(`  ✓ perTxCap configured\n`);
    } else {
        console.log(`  ✓ perTxCap already configured correctly\n`);
    }

    // Ensure vault is not paused
    const isPaused = await dbank.paused();
    if (isPaused) {
        console.log(`  Unpausing vault...`);
        const tx = await dbank.pause(false);
        await tx.wait();
        console.log(`  ✓ Vault unpaused\n`);
    } else {
        console.log(`  ✓ Vault is already active (not paused)\n`);
    }

    console.log("==========================================");
    console.log("STEP 4: Initial Deposits");
    console.log("==========================================\n");

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

    console.log("\n==========================================");
    console.log("✓ SEED COMPLETED");
    console.log("==========================================\n");
}

// Run the script
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

