const { ethers } = require('ethers');
const config = require('../config');

// EIP-3009 ABI para transferWithAuthorization
const EIP3009_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
];

let provider;
let usdcContract;

function initialize() {
  provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  usdcContract = new ethers.Contract(config.usdcAddress, EIP3009_ABI, provider);
}

async function settlePayment(verification) {
  if (!usdcContract) initialize();

  try {
    // El settlement en x402 se hace automáticamente cuando el comprador
    // firma con transferWithAuthorization. El facilitador solo verifica.
    // En nuestro caso, el pago ya fue transferido on-chain por el cliente.

    // Verificar que la transferencia existe on-chain
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10); // Últimos 10 bloques

    const transferEvent = await usdcContract.queryFilter(
      usdcContract.filters.AuthorizationUsed(verification.from, verification.nonce),
      fromBlock,
      currentBlock
    );

    if (transferEvent.length === 0) {
      return {
        success: false,
        error: 'Transfer not found on-chain',
      };
    }

    // Obtener hash de la transacción
    const txHash = transferEvent[0].transactionHash;

    return {
      success: true,
      txHash,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { settlePayment };
