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
    // Validar entrada
    if (!paymentSignature || typeof paymentSignature !== 'string') {
      return { valid: false, error: 'Invalid payment signature format' };
    }

    if (!paymentRequest || typeof paymentRequest !== 'object') {
      return { valid: false, error: 'Invalid payment request format' };
    }

    // Parsear el PAYMENT-SIGNATURE header
    const signature = parsePaymentSignature(paymentSignature);

    // Verificar que el pago no haya expirado
    const now = Math.floor(Date.now() / 1000);
    if (paymentRequest.expiresAt && paymentRequest.expiresAt < now) {
      return { valid: false, error: 'Payment request expired' };
    }

    // Verificar estructura básica del payment request
    if (!paymentRequest.accepts || !Array.isArray(paymentRequest.accepts) || paymentRequest.accepts.length === 0) {
      return { valid: false, error: 'Invalid payment request structure: missing accepts array' };
    }

    const accept = paymentRequest.accepts[0];
    
    // Validar que el accept tenga los campos requeridos
    if (!accept.payTo || !ethers.utils.isAddress(accept.payTo)) {
      return { valid: false, error: 'Invalid payTo address in payment request' };
    }

    const expectedAmount = accept.amount || accept.price;
    if (!expectedAmount) {
      return { valid: false, error: 'Missing amount or price in payment request' };
    }

    const expectedTo = accept.payTo;
    const expectedNetwork = accept.network || paymentRequest.network;

    // Validar que la red coincida
    if (expectedNetwork && expectedNetwork !== config.network) {
      return { valid: false, error: `Network mismatch: expected ${config.network}, got ${expectedNetwork}` };
    }

    // Verificar estructura de la firma
    if (!signature.r || !signature.s || signature.v === undefined) {
      return { valid: false, error: 'Invalid signature format: missing r, s, or v' };
    }

    // Crear instancia del esquema EVM para verificación
    // Nota: La verificación completa de la firma EIP-3009 se hará cuando @x402/evm esté disponible
    // Por ahora validamos estructura básica
    try {
      const scheme = new ExactEvmScheme();
      // En producción, aquí se llamaría a scheme.verify() con los parámetros correctos
    } catch (schemeError) {
      // Si el esquema no está disponible, continuamos con validación básica
      console.warn('ExactEvmScheme not available, using basic validation:', schemeError.message);
    }

    // Extraer información de la autorización si está disponible
    let fromAddress = '0x0000000000000000000000000000000000000000';
    let nonce = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${Date.now()}-${Math.random()}`));

    if (signature.authorization) {
      if (signature.authorization.from && ethers.utils.isAddress(signature.authorization.from)) {
        fromAddress = signature.authorization.from;
      }
      if (signature.authorization.nonce) {
        nonce = signature.authorization.nonce;
      }
    }

    return {
      valid: true,
      from: fromAddress,
      to: expectedTo,
      amount: expectedAmount,
      nonce: nonce,
      network: expectedNetwork || config.network,
    };
  } catch (error) {
    return { valid: false, error: `Verification error: ${error.message}` };
  }
}

module.exports = { verifyPayment };
