// Check USDC token details
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const [deployer] = await ethers.getSigners();
    
    console.log("Checking USDC token details...");
    console.log("Address:", USDC_ADDRESS);
    console.log("Deployer:", deployer.address);
    
    try {
        const token = await ethers.getContractAt('Token', USDC_ADDRESS);
        
        const name = await token.name();
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        const balance = await token.balanceOf(deployer.address);
        const totalSupply = await token.totalSupply();
        
        console.log("\nToken Info:");
        console.log(`  Name: ${name}`);
        console.log(`  Symbol: ${symbol}`);
        console.log(`  Decimals: ${decimals}`);
        console.log(`  Total Supply: ${ethers.utils.formatUnits(totalSupply, decimals)} ${symbol}`);
        console.log(`\nDeployer Balance:`);
        console.log(`  ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
        console.log(`  Raw: ${balance.toString()}`);
        
        // Check if deployer can transfer (has balance)
        if (balance.gt(0)) {
            console.log("\n✓ Deployer has USDC balance - seed should work");
        } else {
            console.log("\n⚠ Deployer has 0 USDC - seed cannot transfer tokens");
            console.log("  You need to obtain USDC test tokens first");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main().catch(console.error);
