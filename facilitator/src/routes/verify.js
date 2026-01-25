const express = require('express');
const router = express.Router();
const { verifyPayment } = require('../services/paymentVerifier');
const { settlePayment } = require('../services/settlement');
const { checkPaymentExists, recordPayment } = require('../utils/database');
const logger = require('../utils/logger');

router.post('/', async (req, res) => {
  try {
    const { paymentSignature, paymentRequest } = req.body;

    // Validación de entrada
    if (!paymentSignature || !paymentRequest) {
      logger.warn('Missing required fields', { 
        hasSignature: !!paymentSignature, 
        hasRequest: !!paymentRequest 
      });
      return res.status(400).json({ 
        error: 'Missing paymentSignature or paymentRequest',
        required: ['paymentSignature', 'paymentRequest']
      });
    }

    // Generar paymentId único
    const paymentId = paymentRequest.id || 
      `${paymentRequest.uri || 'payment'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Payment verification request', { paymentId });

    // Verificar que el pago no haya sido procesado antes
    const existing = await checkPaymentExists(paymentId);
    if (existing) {
      logger.warn('Duplicate payment detected', { paymentId, existingTxHash: existing.tx_hash });
      return res.json({
        verified: true,
        settled: true,
        txHash: existing.tx_hash,
        message: 'Payment already processed',
        paymentId,
      });
    }

    // Verificar la firma del pago
    const verification = await verifyPayment(paymentSignature, paymentRequest);
    if (!verification.valid) {
      logger.error('Payment verification failed', { 
        paymentId, 
        error: verification.error 
      });
      return res.status(400).json({ 
        error: verification.error,
        paymentId,
      });
    }

    logger.info('Payment signature verified', { 
      paymentId, 
      from: verification.from, 
      to: verification.to,
      amount: verification.amount 
    });

    // Liquidar el pago on-chain
    const settlement = await settlePayment(verification);
    if (!settlement.success) {
      logger.error('Payment settlement failed', { 
        paymentId, 
        error: settlement.error 
      });
      return res.status(500).json({ 
        error: settlement.error,
        paymentId,
      });
    }

    // Registrar pago en base de datos
    try {
      await recordPayment(paymentId, {
        paymentRequest,
        txHash: settlement.txHash,
        amount: verification.amount,
        from: verification.from,
        to: verification.to,
        timestamp: Date.now(),
      });
    } catch (dbError) {
      logger.error('Failed to record payment in database', { 
        paymentId, 
        error: dbError.message 
      });
      // Continuamos aunque falle el registro en DB
    }

    logger.info('Payment verified and settled', {
      paymentId,
      txHash: settlement.txHash,
      amount: verification.amount,
      from: verification.from,
      to: verification.to,
    });

    return res.json({
      verified: true,
      settled: true,
      txHash: settlement.txHash,
      paymentId,
      amount: verification.amount,
    });
  } catch (error) {
    logger.error('Verify route error', { 
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
