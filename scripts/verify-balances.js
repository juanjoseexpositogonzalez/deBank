// Verify token balances
require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const chainKey = String(chainId);
  const TOKEN_ADDRESS = config[chainKey]?.token?.address;

  if (!TOKEN_ADDRESS) {
    console.error("Token address not found");
    process.exit(1);
  }

  const Token = await ethers.getContractFactory('Token');
  const token = Token.attach(TOKEN_ADDRESS);
  const decimals = await token.decimals();

  const addresses = [
    "0x2ED0D4A0Fb3850Ddf5e4132E88314586e9184E33",
    "0x27C4032173BeDE16E178AE61084361aEd8FdE745",
    "0x93EF103789D2B7B317DEc8C66643dd3A0EF2125A"
  ];

  console.log(`Token: ${TOKEN_ADDRESS} (${decimals} decimals)\n`);

  for (const addr of addresses) {
    const balance = await token.balanceOf(addr);
    console.log(`${addr}: ${ethers.utils.formatUnits(balance, decimals)} tokens`);
  }
}

main().catch(console.error);
