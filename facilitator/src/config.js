require('dotenv').config();

module.exports = {
  port: process.env.FACILITATOR_PORT || 4022,
  network: process.env.NETWORK || 'eip155:84532',
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  usdcAddress: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  databasePath: process.env.DATABASE_PATH || './facilitator.db',
  maxPaymentAge: process.env.MAX_PAYMENT_AGE_SECONDS || 300, // 5 minutos
};
