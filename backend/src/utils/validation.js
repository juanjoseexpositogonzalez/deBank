const config = require('../config');
const logger = require('./logger');
const { ethers } = require('ethers');

// Store simple en memoria (en producción usar Redis/DB)
const processedRequests = new Map();

function validateDepositRequest({ amount, userAddress, requestId }) {
  if (!amount || parseFloat(amount) <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }

  const amountNum = parseFloat(amount);
  if (amountNum < parseFloat(config.minDeposit)) {
    return { valid: false, error: `Minimum deposit is $${config.minDeposit}` };
  }

  if (amountNum > parseFloat(config.maxDeposit)) {
    return { valid: false, error: `Maximum deposit is $${config.maxDeposit}` };
  }

  if (!ethers.utils.isAddress(userAddress)) {
    return { valid: false, error: 'Invalid user address' };
  }

  if (!requestId) {
    return { valid: false, error: 'Missing requestId for idempotency' };
  }

  return { valid: true };
}

async function checkIdempotency(requestId) {
  if (processedRequests.has(requestId)) {
    const existing = processedRequests.get(requestId);
    logger.warn('Duplicate request detected', { requestId, existing });
    return {
      valid: false,
      error: 'Request already processed',
      existingTxHash: existing.txHash,
    };
  }
  return { valid: true };
}

async function recordPayment(requestId, paymentData) {
  processedRequests.set(requestId, {
    ...paymentData,
    timestamp: Date.now(),
  });
}

module.exports = {
  validateDepositRequest,
  checkIdempotency,
  recordPayment,
};
