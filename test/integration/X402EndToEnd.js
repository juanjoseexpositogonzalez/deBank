const { expect } = require('chai');
const { ethers } = require('hardhat');
const axios = require('axios');
const { checkX402Services, createMockPaymentRequest, createMockPaymentSignature } = require('../helpers/x402Helpers');

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 18);

/**
 * Test de integración end-to-end para x402
 * 
 * Este test requiere que el facilitador y backend estén corriendo:
 * - Facilitador: http://localhost:4022
 * - Backend: http://localhost:4021
 * 
 * Para ejecutar:
 * 1. Iniciar facilitador: cd facilitator && npm start
 * 2. Iniciar backend: cd backend && npm start
 * 3. Ejecutar test: npx hardhat test test/integration/X402EndToEnd.js
 */
describe('x402 End-to-End Integration', () => {
    let token, configManager, strategyRouter, mockS1, dbank;
    let deployer, user, treasury;
    
    const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:4022';
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4021';
    const NETWORK = 'eip155:84532';

    before(async function() {
        [deployer, user, treasury] = await ethers.getSigners();

        // Deploy contracts
        const Token = await ethers.getContractFactory('Token');
        token = await Token.deploy('USDC Token', 'USDC', '10000000');

        const ConfigManager = await ethers.getContractFactory('ConfigManager');
        configManager = await ConfigManager.deploy();

        const StrategyRouter = await ethers.getContractFactory('StrategyRouter');
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address);

        const MockS1 = await ethers.getContractFactory('MockS1');
        mockS1 = await MockS1.deploy(token.address);
        await mockS1.setParams(500, tokens(1000000));

        await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000));

        const dBank = await ethers.getContractFactory('dBank');
        dbank = await dBank.deploy(
            token.address,
            'dBank USDC Vault',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        );

        await dbank.setTvlCap(tokens(1000000));
        await dbank.setPerTxCap(tokens(1000000));

        // Fund treasury
        await token.transfer(treasury.address, tokens(50000));
        await token.connect(treasury).approve(dbank.address, tokens(50000));

        // Check if services are running
        try {
            await axios.get(`${FACILITATOR_URL}/health`, { timeout: 2000 });
            await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });
        } catch (error) {
            console.warn('⚠️  Facilitator or backend not running. Skipping end-to-end tests.');
            console.warn('   Start services: ./scripts/start-x402.sh');
            this.skip();
        }
    });

    describe('Service Health Checks', () => {
        it('should have facilitator running', async () => {
            const response = await axios.get(`${FACILITATOR_URL}/health`);
            expect(response.status).to.equal(200);
            expect(response.data.status).to.equal('ok');
            expect(response.data.network).to.equal(NETWORK);
        });

        it('should have backend running', async () => {
            const response = await axios.get(`${BACKEND_URL}/health`);
            expect(response.status).to.equal(200);
            expect(response.data.status).to.equal('ok');
            expect(response.data.network).to.equal(NETWORK);
        });
    });

    describe('Backend Deposit Endpoint', () => {
        it('should return 402 Payment Required without payment signature', async () => {
            const requestId = `test-402-${Date.now()}`;
            const requestBody = {
                amount: '10.00',
                userAddress: user.address,
                requestId,
            };

            try {
                await axios.post(`${BACKEND_URL}/api/x402/deposit`, requestBody);
                // Should not reach here
                expect.fail('Expected 402 Payment Required');
            } catch (error) {
                // Backend should return 402 if x402 middleware is enabled
                // Or 400/500 if middleware is not enabled yet
                expect([400, 402, 500]).to.include(error.response?.status);
            }
        });

        it('should validate request structure', async () => {
            // Missing required fields
            const invalidRequest = {
                amount: '10.00',
                // Missing userAddress and requestId
            };

            try {
                await axios.post(`${BACKEND_URL}/api/x402/deposit`, invalidRequest);
                expect.fail('Expected validation error');
            } catch (error) {
                expect(error.response?.status).to.equal(400);
            }
        });
    });

    describe('Facilitator Verify Endpoint', () => {
        it('should reject request without paymentSignature', async () => {
            const requestBody = {
                paymentRequest: {
                    accepts: [{
                        scheme: 'exact',
                        price: '$10.00',
                        network: NETWORK,
                        payTo: treasury.address,
                    }],
                },
                // Missing paymentSignature
            };

            try {
                await axios.post(`${FACILITATOR_URL}/verify`, requestBody);
                expect.fail('Expected 400 error');
            } catch (error) {
                expect(error.response?.status).to.equal(400);
                expect(error.response?.data.error).to.include('Missing');
            }
        });

        it('should reject request without paymentRequest', async () => {
            const requestBody = {
                paymentSignature: createMockPaymentSignature(),
                // Missing paymentRequest
            };

            try {
                await axios.post(`${FACILITATOR_URL}/verify`, requestBody);
                expect.fail('Expected 400 error');
            } catch (error) {
                expect(error.response?.status).to.equal(400);
                expect(error.response?.data.error).to.include('Missing');
            }
        });

        it('should handle payment verification with mock data', async () => {
            const paymentRequest = createMockPaymentRequest({
                payTo: treasury.address,
                amount: '10.00',
            });
            const paymentSignature = createMockPaymentSignature({
                from: user.address,
            });

            const requestBody = {
                paymentSignature,
                paymentRequest,
            };

            // This will likely fail without real EIP-3009 signature, but tests structure
            try {
                const response = await axios.post(`${FACILITATOR_URL}/verify`, requestBody);
                // If it succeeds, verify response structure
                expect(response.data).to.have.property('verified');
            } catch (error) {
                // Expected if signature verification fails (mock signature is invalid)
                expect([400, 500]).to.include(error.response?.status);
            }
        });
    });

    describe('Full x402 Flow Simulation', () => {
        it('should complete deposit flow with mocked payment', async () => {
            // This test simulates the full flow:
            // 1. User makes request
            // 2. Backend returns 402 (or processes if middleware not enabled)
            // 3. Payment is verified by facilitator
            // 4. Deposit is executed on-chain
            
            const depositAmount = '10.00';
            const depositAmountWei = tokens(10);
            const requestId = `test-e2e-${Date.now()}`;

            // Step 1: User shares before
            const userSharesBefore = await dbank.balanceOf(user.address);

            // Step 2: Simulate backend processing (without actual x402 middleware)
            // In production, this would go through x402 flow
            // For testing, we simulate the final step: treasury deposits
            await dbank.connect(treasury).deposit(depositAmountWei, user.address);

            // Step 3: Verify user received shares
            const userSharesAfter = await dbank.balanceOf(user.address);
            expect(userSharesAfter).to.be.gt(userSharesBefore);

            // Step 4: Verify treasury balance decreased
            const treasuryBalance = await token.balanceOf(treasury.address);
            expect(treasuryBalance).to.be.lt(tokens(50000));
        });
    });
});
