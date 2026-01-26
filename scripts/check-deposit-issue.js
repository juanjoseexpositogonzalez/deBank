// Script to diagnose deposit issues on Base Sepolia
// Checks caps, balances, allowances, and maxDeposit

require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
    const network = hre.network.name;
    const { chainId } = await ethers.provider.getNetwork();
    const isBaseSepolia = network === "baseSepolia" || chainId === 84532;

    if (!isBaseSepolia) {
        console.error("This script is designed for Base Sepolia. Exiting.");
        process.exit(1);
    }

    console.log(`Checking deposit configuration on ${network} (chainId=${chainId})\n`);

    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    const chainKey = String(chainId);
    const cfgNet = config[chainKey] || {};

    const TOKEN_ADDRESS = cfgNet.token?.address;
    const DBANK_ADDRESS = cfgNet.dbank?.address;

    if (!TOKEN_ADDRESS || !DBANK_ADDRESS) {
        console.error("ERROR: Missing contract addresses in config.json");
        process.exit(1);
    }

    console.log("Contract addresses:");
    console.log(`  Token:  ${TOKEN_ADDRESS}`);
    console.log(`  dBank:  ${DBANK_ADDRESS}\n`);

    // Get contract instances
    const Token = await ethers.getContractFactory('Token');
    const dBank = await ethers.getContractFactory('dBank');

    const token = Token.attach(TOKEN_ADDRESS);
    const dbank = dBank.attach(DBANK_ADDRESS);

    // Get token decimals
    const tokenDecimals = await token.decimals();
    console.log(`Token decimals: ${tokenDecimals}\n`);

    // Check user balance
    const userBalance = await token.balanceOf(deployer.address);
    const userBalanceFormatted = ethers.utils.formatUnits(userBalance, tokenDecimals);
    console.log(`User token balance: ${userBalanceFormatted} tokens`);
    console.log(`User token balance (wei): ${userBalance.toString()}\n`);

    // Check allowance
    const allowance = await token.allowance(deployer.address, DBANK_ADDRESS);
    const allowanceFormatted = ethers.utils.formatUnits(allowance, tokenDecimals);
    console.log(`Allowance for dBank: ${allowanceFormatted} tokens`);
    console.log(`Allowance (wei): ${allowance.toString()}\n`);

    // Check dBank caps
    const tvlCap = await dbank.tvlCap();
    const perTxCap = await dbank.perTxCap();
    const tvlCapFormatted = ethers.utils.formatUnits(tvlCap, tokenDecimals);
    const perTxCapFormatted = ethers.utils.formatUnits(perTxCap, tokenDecimals);
    console.log(`dBank tvlCap: ${tvlCapFormatted} tokens (${tvlCap.toString()} wei)`);
    console.log(`dBank perTxCap: ${perTxCapFormatted} tokens (${perTxCap.toString()} wei)\n`);

    // Check total assets
    const totalAssets = await dbank.totalAssets();
    const totalAssetsFormatted = ethers.utils.formatUnits(totalAssets, tokenDecimals);
    console.log(`dBank totalAssets: ${totalAssetsFormatted} tokens (${totalAssets.toString()} wei)\n`);

    // Check maxDeposit
    const maxDeposit = await dbank.maxDeposit(deployer.address);
    const maxDepositFormatted = ethers.utils.formatUnits(maxDeposit, tokenDecimals);
    console.log(`maxDeposit for user: ${maxDepositFormatted} tokens (${maxDeposit.toString()} wei)\n`);

    // Check if paused
    const paused = await dbank.paused();
    console.log(`dBank paused: ${paused}\n`);

    // Test deposit amount: 5000 tokens
    const testAmount = ethers.utils.parseUnits("5000", tokenDecimals);
    console.log(`Testing deposit amount: 5000 tokens (${testAmount.toString()} wei)\n`);

    // Check if test amount exceeds maxDeposit
    if (testAmount.gt(maxDeposit)) {
        console.log("❌ ERROR: Test amount (5000 tokens) exceeds maxDeposit!");
        console.log(`   maxDeposit: ${maxDepositFormatted} tokens`);
        console.log(`   testAmount: 5000 tokens`);
        console.log(`   Difference: ${ethers.utils.formatUnits(testAmount.sub(maxDeposit), tokenDecimals)} tokens\n`);
    } else {
        console.log("✓ Test amount is within maxDeposit limit\n");
    }

    // Check if test amount exceeds perTxCap
    if (testAmount.gt(perTxCap)) {
        console.log("❌ ERROR: Test amount (5000 tokens) exceeds perTxCap!");
        console.log(`   perTxCap: ${perTxCapFormatted} tokens`);
        console.log(`   testAmount: 5000 tokens`);
        console.log(`   Difference: ${ethers.utils.formatUnits(testAmount.sub(perTxCap), tokenDecimals)} tokens\n`);
    } else {
        console.log("✓ Test amount is within perTxCap limit\n");
    }

    // Check if user has enough balance
    if (testAmount.gt(userBalance)) {
        console.log("❌ ERROR: User doesn't have enough balance!");
        console.log(`   User balance: ${userBalanceFormatted} tokens`);
        console.log(`   Test amount: 5000 tokens`);
        console.log(`   Difference: ${ethers.utils.formatUnits(testAmount.sub(userBalance), tokenDecimals)} tokens\n`);
    } else {
        console.log("✓ User has sufficient balance\n");
    }

    // Check if user has enough allowance
    if (testAmount.gt(allowance)) {
        console.log("⚠️  WARNING: User doesn't have enough allowance!");
        console.log(`   Current allowance: ${allowanceFormatted} tokens`);
        console.log(`   Test amount: 5000 tokens`);
        console.log(`   Additional allowance needed: ${ethers.utils.formatUnits(testAmount.sub(allowance), tokenDecimals)} tokens\n`);
    } else {
        console.log("✓ User has sufficient allowance\n");
    }

    console.log("\n=== Summary ===");
    console.log(`Can deposit 5000 tokens? ${testAmount.lte(maxDeposit) && testAmount.lte(perTxCap) && testAmount.lte(userBalance) && !paused ? 'YES' : 'NO'}`);
    if (testAmount.gt(allowance)) {
        console.log("Note: Approval transaction will be needed first.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
