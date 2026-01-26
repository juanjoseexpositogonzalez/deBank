// Transfer tokens to specified addresses in Base Sepolia
require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  const { chainId } = await ethers.provider.getNetwork();
  
  console.log(`Transferring tokens on network: ${network} (chainId=${chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Get token address from config
  const chainKey = String(chainId);
  const cfgNet = config[chainKey];
  const TOKEN_ADDRESS = cfgNet?.token?.address;

  if (!TOKEN_ADDRESS) {
    console.error("ERROR: Token address not found in config.json for chainId", chainId);
    process.exit(1);
  }

  console.log(`Token Address: ${TOKEN_ADDRESS}\n`);

  // Get token contract
  const Token = await ethers.getContractFactory('Token');
  const token = Token.attach(TOKEN_ADDRESS);

  // Get token details
  const decimals = await token.decimals();
  const deployerBalance = await token.balanceOf(deployer.address);
  
  console.log(`Token Decimals: ${decimals}`);
  console.log(`Deployer Token Balance: ${ethers.utils.formatUnits(deployerBalance, decimals)} tokens\n`);

  // Recipient addresses
  const recipients = [
    {
      address: "0x2ED0D4A0Fb3850Ddf5e4132E88314586e9184E33", // Owner
      amount: "100000", // 100k tokens
      label: "Owner"
    },
    {
      address: "0x27C4032173BeDE16E178AE61084361aEd8FdE745",
      amount: "50000", // 50k tokens
      label: "Test Account 1"
    },
    {
      address: "0x93EF103789D2B7B317DEc8C66643dd3A0EF2125A",
      amount: "50000", // 50k tokens
      label: "Test Account 2"
    }
  ];

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

  console.log("==========================================");
  console.log("TRANSFERRING TOKENS");
  console.log("==========================================\n");

  // Calculate total required
  const totalRequired = recipients.reduce((sum, r) => {
    return sum.add(ethers.utils.parseUnits(r.amount, decimals));
  }, ethers.BigNumber.from(0));

  if (deployerBalance.lt(totalRequired)) {
    console.error(`ERROR: Insufficient balance. Required: ${ethers.utils.formatUnits(totalRequired, decimals)}, Available: ${ethers.utils.formatUnits(deployerBalance, decimals)}`);
    process.exit(1);
  }

  // Transfer to each recipient
  for (const recipient of recipients) {
    const amount = ethers.utils.parseUnits(recipient.amount, decimals);
    const currentBalance = await token.balanceOf(recipient.address);
    
    console.log(`Transferring to ${recipient.label} (${recipient.address})...`);
    console.log(`  Amount: ${ethers.utils.formatUnits(amount, decimals)} tokens`);
    console.log(`  Current balance: ${ethers.utils.formatUnits(currentBalance, decimals)} tokens`);

    try {
      const tx = await token.transfer(recipient.address, amount, getTxOptions());
      console.log(`  Transaction hash: ${tx.hash}`);
      await tx.wait();
      
      const newBalance = await token.balanceOf(recipient.address);
      console.log(`  ✓ Transfer successful! New balance: ${ethers.utils.formatUnits(newBalance, decimals)} tokens\n`);
    } catch (error) {
      console.error(`  ✗ Transfer failed: ${error.message}\n`);
    }
  }

  // Final balances
  console.log("==========================================");
  console.log("FINAL BALANCES");
  console.log("==========================================\n");

  const finalDeployerBalance = await token.balanceOf(deployer.address);
  console.log(`Deployer: ${ethers.utils.formatUnits(finalDeployerBalance, decimals)} tokens`);

  for (const recipient of recipients) {
    const balance = await token.balanceOf(recipient.address);
    console.log(`${recipient.label} (${recipient.address}): ${ethers.utils.formatUnits(balance, decimals)} tokens`);
  }

  console.log("\n==========================================");
  console.log("✓ TRANSFERS COMPLETED");
  console.log("==========================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
