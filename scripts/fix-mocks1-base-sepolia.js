const hre = require("hardhat");
const { ethers } = require("hardhat");
const config = require("../src/config.json");

async function main() {
    const chainId = 84532; // Base Sepolia
    const networkConfig = config[chainId.toString()];
    
    if (!networkConfig) {
        console.error("No config found for chainId", chainId);
        process.exit(1);
    }

    const [deployer] = await ethers.getSigners();
    console.log("Fixing MockS1 with account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    // Get contracts
    const MockS1 = await ethers.getContractFactory("MockS1");
    const StrategyRouter = await ethers.getContractFactory("StrategyRouter");
    
    const mockS1Address = networkConfig.mockS1?.address || networkConfig.mockS1;
    const strategyRouterAddress = networkConfig.strategyRouter?.address || networkConfig.strategyRouter;
    
    const mockS1 = MockS1.attach(mockS1Address);
    const router = StrategyRouter.attach(strategyRouterAddress);
    
    // Get current state
    console.log("=== Current MockS1 State ===");
    const currentParams = await mockS1.params();
    console.log("APR (bps):", currentParams[0].toString());
    console.log("Cap:", ethers.utils.formatUnits(currentParams[1], 18));
    console.log("Paused:", currentParams[2]);
    console.log("Principal:", ethers.utils.formatUnits(currentParams[3], 18));
    
    // Get router cap for strategy 1
    const strategyInfo = await router.getStrategy(1);
    const routerCap = strategyInfo.cap;
    
    console.log("\n=== StrategyRouter State ===");
    console.log("Router cap:", ethers.utils.formatUnits(routerCap, 18));
    
    // Configure MockS1 to match router cap
    const S1_APR_BPS = 500; // 5% APR
    const S1_CAP = routerCap; // Use same cap as router
    
    console.log("\n=== Configuring MockS1 ===");
    console.log("Setting APR:", S1_APR_BPS, "bps (", S1_APR_BPS / 100, "%)");
    console.log("Setting Cap:", ethers.utils.formatUnits(S1_CAP, 18));
    
    // Get gas price
    const gasPrice = await deployer.provider.getGasPrice();
    const increasedGasPrice = gasPrice.mul(110).div(100); // Increase by 10%
    
    const tx = await mockS1.setParams(S1_APR_BPS, S1_CAP, {
        gasPrice: increasedGasPrice
    });
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("✅ MockS1 configured successfully!");
    
    // Verify
    console.log("\n=== Verification ===");
    const newParams = await mockS1.params();
    console.log("New APR (bps):", newParams[0].toString());
    console.log("New Cap:", ethers.utils.formatUnits(newParams[1], 18));
    
    if (newParams[1].toString() === routerCap.toString()) {
        console.log("✅ Cap matches router cap!");
    } else {
        console.warn("⚠️  Cap doesn't match router cap!");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
