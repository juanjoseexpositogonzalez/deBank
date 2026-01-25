require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4021,
  facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:4022',
  network: process.env.NETWORK || 'eip155:84532',
  treasuryWallet: process.env.TREASURY_WALLET,
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY,
  dBankAddress: process.env.DBANK_ADDRESS,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  minDeposit: process.env.MIN_DEPOSIT_USD || '1.00',
  maxDeposit: process.env.MAX_DEPOSIT_USD || '10000.00',
};
