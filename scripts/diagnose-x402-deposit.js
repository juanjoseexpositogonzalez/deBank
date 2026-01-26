// Script para diagnosticar problemas con depósitos x402
// Verifica balance del treasury, allowance, caps del contrato, etc.

require("dotenv").config();
const { ethers } = require("hardhat");
const config = require("../src/config.json");
const backendConfig = require("../backend/src/config");

async function main() {
    const network = hre.network.name;
    const { chainId } = await ethers.provider.getNetwork();
    const isBaseSepolia = network === "baseSepolia" || chainId === 84532;

    if (!isBaseSepolia) {
        console.error("Este script está diseñado para Base Sepolia. Saliendo.");
        process.exit(1);
    }

    console.log(`Diagnosticando depósitos x402 en ${network} (chainId=${chainId})\n`);

    const chainKey = String(chainId);
    const cfgNet = config[chainKey] || {};

    const TOKEN_ADDRESS = cfgNet.token?.address;
    const DBANK_ADDRESS = cfgNet.dbank?.address;
    const TREASURY_WALLET = cfgNet.x402?.treasuryWallet || backendConfig.treasuryWallet;

    if (!TOKEN_ADDRESS || !DBANK_ADDRESS || !TREASURY_WALLET) {
        console.error("ERROR: Faltan direcciones en config.json");
        console.error(`  Token: ${TOKEN_ADDRESS ? '✓' : '✗'}`);
        console.error(`  dBank: ${DBANK_ADDRESS ? '✓' : '✗'}`);
        console.error(`  Treasury: ${TREASURY_WALLET ? '✓' : '✗'}`);
        process.exit(1);
    }

    console.log("Direcciones:");
    console.log(`  Token:    ${TOKEN_ADDRESS}`);
    console.log(`  dBank:    ${DBANK_ADDRESS}`);
    console.log(`  Treasury: ${TREASURY_WALLET}\n`);

    // Get contract instances
    const Token = await ethers.getContractFactory('Token');
    const dBank = await ethers.getContractFactory('dBank');

    const token = Token.attach(TOKEN_ADDRESS);
    const dbank = dBank.attach(DBANK_ADDRESS);

    // Get token decimals
    const tokenDecimals = await token.decimals();
    console.log(`Token decimals: ${tokenDecimals}\n`);

    // 1. Verificar balance del treasury wallet
    const treasuryBalance = await token.balanceOf(TREASURY_WALLET);
    const treasuryBalanceFormatted = ethers.utils.formatUnits(treasuryBalance, tokenDecimals);
    console.log(`1. Balance del Treasury Wallet:`);
    console.log(`   ${treasuryBalanceFormatted} tokens`);
    console.log(`   ${treasuryBalance.toString()} wei\n`);

    // 2. Verificar allowance del treasury wallet hacia dBank
    const allowance = await token.allowance(TREASURY_WALLET, DBANK_ADDRESS);
    const allowanceFormatted = ethers.utils.formatUnits(allowance, tokenDecimals);
    console.log(`2. Allowance del Treasury hacia dBank:`);
    console.log(`   ${allowanceFormatted} tokens`);
    console.log(`   ${allowance.toString()} wei`);
    if (allowance.eq(ethers.constants.MaxUint256)) {
        console.log(`   ✓ Allowance ilimitada (MaxUint256)\n`);
    } else {
        console.log(`   ⚠ Allowance limitada\n`);
    }

    // 3. Verificar caps del contrato dBank
    const tvlCap = await dbank.tvlCap();
    const perTxCap = await dbank.perTxCap();
    const tvlCapFormatted = ethers.utils.formatUnits(tvlCap, tokenDecimals);
    const perTxCapFormatted = ethers.utils.formatUnits(perTxCap, tokenDecimals);
    console.log(`3. Caps del contrato dBank:`);
    console.log(`   tvlCap:    ${tvlCapFormatted} tokens`);
    console.log(`   perTxCap:  ${perTxCapFormatted} tokens\n`);

    // 4. Verificar totalAssets actuales
    const totalAssets = await dbank.totalAssets();
    const totalAssetsFormatted = ethers.utils.formatUnits(totalAssets, tokenDecimals);
    console.log(`4. Total Assets en dBank:`);
    console.log(`   ${totalAssetsFormatted} tokens\n`);

    // 5. Verificar maxDeposit disponible
    const maxDeposit = await dbank.maxDeposit(TREASURY_WALLET);
    const maxDepositFormatted = ethers.utils.formatUnits(maxDeposit, tokenDecimals);
    console.log(`5. Max Deposit disponible:`);
    console.log(`   ${maxDepositFormatted} tokens\n`);

    // 6. Verificar si está pausado
    const paused = await dbank.paused();
    console.log(`6. Estado del contrato:`);
    console.log(`   Paused: ${paused ? 'SÍ ⚠️' : 'NO ✓'}\n`);

    // 7. Verificar límites del backend
    console.log(`7. Límites del backend x402:`);
    console.log(`   MIN_DEPOSIT_USD: ${backendConfig.minDeposit}`);
    console.log(`   MAX_DEPOSIT_USD: ${backendConfig.maxDeposit}\n`);

    // 8. Test con 500 tokens
    const testAmount = ethers.utils.parseUnits("500", tokenDecimals);
    console.log(`8. Test de depósito de 500 tokens:\n`);

    // Verificar balance suficiente
    if (testAmount.gt(treasuryBalance)) {
        console.log(`   ❌ ERROR: Treasury no tiene suficiente balance`);
        console.log(`      Necesita: 500 tokens`);
        console.log(`      Tiene: ${treasuryBalanceFormatted} tokens`);
        console.log(`      Faltan: ${ethers.utils.formatUnits(testAmount.sub(treasuryBalance), tokenDecimals)} tokens\n`);
    } else {
        console.log(`   ✓ Balance suficiente\n`);
    }

    // Verificar allowance suficiente
    if (!allowance.eq(ethers.constants.MaxUint256) && testAmount.gt(allowance)) {
        console.log(`   ❌ ERROR: Allowance insuficiente`);
        console.log(`      Necesita: 500 tokens`);
        console.log(`      Tiene: ${allowanceFormatted} tokens`);
        console.log(`      Faltan: ${ethers.utils.formatUnits(testAmount.sub(allowance), tokenDecimals)} tokens\n`);
    } else {
        console.log(`   ✓ Allowance suficiente\n`);
    }

    // Verificar perTxCap
    if (testAmount.gt(perTxCap)) {
        console.log(`   ❌ ERROR: Excede perTxCap`);
        console.log(`      Intenta depositar: 500 tokens`);
        console.log(`      perTxCap: ${perTxCapFormatted} tokens\n`);
    } else {
        console.log(`   ✓ Dentro del perTxCap\n`);
    }

    // Verificar maxDeposit
    if (testAmount.gt(maxDeposit)) {
        console.log(`   ❌ ERROR: Excede maxDeposit`);
        console.log(`      Intenta depositar: 500 tokens`);
        console.log(`      maxDeposit: ${maxDepositFormatted} tokens\n`);
    } else {
        console.log(`   ✓ Dentro del maxDeposit\n`);
    }

    // Verificar límites del backend
    const testAmountUSD = 500;
    if (testAmountUSD < parseFloat(backendConfig.minDeposit)) {
        console.log(`   ❌ ERROR: Excede MIN_DEPOSIT_USD del backend`);
        console.log(`      Intenta depositar: $500`);
        console.log(`      MIN_DEPOSIT_USD: $${backendConfig.minDeposit}\n`);
    } else if (testAmountUSD > parseFloat(backendConfig.maxDeposit)) {
        console.log(`   ❌ ERROR: Excede MAX_DEPOSIT_USD del backend`);
        console.log(`      Intenta depositar: $500`);
        console.log(`      MAX_DEPOSIT_USD: $${backendConfig.maxDeposit}\n`);
    } else {
        console.log(`   ✓ Dentro de los límites del backend\n`);
    }

    // Resumen
    console.log("\n=== RESUMEN ===");
    const canDeposit = !paused && 
                       testAmount.lte(treasuryBalance) && 
                       (allowance.eq(ethers.constants.MaxUint256) || testAmount.lte(allowance)) &&
                       testAmount.lte(perTxCap) &&
                       testAmount.lte(maxDeposit) &&
                       testAmountUSD >= parseFloat(backendConfig.minDeposit) &&
                       testAmountUSD <= parseFloat(backendConfig.maxDeposit);
    
    console.log(`¿Puede depositar 500 tokens? ${canDeposit ? 'SÍ ✓' : 'NO ❌'}`);
    
    if (!canDeposit) {
        console.log("\nProblemas encontrados:");
        if (paused) console.log("  - Contrato pausado");
        if (testAmount.gt(treasuryBalance)) console.log("  - Balance del treasury insuficiente");
        if (!allowance.eq(ethers.constants.MaxUint256) && testAmount.gt(allowance)) console.log("  - Allowance insuficiente");
        if (testAmount.gt(perTxCap)) console.log("  - Excede perTxCap del contrato");
        if (testAmount.gt(maxDeposit)) console.log("  - Excede maxDeposit del contrato");
        if (testAmountUSD < parseFloat(backendConfig.minDeposit)) console.log("  - Excede MIN_DEPOSIT_USD del backend");
        if (testAmountUSD > parseFloat(backendConfig.maxDeposit)) console.log("  - Excede MAX_DEPOSIT_USD del backend");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
