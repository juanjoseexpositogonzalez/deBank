const request = require('supertest');
const express = require('express');
const verifyRoute = require('../src/routes/verify');

// Mock de servicios
jest.mock('../src/services/paymentVerifier', () => ({
  verifyPayment: jest.fn(),
}));

jest.mock('../src/services/settlement', () => ({
  settlePayment: jest.fn(),
}));

jest.mock('../src/utils/database', () => ({
  checkPaymentExists: jest.fn(),
  recordPayment: jest.fn(),
}));

describe('POST /verify', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/verify', verifyRoute);
  });

  it('should return 400 if paymentSignature is missing', async () => {
    const response = await request(app)
      .post('/verify')
      .send({
        paymentRequest: { accepts: [{ payTo: '0x123', price: '$1.00' }] }
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing');
  });

  it('should return 400 if paymentRequest is missing', async () => {
    const response = await request(app)
      .post('/verify')
      .send({
        paymentSignature: 'signature=0x123,0x456,27'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing');
  });

  // Más tests se añadirán cuando las dependencias estén disponibles
});
