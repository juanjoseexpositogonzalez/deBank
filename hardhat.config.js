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
      sepolia: process.env.ETHERSCAN_API_KEY || ""
    }    
  }  
};
