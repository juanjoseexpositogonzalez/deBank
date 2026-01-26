// Setup treasury wallet for x402: approve dBank and verify balance
require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const chainKey = String(chainId);

  console.log("Setting up treasury wallet for x402");
  console.log("Network:", chainKey);
  console.log("Treasury wallet:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Get addresses from config
  const cfgNet = config[chainKey];
  const TOKEN_ADDRESS = cfgNet?.token?.address;
  const DBANK_ADDRESS = cfgNet?.dbank?.address;
  const TREASURY_WALLET = cfgNet?.x402?.treasuryWallet || deployer.address;

  if (!TOKEN_ADDRESS || !DBANK_ADDRESS) {
    console.error("ERROR: Missing token or dBank address in config.json");
    process.exit(1);
  }

  console.log(`Token: ${TOKEN_ADDRESS}`);
  console.log(`dBank: ${DBANK_ADDRESS}`);
  console.log(`Treasury: ${TREASURY_WALLET}\n`);

  // Get contracts
  const Token = await ethers.getContractFactory('Token');
  const dBank = await ethers.getContractFactory('dBank');
  
  const token = Token.attach(TOKEN_ADDRESS);
  const dbank = dBank.attach(DBANK_ADDRESS);

  // Get token decimals
  const decimals = await token.decimals();
  
  // Check treasury balance
  const treasuryBalance = await token.balanceOf(TREASURY_WALLET);
  console.log(`Treasury Token Balance: ${ethers.utils.formatUnits(treasuryBalance, decimals)} tokens`);

  if (treasuryBalance.eq(0)) {
    console.error("ERROR: Treasury has 0 tokens. Please transfer tokens first.");
    process.exit(1);
  }

  // Check current allowance
  const currentAllowance = await token.allowance(TREASURY_WALLET, DBANK_ADDRESS);
  console.log(`Current Allowance: ${ethers.utils.formatUnits(currentAllowance, decimals)} tokens`);

  // Get nonce and gas
  let nonce = await deployer.getTransactionCount("pending");
  const gasPrice = await deployer.provider.getGasPrice();
  const increasedGasPrice = gasPrice.mul(110).div(100);

  const getTxOptions = () => ({
    nonce: nonce++,
    gasPrice: increasedGasPrice
  });

  // Approve dBank if needed
  const MAX_APPROVAL = ethers.constants.MaxUint256;
  if (currentAllowance.lt(treasuryBalance)) {
    console.log("\nApproving dBank to spend treasury tokens...");
    const treasurySigner = deployer; // Assuming deployer is treasury
    
    const tx = await token.connect(treasurySigner).approve(DBANK_ADDRESS, MAX_APPROVAL, getTxOptions());
    console.log(`Transaction hash: ${tx.hash}`);
    await tx.wait();
    
    const newAllowance = await token.allowance(TREASURY_WALLET, DBANK_ADDRESS);
    console.log(`✓ Approval successful! New allowance: ${ethers.utils.formatUnits(newAllowance, decimals)} tokens\n`);
  } else {
    console.log("✓ Treasury already has sufficient allowance\n");
  }

  // Verify setup
  console.log("==========================================");
  console.log("TREASURY SETUP VERIFICATION");
  console.log("==========================================");
  console.log(`Treasury Wallet: ${TREASURY_WALLET}`);
  console.log(`Token Balance: ${ethers.utils.formatUnits(treasuryBalance, decimals)} tokens`);
  const finalAllowance = await token.allowance(TREASURY_WALLET, DBANK_ADDRESS);
  console.log(`dBank Allowance: ${ethers.utils.formatUnits(finalAllowance, decimals)} tokens`);
  console.log(`dBank Address: ${DBANK_ADDRESS}`);
  console.log("==========================================");
  console.log("✓ Treasury is ready for x402 deposits!\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
