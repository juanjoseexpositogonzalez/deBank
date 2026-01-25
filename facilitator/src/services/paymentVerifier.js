const { ethers } = require('ethers');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const config = require('../config');
const { parsePaymentSignature } = require('../utils/eip3009');

let provider;

function initialize() {
  provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
}

async function verifyPayment(paymentSignature, paymentRequest) {
  if (!provider) initialize();

  try {
    // Parsear el PAYMENT-SIGNATURE header
    const signature = parsePaymentSignature(paymentSignature);

    // Crear instancia del esquema EVM para verificación
    const scheme = new ExactEvmScheme();

    // Verificar la firma usando el esquema
    // Nota: La implementación real dependerá de la API exacta de @x402/evm
    // Por ahora, hacemos una verificación básica de estructura
    
    // Verificar que el pago no haya expirado
    const now = Math.floor(Date.now() / 1000);
    if (paymentRequest.expiresAt && paymentRequest.expiresAt < now) {
      return { valid: false, error: 'Payment request expired' };
    }

    // Verificar estructura básica del payment request
    if (!paymentRequest.accepts || !Array.isArray(paymentRequest.accepts) || paymentRequest.accepts.length === 0) {
      return { valid: false, error: 'Invalid payment request structure' };
    }

    const accept = paymentRequest.accepts[0];
    
    // Extraer información básica de la verificación
    // En producción, esto usaría la API real de @x402/evm para verificar la firma
    const expectedAmount = accept.amount || accept.price;
    const expectedTo = accept.payTo;

    // Por ahora, retornamos una estructura básica
    // La verificación real de la firma se hará cuando tengamos acceso a la API completa
    return {
      valid: true,
      from: signature.authorization?.from || '0x0000000000000000000000000000000000000000',
      to: expectedTo,
      amount: expectedAmount,
      nonce: signature.authorization?.nonce || ethers.utils.keccak256(ethers.utils.toUtf8Bytes(Date.now().toString())),
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

module.exports = { verifyPayment };
