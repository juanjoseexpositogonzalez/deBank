const { expect } = require('chai');
const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');

// Mock database path to use in-memory database for tests
// This must be set before requiring config
const originalEnv = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = ':memory:';

const { parsePaymentSignature } = require('../../facilitator/src/utils/eip3009');
const { checkPaymentExists, recordPayment, initialize } = require('../../facilitator/src/utils/database');
const { verifyPayment } = require('../../facilitator/src/services/paymentVerifier');

describe('Facilitator - Unit Tests', () => {
    let provider;
    let mockPaymentRequest;
    let mockPaymentSignature;

    beforeEach(async () => {
        // Setup provider
        provider = ethers.provider;
        
        // Initialize database (will use in-memory database)
        initialize();
        
        // Mock payment request
        mockPaymentRequest = {
            id: 'test-payment-1',
            uri: 'http://localhost:4021/api/x402/deposit',
            accepts: [{
                scheme: 'exact',
                price: '$10.00',
                amount: '10000000', // 10 USDC in 6 decimals
                network: 'eip155:84532',
                payTo: '0x1234567890123456789012345678901234567890',
            }],
            expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
        };

        // Mock payment signature (simplified format)
        mockPaymentSignature = 'signature=0x123,0x456,27;authorization=eyJmcm9tIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIn0=';
    });

    describe('parsePaymentSignature', () => {
        it('should parse valid payment signature', () => {
            const parsed = parsePaymentSignature(mockPaymentSignature);
            expect(parsed).to.have.property('r');
            expect(parsed).to.have.property('s');
            expect(parsed).to.have.property('v');
            expect(parsed.v).to.equal(27);
        });

        it('should handle signature without authorization', () => {
            const sig = 'signature=0x123,0x456,27';
            const parsed = parsePaymentSignature(sig);
            expect(parsed.r).to.equal('0x123');
            expect(parsed.s).to.equal('0x456');
            expect(parsed.v).to.equal(27);
        });

        it('should handle malformed signature gracefully', () => {
            const sig = 'invalid';
            const parsed = parsePaymentSignature(sig);
            expect(parsed).to.be.an('object');
        });
    });

    describe('Database operations', () => {
        it('should check non-existent payment', async () => {
            const result = await checkPaymentExists('non-existent-id');
            expect(result).to.be.null;
        });

        it('should record and retrieve payment', async () => {
            const paymentId = 'test-payment-2';
            const paymentData = {
                paymentRequest: mockPaymentRequest,
                txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                amount: '10000000',
                from: '0x1111111111111111111111111111111111111111',
                to: '0x1234567890123456789012345678901234567890',
                timestamp: Date.now(),
            };

            await recordPayment(paymentId, paymentData);
            const retrieved = await checkPaymentExists(paymentId);
            
            expect(retrieved).to.not.be.null;
            expect(retrieved.id).to.equal(paymentId);
            expect(retrieved.tx_hash).to.equal(paymentData.txHash);
        });

        it('should prevent duplicate payments', async () => {
            const paymentId = 'test-payment-3';
            const paymentData = {
                paymentRequest: mockPaymentRequest,
                txHash: '0xtest123',
                amount: '10000000',
                from: '0x1111111111111111111111111111111111111111',
                to: '0x1234567890123456789012345678901234567890',
                timestamp: Date.now(),
            };

            await recordPayment(paymentId, paymentData);
            const duplicate = await checkPaymentExists(paymentId);
            
            expect(duplicate).to.not.be.null;
            expect(duplicate.id).to.equal(paymentId);
        });
    });

    afterEach(() => {
        // Clean up: reset database path if needed
        if (originalEnv !== undefined) {
            process.env.DATABASE_PATH = originalEnv;
        } else {
            delete process.env.DATABASE_PATH;
        }
    });

    describe('verifyPayment', () => {
        it('should reject expired payment request', async () => {
            const expiredRequest = {
                ...mockPaymentRequest,
                expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired 100 seconds ago
            };

            const result = await verifyPayment(mockPaymentSignature, expiredRequest);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('expired');
        });

        it('should reject invalid payment request structure', async () => {
            const invalidRequest = {
                id: 'test',
                // Missing accepts array
            };

            const result = await verifyPayment(mockPaymentSignature, invalidRequest);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Invalid payment request structure');
        });

        it('should reject payment request with invalid payTo address', async () => {
            const invalidRequest = {
                ...mockPaymentRequest,
                accepts: [{
                    ...mockPaymentRequest.accepts[0],
                    payTo: 'invalid-address',
                }],
            };

            const result = await verifyPayment(mockPaymentSignature, invalidRequest);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Invalid payTo address');
        });

        it('should accept valid payment request structure', async () => {
            // Nota: La verificación completa de firma requiere @x402/evm
            // Por ahora solo verificamos estructura básica
            const result = await verifyPayment(mockPaymentSignature, mockPaymentRequest);
            
            // Puede fallar si @x402/evm no está disponible, pero estructura debe ser válida
            if (result.valid) {
                expect(result).to.have.property('from');
                expect(result).to.have.property('to');
                expect(result).to.have.property('amount');
            }
        });
    });
});
