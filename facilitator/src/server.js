const express = require('express');
const cors = require('cors');
const config = require('./config');
const verifyRoute = require('./routes/verify');
const { initialize: initDatabase } = require('./utils/database');
const logger = require('./utils/logger');

// Inicializar base de datos
initDatabase();

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

// Verify payment endpoint
app.use('/verify', verifyRoute);

app.listen(config.port, () => {
  logger.info('x402 Facilitator started', {
    port: config.port,
    network: config.network,
  });
  console.log(`x402 Facilitator listening on port ${config.port}`);
  console.log(`Network: ${config.network}`);
});
