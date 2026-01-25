const { ethers } = require('ethers');
const config = require('../config');
const dBankService = require('./dbank');
const { checkIdempotency, recordPayment } = require('../utils/validation');
const logger = require('../utils/logger');

async function processDeposit({ amount, userAddress, requestId, paymentSignature }) {
  try {
    // Verificar idempotencia
    const idempotencyCheck = await checkIdempotency(requestId);
    if (!idempotencyCheck.valid) {
      return { success: false, error: idempotencyCheck.error, existingTxHash: idempotencyCheck.existingTxHash };
    }

    // Convertir amount a wei
    const amountWei = ethers.utils.parseUnits(amount, 18);

    // Ejecutar depósito on-chain desde treasury wallet
    const depositResult = await dBankService.deposit({
      amount: amountWei,
      receiver: userAddress,
    });

    // Registrar pago para idempotencia
    await recordPayment(requestId, {
      amount,
      userAddress,
      txHash: depositResult.txHash,
      shares: depositResult.shares,
    });

    return {
      success: true,
      txHash: depositResult.txHash,
      shares: depositResult.shares,
    };
  } catch (error) {
    logger.error('Process deposit error', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = { processDeposit };
