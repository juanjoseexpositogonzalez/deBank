// Quick script to check USDC balance
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    
    console.log("Checking balance for:", deployer.address);
    
    const token = await ethers.getContractAt('Token', USDC_ADDRESS);
    const balance = await token.balanceOf(deployer.address);
    
    console.log(`USDC Balance: ${ethers.utils.formatUnits(balance, 6)} USDC`);
    console.log(`Balance in wei: ${balance.toString()}`);
}

main().catch(console.error);
