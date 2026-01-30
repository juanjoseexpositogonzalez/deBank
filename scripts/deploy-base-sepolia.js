// Deploy script específico para Base Sepolia
// Desplegamos TODOS los contratos incluyendo nuestro propio Token (USDC)
// para tener control total sobre la supply y poder hacer seeding

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts to Base Sepolia with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Get current nonce - use pending to account for pending transactions
  let nonce = await deployer.getTransactionCount("pending");
  console.log(`Starting with nonce: ${nonce}\n`);

  // Get gas price and increase it slightly to ensure transaction goes through
  const gasPrice = await deployer.provider.getGasPrice();
  const increasedGasPrice = gasPrice.mul(110).div(100); // Increase by 10%
  console.log(`Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (using ${ethers.utils.formatUnits(increasedGasPrice, 'gwei')} gwei)\n`);

  // ============================================================
  // Configuration parameters
  // ============================================================
  const TOKEN_NAME = 'USDC Token';
  const TOKEN_SYMBOL = 'USDC';
  const TOKEN_MAX_SUPPLY = '10000000'; // 10 million tokens

  const VAULT_NAME = 'dBank USDC Vault';
  const VAULT_SYMBOL = 'dbUSDC';

  // MockS1 parameters (Strategy S1)
  const S1_APR_BPS = 500; // 5% APR (500 basis points)
  const S1_CAP = ethers.utils.parseUnits('1000000', 18); // 1M tokens cap (18 decimals)
  const S1_STRATEGY_ID = 1; // Strategy S1 ID

  // ============================================================
  // 1. Deploy Token (USDC)
  // ============================================================
  console.log("1. Deploying Token...");
  const Token = await ethers.getContractFactory('Token');
  const token = await Token.deploy(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_MAX_SUPPLY, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  await token.deployed();
  console.log(`   ✓ Token deployed at: ${token.address}\n`);

  // ============================================================
  // 2. Deploy ConfigManager
  // ============================================================
  console.log("2. Deploying ConfigManager...");
  const ConfigManager = await ethers.getContractFactory('ConfigManager');
  const configManager = await ConfigManager.deploy({
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  await configManager.deployed();
  console.log(`   ✓ ConfigManager deployed at: ${configManager.address}\n`);

  // ============================================================
  // 3. Deploy StrategyRouter
  // ============================================================
  console.log("3. Deploying StrategyRouter...");
  const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
  const strategyRouter = await StrategyRouter.deploy(token.address, configManager.address, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  await strategyRouter.deployed();
  console.log(`   ✓ StrategyRouter deployed at: ${strategyRouter.address}\n`);

  // ============================================================
  // 4. Deploy MockS1 (Strategy S1)
  // ============================================================
  console.log("4. Deploying MockS1 (Strategy S1)...");
  const MockS1 = await ethers.getContractFactory('MockS1');
  const mockS1 = await MockS1.deploy(token.address, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  await mockS1.deployed();
  console.log(`   ✓ MockS1 deployed at: ${mockS1.address}`);

  // Configure MockS1 parameters
  console.log("   Configuring MockS1 parameters...");
  await mockS1.setParams(S1_APR_BPS, S1_CAP, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  console.log(`   ✓ MockS1 configured: APR=${S1_APR_BPS} bps (${S1_APR_BPS/100}%), Cap=${ethers.utils.formatEther(S1_CAP)} tokens\n`);

  // ============================================================
  // 5. Register MockS1 in StrategyRouter
  // ============================================================
  console.log("5. Registering MockS1 in StrategyRouter...");
  await strategyRouter.registerStrategy(S1_STRATEGY_ID, mockS1.address, S1_CAP, {
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });
  console.log(`   ✓ MockS1 registered as strategy ID ${S1_STRATEGY_ID}\n`);

  // ============================================================
  // 6. Deploy dBank (ERC-4626 Vault)
  // ============================================================
  console.log("6. Deploying dBank (ERC-4626 Vault)...");
  const dBank = await ethers.getContractFactory('dBank');
  const dbank = await dBank.deploy(
    token.address,
    VAULT_NAME,
    VAULT_SYMBOL,
    strategyRouter.address,
    configManager.address,
    {
      nonce: nonce++,
      gasPrice: increasedGasPrice
    }
  );
  await dbank.deployed();
  console.log(`   ✓ dBank deployed at: ${dbank.address}\n`);

  // ============================================================
  // Deployment summary
  // ============================================================
  console.log("==========================================");
  console.log("DEPLOYMENT SUMMARY - BASE SEPOLIA");
  console.log("==========================================");
  console.log(`Token (${TOKEN_SYMBOL}):        ${token.address}`);
  console.log(`ConfigManager:             ${configManager.address}`);
  console.log(`StrategyRouter:            ${strategyRouter.address}`);
  console.log(`MockS1 (Strategy S1):     ${mockS1.address}`);
  console.log(`dBank (Vault):             ${dbank.address}`);
  console.log("==========================================\n");

  // ============================================================
  // Update config.json
  // ============================================================
  console.log("Updating src/config.json...");
  const configPath = path.join(__dirname, '../src/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  config['84532'] = {
    ...config['84532'],
    token: {
      address: token.address
    },
    dbank: {
      address: dbank.address
    },
    strategyRouter: {
      address: strategyRouter.address
    },
    configManager: {
      address: configManager.address
    },
    mockS1: {
      address: mockS1.address
    },
    x402: {
      ...config['84532'].x402
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("✓ config.json updated\n");

  // ============================================================
  // Optional verification
  // ============================================================
  if (process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY) {
    console.log("Waiting for confirmations before verifying...");
    await token.deployTransaction.wait(5);
    await configManager.deployTransaction.wait(5);
    await strategyRouter.deployTransaction.wait(5);
    await mockS1.deployTransaction.wait(5);
    await dbank.deployTransaction.wait(5);

    console.log("Verifying contracts on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: token.address,
        constructorArguments: [TOKEN_NAME, TOKEN_SYMBOL, TOKEN_MAX_SUPPLY],
      });
      await hre.run("verify:verify", {
        address: configManager.address,
        constructorArguments: [],
      });
      await hre.run("verify:verify", {
        address: strategyRouter.address,
        constructorArguments: [token.address, configManager.address],
      });
      await hre.run("verify:verify", {
        address: mockS1.address,
        constructorArguments: [token.address],
      });
      await hre.run("verify:verify", {
        address: dbank.address,
        constructorArguments: [
          token.address,
          VAULT_NAME,
          VAULT_SYMBOL,
          strategyRouter.address,
          configManager.address
        ],
      });
      console.log("✓ All contracts verified on Basescan\n");
    } catch (error) {
      console.log("⚠ Verification error:", error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
