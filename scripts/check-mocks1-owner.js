const hre = require("hardhat");
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
    const chainId = 84532; // Base Sepolia
    const networkConfig = config[chainId.toString()];
    
    const [deployer] = await ethers.getSigners();
    console.log("Checking MockS1 owner with account:", deployer.address);
    
    const MockS1 = await ethers.getContractFactory("MockS1");
    const mockS1Address = networkConfig.mockS1?.address || networkConfig.mockS1;
    const mockS1 = MockS1.attach(mockS1Address);
    
    const owner = await mockS1.owner();
    console.log("MockS1 owner:", owner);
    console.log("Deployer address:", deployer.address);
    console.log("Match:", owner.toLowerCase() === deployer.address.toLowerCase());
    
    // Try to read params
    const params = await mockS1.params();
    console.log("\nCurrent params:");
    console.log("APR:", params[0].toString());
    console.log("Cap:", params[1].toString(), "(", ethers.utils.formatUnits(params[1], 18), ")");
    console.log("Paused:", params[2]);
    console.log("Principal:", params[3].toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
