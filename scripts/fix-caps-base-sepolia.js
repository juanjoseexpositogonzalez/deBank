// Script to fix caps on Base Sepolia
// Sets correct tvlCap and perTxCap for 18-decimal token

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

    console.log(`Fixing caps on ${network} (chainId=${chainId})\n`);

    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    // Get current nonce
    let nonce = await deployer.getTransactionCount("pending");
    console.log(`Starting with nonce: ${nonce}\n`);

    // Get gas price and increase it slightly
    const gasPrice = await deployer.provider.getGasPrice();
    const increasedGasPrice = gasPrice.mul(110).div(100);
    console.log(`Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (using ${ethers.utils.formatUnits(increasedGasPrice, 'gwei')} gwei)\n`);

    const getTxOptions = () => ({
        nonce: nonce++,
        gasPrice: increasedGasPrice
    });

    const chainKey = String(chainId);
    const cfgNet = config[chainKey] || {};

    const DBANK_ADDRESS = cfgNet.dbank?.address;

    if (!DBANK_ADDRESS) {
        console.error("ERROR: Missing dBank address in config.json");
        process.exit(1);
    }

    console.log("dBank address:", DBANK_ADDRESS, "\n");

    // Get contract instance
    const dBank = await ethers.getContractFactory('dBank');
    const dbank = dBank.attach(DBANK_ADDRESS);

    // Get token decimals (should be 18)
    const Token = await ethers.getContractFactory('Token');
    const tokenAddress = cfgNet.token?.address;
    const token = Token.attach(tokenAddress);
    const tokenDecimals = await token.decimals();
    console.log(`Token decimals: ${tokenDecimals}\n`);

    // Correct caps for Base Sepolia (18 decimals)
    const TVL_CAP = ethers.utils.parseUnits("100000", tokenDecimals); // 100,000 tokens
    const PER_TX_CAP = ethers.utils.parseUnits("5000", tokenDecimals); // 5,000 tokens

    console.log("Target caps:");
    console.log(`  tvlCap: ${ethers.utils.formatUnits(TVL_CAP, tokenDecimals)} tokens`);
    console.log(`  perTxCap: ${ethers.utils.formatUnits(PER_TX_CAP, tokenDecimals)} tokens\n`);

    // Check current caps
    const currentTvlCap = await dbank.tvlCap();
    const currentPerTxCap = await dbank.perTxCap();

    console.log("Current caps:");
    console.log(`  tvlCap: ${ethers.utils.formatUnits(currentTvlCap, tokenDecimals)} tokens`);
    console.log(`  perTxCap: ${ethers.utils.formatUnits(currentPerTxCap, tokenDecimals)} tokens\n`);

    // Update tvlCap if needed
    if (!currentTvlCap.eq(TVL_CAP)) {
        console.log(`Updating tvlCap to ${ethers.utils.formatUnits(TVL_CAP, tokenDecimals)} tokens...`);
        const tx1 = await dbank.setTvlCap(TVL_CAP, getTxOptions());
        await tx1.wait();
        console.log(`✓ tvlCap updated. Tx: ${tx1.hash}\n`);
    } else {
        console.log(`✓ tvlCap already correct\n`);
    }

    // Update perTxCap if needed
    if (!currentPerTxCap.eq(PER_TX_CAP)) {
        console.log(`Updating perTxCap to ${ethers.utils.formatUnits(PER_TX_CAP, tokenDecimals)} tokens...`);
        const tx2 = await dbank.setPerTxCap(PER_TX_CAP, getTxOptions());
        await tx2.wait();
        console.log(`✓ perTxCap updated. Tx: ${tx2.hash}\n`);
    } else {
        console.log(`✓ perTxCap already correct\n`);
    }

    // Verify final caps
    const finalTvlCap = await dbank.tvlCap();
    const finalPerTxCap = await dbank.perTxCap();

    console.log("Final caps:");
    console.log(`  tvlCap: ${ethers.utils.formatUnits(finalTvlCap, tokenDecimals)} tokens`);
    console.log(`  perTxCap: ${ethers.utils.formatUnits(finalPerTxCap, tokenDecimals)} tokens\n`);

    // Check maxDeposit
    const maxDeposit = await dbank.maxDeposit(deployer.address);
    console.log(`maxDeposit for user: ${ethers.utils.formatUnits(maxDeposit, tokenDecimals)} tokens\n`);

    console.log("✓ Caps fixed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
