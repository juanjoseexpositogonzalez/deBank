const express = require('express');
const router = express.Router();
const { verifyPayment } = require('../services/paymentVerifier');
const { settlePayment } = require('../services/settlement');
const { checkPaymentExists, recordPayment } = require('../utils/database');
const logger = require('../utils/logger');

router.post('/', async (req, res) => {
  try {
    const { paymentSignature, paymentRequest } = req.body;

    if (!paymentSignature || !paymentRequest) {
      return res.status(400).json({ error: 'Missing paymentSignature or paymentRequest' });
    }

    // Generar paymentId único
    const paymentId = paymentRequest.id || `${paymentRequest.uri || 'payment'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Verificar que el pago no haya sido procesado antes
    const existing = await checkPaymentExists(paymentId);
    if (existing) {
      logger.warn('Duplicate payment detected', { paymentId });
      return res.json({
        verified: true,
        settled: true,
        txHash: existing.tx_hash,
        message: 'Payment already processed',
      });
    }

    // Verificar la firma del pago
    const verification = await verifyPayment(paymentSignature, paymentRequest);
    if (!verification.valid) {
      logger.error('Payment verification failed', { error: verification.error });
      return res.status(400).json({ error: verification.error });
    }

    // Liquidar el pago on-chain
    const settlement = await settlePayment(verification);
    if (!settlement.success) {
      logger.error('Payment settlement failed', { error: settlement.error });
      return res.status(500).json({ error: settlement.error });
    }

    // Registrar pago en base de datos
    await recordPayment(paymentId, {
      paymentRequest,
      txHash: settlement.txHash,
      amount: verification.amount,
      from: verification.from,
      to: verification.to,
      timestamp: Date.now(),
    });

    logger.info('Payment verified and settled', {
      paymentId,
      txHash: settlement.txHash,
      amount: verification.amount,
    });

    return res.json({
      verified: true,
      settled: true,
      txHash: settlement.txHash,
    });
  } catch (error) {
    logger.error('Verify route error', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
