const request = require('supertest');
const express = require('express');
const depositRoute = require('../src/routes/deposit');

// Mock de servicios
jest.mock('../src/services/payment', () => ({
  processDeposit: jest.fn(),
}));

jest.mock('../src/utils/validation', () => ({
  validateDepositRequest: jest.fn(),
}));

describe('POST /api/x402/deposit', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/x402', depositRoute);
  });

  it('should return 400 if amount is missing', async () => {
    const response = await request(app)
      .post('/api/x402/deposit')
      .send({
        userAddress: '0x1234567890123456789012345678901234567890',
        requestId: 'test-1'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing');
  });

  it('should return 400 if userAddress is missing', async () => {
    const response = await request(app)
      .post('/api/x402/deposit')
      .send({
        amount: '10.00',
        requestId: 'test-1'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing');
  });

  // Más tests se añadirán cuando las dependencias estén disponibles
});
