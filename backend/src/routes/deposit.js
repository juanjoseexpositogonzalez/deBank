const express = require('express');
const router = express.Router();
const { processDeposit } = require('../services/payment');
const { validateDepositRequest } = require('../utils/validation');
const logger = require('../utils/logger');

router.post('/', async (req, res) => {
  try {
    const { amount, userAddress, requestId } = req.body;
    const paymentSignature = req.headers['payment-signature'] || req.headers['payment-signature'];
    
    // Validar que tenemos los campos requeridos
    if (!amount || !userAddress || !requestId) {
      logger.warn('Missing required fields', { 
        hasAmount: !!amount, 
        hasUserAddress: !!userAddress, 
        hasRequestId: !!requestId 
      });
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['amount', 'userAddress', 'requestId']
      });
    }

    logger.info('Deposit request received', { 
      requestId, 
      amount, 
      userAddress: userAddress.substring(0, 10) + '...',
      hasPaymentSignature: !!paymentSignature
    });
    
    // Validar request
    const validation = validateDepositRequest({ amount, userAddress, requestId });
    if (!validation.valid) {
      logger.warn('Deposit validation failed', { requestId, error: validation.error });
      return res.status(400).json({ 
        error: validation.error,
        requestId 
      });
    }

    // Procesar depósito on-chain
    const result = await processDeposit({
      amount,
      userAddress,
      requestId,
      paymentSignature,
    });

    if (result.success) {
      logger.info('Deposit successful', { 
        requestId, 
        txHash: result.txHash,
        shares: result.shares,
        amount 
      });
      return res.json({
        success: true,
        txHash: result.txHash,
        shares: result.shares,
        amount,
        requestId,
      });
    } else {
      logger.error('Deposit failed', { 
        requestId, 
        error: result.error 
      });
      
      // Si ya fue procesado, retornar el txHash existente
      if (result.existingTxHash) {
        logger.info('Deposit already processed', { 
          requestId, 
          existingTxHash: result.existingTxHash 
        });
        return res.json({
          success: true,
          txHash: result.existingTxHash,
          message: 'Request already processed',
          requestId,
        });
      }
      
      // Determinar código de estado apropiado
      const statusCode = result.error.includes('Invalid') || result.error.includes('Minimum') || result.error.includes('Maximum') 
        ? 400 
        : 500;
      
      return res.status(statusCode).json({ 
        error: result.error,
        requestId 
      });
    }
  } catch (error) {
    logger.error('Deposit route error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

module.exports = router;
