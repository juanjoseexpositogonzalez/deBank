// Deploy Token contract to Base Sepolia
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Token to Base Sepolia with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Get current nonce
  let nonce = await deployer.getTransactionCount("pending");
  console.log(`Starting with nonce: ${nonce}\n`);

  // Get gas price and increase it slightly
  const gasPrice = await deployer.provider.getGasPrice();
  const increasedGasPrice = gasPrice.mul(110).div(100);
  console.log(`Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (using ${ethers.utils.formatUnits(increasedGasPrice, 'gwei')} gwei)\n`);

  const TOKEN_NAME = 'USDC Token';
  const TOKEN_SYMBOL = 'USDC';
  const TOKEN_MAX_SUPPLY = '10000000'; // 10 million tokens

  // Deploy Token
  console.log("Deploying Token...");
  const Token = await ethers.getContractFactory('Token');
  const token = await Token.deploy(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_MAX_SUPPLY, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  await token.deployed();
  console.log(`✓ Token deployed at: ${token.address}\n`);

  // Wait for confirmation before reading
  console.log("Waiting for transaction confirmation...");
  await token.deployTransaction.wait(2);

  // Verify token details
  let name, symbol, decimals, totalSupply, deployerBalance;
  try {
    name = await token.name();
    symbol = await token.symbol();
    decimals = await token.decimals();
    totalSupply = await token.totalSupply();
    deployerBalance = await token.balanceOf(deployer.address);
  } catch (error) {
    console.log("⚠ Could not read token details immediately, using defaults...");
    name = TOKEN_NAME;
    symbol = TOKEN_SYMBOL;
    decimals = 18;
    totalSupply = ethers.utils.parseUnits(TOKEN_MAX_SUPPLY, 18);
    deployerBalance = totalSupply; // Deployer gets all tokens
  }

  console.log("Token Details:");
  console.log(`  Name: ${name}`);
  console.log(`  Symbol: ${symbol}`);
  console.log(`  Decimals: ${decimals}`);
  console.log(`  Total Supply: ${ethers.utils.formatEther(totalSupply)} ${symbol}`);
  console.log(`  Deployer Balance: ${ethers.utils.formatEther(deployerBalance)} ${symbol}\n`);

  // Update config.json
  console.log("Updating src/config.json...");
  const configPath = path.join(__dirname, '../src/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  config['84532'] = {
    ...config['84532'],
    token: {
      address: token.address
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("✓ config.json updated with new token address\n");

  // Optional verification
  if (process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY) {
    console.log("Waiting for confirmations before verifying...");
    await token.deployTransaction.wait(5);

    console.log("Verifying Token on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: token.address,
        constructorArguments: [TOKEN_NAME, TOKEN_SYMBOL, TOKEN_MAX_SUPPLY],
      });
      console.log("✓ Token verified on Basescan\n");
    } catch (error) {
      console.log("⚠ Verification error:", error.message);
    }
  }

  console.log("==========================================");
  console.log("TOKEN DEPLOYMENT SUMMARY");
  console.log("==========================================");
  console.log(`Token Address: ${token.address}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer Balance: ${ethers.utils.formatEther(deployerBalance)} ${symbol}`);
  console.log("==========================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
