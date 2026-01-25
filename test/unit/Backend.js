const { expect } = require('chai');
const { ethers } = require('hardhat');
const { validateDepositRequest, checkIdempotency, recordPayment } = require('../../backend/src/utils/validation');

describe('Backend - Unit Tests', () => {
    let mockConfig;

    beforeEach(() => {
        // Mock config
        mockConfig = {
            minDeposit: '1.00',
            maxDeposit: '10000.00',
        };
        
        // Mock config module
        jest.mock('../../backend/src/config', () => mockConfig);
    });

    describe('validateDepositRequest', () => {
        it('should accept valid deposit request', () => {
            const request = {
                amount: '10.00',
                userAddress: '0x1234567890123456789012345678901234567890',
                requestId: 'test-request-1',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.true;
        });

        it('should reject zero amount', () => {
            const request = {
                amount: '0',
                userAddress: '0x1234567890123456789012345678901234567890',
                requestId: 'test-request-2',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Invalid amount');
        });

        it('should reject negative amount', () => {
            const request = {
                amount: '-10.00',
                userAddress: '0x1234567890123456789012345678901234567890',
                requestId: 'test-request-3',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
        });

        it('should reject amount below minimum', () => {
            const request = {
                amount: '0.50', // Below 1.00 minimum
                userAddress: '0x1234567890123456789012345678901234567890',
                requestId: 'test-request-4',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Minimum deposit');
        });

        it('should reject amount above maximum', () => {
            const request = {
                amount: '20000.00', // Above 10000.00 maximum
                userAddress: '0x1234567890123456789012345678901234567890',
                requestId: 'test-request-5',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Maximum deposit');
        });

        it('should reject invalid user address', () => {
            const request = {
                amount: '10.00',
                userAddress: 'invalid-address',
                requestId: 'test-request-6',
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Invalid user address');
        });

        it('should reject missing requestId', () => {
            const request = {
                amount: '10.00',
                userAddress: '0x1234567890123456789012345678901234567890',
                // Missing requestId
            };

            const result = validateDepositRequest(request);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('Missing requestId');
        });
    });

    describe('checkIdempotency', () => {
        it('should accept new requestId', async () => {
            const requestId = `test-${Date.now()}-${Math.random()}`;
            const result = await checkIdempotency(requestId);
            expect(result.valid).to.be.true;
        });

        it('should reject duplicate requestId', async () => {
            const requestId = `test-duplicate-${Date.now()}`;
            const paymentData = {
                amount: '10.00',
                userAddress: '0x1234567890123456789012345678901234567890',
                txHash: '0xtest123',
                shares: '10.00',
            };

            // Record first payment
            await recordPayment(requestId, paymentData);

            // Try to use same requestId again
            const result = await checkIdempotency(requestId);
            expect(result.valid).to.be.false;
            expect(result.error).to.include('already processed');
            expect(result.existingTxHash).to.equal(paymentData.txHash);
        });
    });

    describe('recordPayment', () => {
        it('should record payment successfully', async () => {
            const requestId = `test-record-${Date.now()}`;
            const paymentData = {
                amount: '10.00',
                userAddress: '0x1234567890123456789012345678901234567890',
                txHash: '0xrecord123',
                shares: '10.00',
            };

            await expect(recordPayment(requestId, paymentData)).to.not.be.rejected;
        });
    });
});
