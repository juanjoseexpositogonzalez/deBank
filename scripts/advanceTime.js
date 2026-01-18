const { ethers } = require("hardhat");

/**
 * Script para avanzar el tiempo de la blockchain de Hardhat
 * 
 * Uso:
 *   npx hardhat run scripts/advanceTime.js --network localhost
 *   npx hardhat run scripts/advanceTime.js --network localhost -- --days 7
 *   npx hardhat run scripts/advanceTime.js --network localhost -- --hours 24
 *   npx hardhat run scripts/advanceTime.js --network localhost -- --minutes 60
 *   npx hardhat run scripts/advanceTime.js --network localhost -- --seconds 3600
 */
async function main() {
    // Parse environment variables first (for npm scripts)
    let secondsToAdvance = 0;
    
    if (process.env.ADVANCE_DAYS) {
        secondsToAdvance += parseInt(process.env.ADVANCE_DAYS) * 24 * 60 * 60;
    }
    if (process.env.ADVANCE_HOURS) {
        secondsToAdvance += parseInt(process.env.ADVANCE_HOURS) * 60 * 60;
    }
    if (process.env.ADVANCE_MINUTES) {
        secondsToAdvance += parseInt(process.env.ADVANCE_MINUTES) * 60;
    }
    if (process.env.ADVANCE_SECONDS) {
        secondsToAdvance += parseInt(process.env.ADVANCE_SECONDS);
    }
    
    // Parse command line arguments (for direct usage)
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--days' && args[i + 1]) {
            secondsToAdvance += parseInt(args[i + 1]) * 24 * 60 * 60;
            i++;
        } else if (args[i] === '--hours' && args[i + 1]) {
            secondsToAdvance += parseInt(args[i + 1]) * 60 * 60;
            i++;
        } else if (args[i] === '--minutes' && args[i + 1]) {
            secondsToAdvance += parseInt(args[i + 1]) * 60;
            i++;
        } else if (args[i] === '--seconds' && args[i + 1]) {
            secondsToAdvance += parseInt(args[i + 1]);
            i++;
        }
    }
    
    // Default: advance 1 day if no arguments provided
    if (secondsToAdvance === 0) {
        secondsToAdvance = 24 * 60 * 60; // 1 day
        console.log("No time specified, advancing 1 day by default...");
    }
    
    console.log(`\n⏰ Advancing blockchain time by ${secondsToAdvance} seconds...`);
    console.log(`   (${(secondsToAdvance / 3600).toFixed(2)} hours / ${(secondsToAdvance / (24 * 3600)).toFixed(2)} days)\n`);
    
    // Get current block timestamp
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentTimestamp = currentBlock.timestamp;
    console.log(`📅 Current timestamp: ${new Date(currentTimestamp * 1000).toLocaleString()}`);
    
    // Advance time
    await ethers.provider.send("evm_increaseTime", [secondsToAdvance]);
    await ethers.provider.send("evm_mine", []);
    
    // Get new block timestamp
    const newBlock = await ethers.provider.getBlock('latest');
    const newTimestamp = newBlock.timestamp;
    console.log(`📅 New timestamp: ${new Date(newTimestamp * 1000).toLocaleString()}`);
    
    const timeAdvanced = newTimestamp - currentTimestamp;
    console.log(`\n✅ Successfully advanced ${timeAdvanced} seconds (${(timeAdvanced / 3600).toFixed(2)} hours)\n`);
    
    // Show block number
    console.log(`📦 Current block number: ${newBlock.number}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
