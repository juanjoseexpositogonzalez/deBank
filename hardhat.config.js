require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config();
const privateKeys = process.env.PRIVATE_KEYS || ""
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  networks: {
    localhost: {},
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: privateKeys.split(":")
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: privateKeys.split(":").filter(key => key !== ""),
      chainId: 84532,
      timeout: 60000
    },
    // hardhat: {
    //   forking: {
    //     url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //     blockNumber: 15500000
    //   },
    //   initialBaseFeePerGas: 1000000000 // 1 gwei
    // }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  }  
};
