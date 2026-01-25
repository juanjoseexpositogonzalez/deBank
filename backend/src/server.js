const express = require('express');
const cors = require('cors');
const config = require('./config');
const depositRoute = require('./routes/deposit');
const logger = require('./utils/logger');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    network: config.network,
    timestamp: new Date().toISOString(),
  });
});

// x402 payment middleware will be added here when @x402/express is installed
// For now, we'll use a basic route that can be enhanced later
app.use('/api/x402', depositRoute);

// Note: To enable x402 payment middleware, uncomment and configure:
/*
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const { HTTPFacilitatorClient } = require('@x402/core/server');

const facilitatorClient = new HTTPFacilitatorClient({
  url: config.facilitatorUrl,
});

const server = new x402ResourceServer(facilitatorClient)
  .register(config.network, new ExactEvmScheme());

app.use(paymentMiddleware({
  'POST /api/x402/deposit': {
    accepts: [{
      scheme: 'exact',
      price: '$1.00',
      network: config.network,
      payTo: config.treasuryWallet,
    }],
    description: 'Deposit funds to dBank vault via x402',
    mimeType: 'application/json',
  },
}, server));
*/

app.listen(config.port, () => {
  logger.info('x402 backend started', {
    port: config.port,
    network: config.network,
    facilitatorUrl: config.facilitatorUrl,
  });
  console.log(`x402 backend listening on port ${config.port}`);
  console.log(`Network: ${config.network}`);
  console.log(`Facilitator: ${config.facilitatorUrl}`);
});
