// Redeploy all contracts in Base Sepolia with the new Token
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying contracts to Base Sepolia with new Token");
  console.log("Deployer:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Get current nonce
  let nonce = await deployer.getTransactionCount("pending");
  console.log(`Starting with nonce: ${nonce}\n`);

  // Get gas price
  const gasPrice = await deployer.provider.getGasPrice();
  const increasedGasPrice = gasPrice.mul(110).div(100);
  console.log(`Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei\n`);

  const getTxOptions = () => ({
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });

  // Get token address from config
  const configPath = path.join(__dirname, '../src/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const TOKEN_ADDRESS = config['84532']?.token?.address;

  if (!TOKEN_ADDRESS) {
    console.error("ERROR: Token address not found in config.json");
    process.exit(1);
  }

  console.log(`Using Token: ${TOKEN_ADDRESS}\n`);

  const VAULT_NAME = 'dBank USDC Vault';
  const VAULT_SYMBOL = 'dbUSDC';
  const S1_APR_BPS = 500; // 5% APR
  const S1_CAP = ethers.utils.parseUnits('1000000', 18); // 1M tokens (18 decimals)
  const S1_STRATEGY_ID = 1;

  // 1. Deploy ConfigManager
  console.log("1. Deploying ConfigManager...");
  const ConfigManager = await ethers.getContractFactory('ConfigManager');
  const configManager = await ConfigManager.deploy(getTxOptions());
  await configManager.deployed();
  console.log(`   ✓ ConfigManager: ${configManager.address}\n`);

  // 2. Deploy StrategyRouter
  console.log("2. Deploying StrategyRouter...");
  const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
  const strategyRouter = await StrategyRouter.deploy(TOKEN_ADDRESS, configManager.address, getTxOptions());
  await strategyRouter.deployed();
  console.log(`   ✓ StrategyRouter: ${strategyRouter.address}\n`);

  // 3. Deploy MockS1
  console.log("3. Deploying MockS1...");
  const MockS1 = await ethers.getContractFactory('MockS1');
  const mockS1 = await MockS1.deploy(TOKEN_ADDRESS, getTxOptions());
  await mockS1.deployed();
  console.log(`   ✓ MockS1: ${mockS1.address}`);

  await mockS1.setParams(S1_APR_BPS, S1_CAP, getTxOptions());
  console.log(`   ✓ MockS1 configured\n`);

  // 4. Register MockS1
  console.log("4. Registering MockS1...");
  await strategyRouter.registerStrategy(S1_STRATEGY_ID, mockS1.address, S1_CAP, getTxOptions());
  console.log(`   ✓ MockS1 registered\n`);

  // 5. Deploy dBank
  console.log("5. Deploying dBank...");
  const dBank = await ethers.getContractFactory('dBank');
  const dbank = await dBank.deploy(
    TOKEN_ADDRESS,
    VAULT_NAME,
    VAULT_SYMBOL,
    strategyRouter.address,
    configManager.address,
    getTxOptions()
  );
  await dbank.deployed();
  console.log(`   ✓ dBank: ${dbank.address}\n`);

  // Update config.json
  console.log("Updating config.json...");
  config['84532'] = {
    ...config['84532'],
    token: { address: TOKEN_ADDRESS },
    dbank: { address: dbank.address },
    strategyRouter: { address: strategyRouter.address },
    configManager: { address: configManager.address },
    mockS1: { address: mockS1.address },
    x402: config['84532'].x402 || {}
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("✓ config.json updated\n");

  console.log("==========================================");
  console.log("REDEPLOYMENT SUMMARY");
  console.log("==========================================");
  console.log(`Token:              ${TOKEN_ADDRESS}`);
  console.log(`ConfigManager:      ${configManager.address}`);
  console.log(`StrategyRouter:     ${strategyRouter.address}`);
  console.log(`MockS1:             ${mockS1.address}`);
  console.log(`dBank:              ${dbank.address}`);
  console.log("==========================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
