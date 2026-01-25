const express = require('express');
const router = express.Router();
const { processDeposit } = require('../services/payment');
const { validateDepositRequest } = require('../utils/validation');
const logger = require('../utils/logger');

router.post('/', async (req, res) => {
  try {
    const { amount, userAddress, requestId } = req.body;
    
    // Validar request
    const validation = validateDepositRequest({ amount, userAddress, requestId });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Procesar depósito on-chain
    const result = await processDeposit({
      amount,
      userAddress,
      requestId,
      paymentSignature: req.headers['payment-signature'],
    });

    if (result.success) {
      logger.info('Deposit successful', { requestId, txHash: result.txHash });
      return res.json({
        success: true,
        txHash: result.txHash,
        shares: result.shares,
      });
    } else {
      logger.error('Deposit failed', { requestId, error: result.error });
      
      // Si ya fue procesado, retornar el txHash existente
      if (result.existingTxHash) {
        return res.json({
          success: true,
          txHash: result.existingTxHash,
          message: 'Request already processed',
        });
      }
      
      return res.status(500).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Deposit route error', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
