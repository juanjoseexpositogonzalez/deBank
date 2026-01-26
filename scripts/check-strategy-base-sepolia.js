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
    console.log("Checking with account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

    // Get contracts
    const MockS1 = await ethers.getContractFactory("MockS1");
    const StrategyRouter = await ethers.getContractFactory("StrategyRouter");
    
    const mockS1Address = networkConfig.mockS1?.address || networkConfig.mockS1;
    const strategyRouterAddress = networkConfig.strategyRouter?.address || networkConfig.strategyRouter;
    
    console.log("\n=== MockS1 Configuration ===");
    const mockS1 = MockS1.attach(mockS1Address);
    
    const params = await mockS1.params();
    console.log("APR (bps):", params[0].toString());
    console.log("Cap:", ethers.utils.formatUnits(params[1], 18));
    console.log("Paused:", params[2]);
    console.log("Principal:", ethers.utils.formatUnits(params[3], 18));
    
    const totalAssets = await mockS1.totalAssets();
    console.log("Total Assets:", ethers.utils.formatUnits(totalAssets, 18));
    
    console.log("\n=== StrategyRouter Configuration ===");
    const router = StrategyRouter.attach(strategyRouterAddress);
    
    const strategyInfo = await router.getStrategy(1);
    console.log("Strategy 1 address:", strategyInfo.strategy);
    console.log("Strategy 1 active:", strategyInfo.active);
    console.log("Strategy 1 cap:", ethers.utils.formatUnits(strategyInfo.cap, 18));
    console.log("Strategy 1 allocated:", ethers.utils.formatUnits(strategyInfo.allocated, 18));
    
    // Check if MockS1 cap matches router cap
    const routerCap = strategyInfo.cap;
    const mockS1Cap = params[1];
    
    console.log("\n=== Cap Comparison ===");
    console.log("Router cap:", ethers.utils.formatUnits(routerCap, 18));
    console.log("MockS1 cap:", ethers.utils.formatUnits(mockS1Cap, 18));
    
    if (routerCap.toString() !== mockS1Cap.toString()) {
        console.warn("⚠️  WARNING: Router cap and MockS1 cap don't match!");
    }
    
    // Try to calculate available capacity
    const available = routerCap.sub(strategyInfo.allocated);
    console.log("Available capacity:", ethers.utils.formatUnits(available, 18));
    
    // Check if MockS1 can accept 1000 tokens
    const testAmount = ethers.utils.parseUnits("1000", 18);
    const mockS1Principal = params[3];
    const mockS1CapBN = params[1];
    
    console.log("\n=== Test Allocation (1000 tokens) ===");
    console.log("Current principal:", ethers.utils.formatUnits(mockS1Principal, 18));
    console.log("MockS1 cap:", ethers.utils.formatUnits(mockS1CapBN, 18));
    console.log("Test amount:", ethers.utils.formatUnits(testAmount, 18));
    
    if (mockS1Principal.add(testAmount).gt(mockS1CapBN)) {
        console.error("❌ ERROR: MockS1 cap would be exceeded!");
        console.error("  Principal + Amount:", ethers.utils.formatUnits(mockS1Principal.add(testAmount), 18));
        console.error("  Cap:", ethers.utils.formatUnits(mockS1CapBN, 18));
    } else {
        console.log("✅ MockS1 cap check passed");
    }
    
    if (params[2]) {
        console.error("❌ ERROR: MockS1 is paused!");
    } else {
        console.log("✅ MockS1 is not paused");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
