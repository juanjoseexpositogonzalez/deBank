const { ethers } = require('hardhat');
const axios = require('axios');

/**
 * Helper functions for x402 tests
 */

/**
 * Check if x402 services are running
 * @returns {Promise<{facilitator: boolean, backend: boolean}>}
 */
async function checkX402Services(facilitatorUrl = 'http://localhost:4022', backendUrl = 'http://localhost:4021') {
    const result = { facilitator: false, backend: false };
    
    try {
        const facilitatorResponse = await axios.get(`${facilitatorUrl}/health`, { timeout: 2000 });
        result.facilitator = facilitatorResponse.status === 200;
    } catch (error) {
        result.facilitator = false;
    }
    
    try {
        const backendResponse = await axios.get(`${backendUrl}/health`, { timeout: 2000 });
        result.backend = backendResponse.status === 200;
    } catch (error) {
        result.backend = false;
    }
    
    return result;
}

/**
 * Create a mock payment request for testing
 * @param {object} options - Payment request options
 * @returns {object} Mock payment request
 */
function createMockPaymentRequest(options = {}) {
    const {
        id = `test-${Date.now()}`,
        amount = '10.00',
        payTo = '0x1234567890123456789012345678901234567890',
        network = 'eip155:84532',
        expiresIn = 300, // 5 minutes
    } = options;

    return {
        id,
        uri: 'http://localhost:4021/api/x402/deposit',
        accepts: [{
            scheme: 'exact',
            price: `$${amount}`,
            amount: ethers.utils.parseUnits(amount, 6).toString(), // USDC has 6 decimals
            network,
            payTo,
        }],
        expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    };
}

/**
 * Create a mock payment signature for testing
 * @param {object} options - Signature options
 * @returns {string} Mock payment signature
 */
function createMockPaymentSignature(options = {}) {
    const {
        r = '0x' + '1'.repeat(64),
        s = '0x' + '2'.repeat(64),
        v = 27,
        from = '0x1111111111111111111111111111111111111111',
        nonce = '0x' + '3'.repeat(64),
    } = options;

    const authorization = Buffer.from(JSON.stringify({ from, nonce })).toString('base64');
    return `signature=${r},${s},${v};authorization=${authorization}`;
}

/**
 * Wait for a transaction to be mined
 * @param {Promise} txPromise - Transaction promise
 * @param {number} confirmations - Number of confirmations to wait
 * @returns {Promise<object>} Transaction receipt
 */
async function waitForTransaction(txPromise, confirmations = 1) {
    const tx = await txPromise;
    return await tx.wait(confirmations);
}

/**
 * Get user's dBank shares
 * @param {Contract} dBank - dBank contract instance
 * @param {string} userAddress - User address
 * @returns {Promise<string>} Formatted shares amount
 */
async function getUserShares(dBank, userAddress) {
    const shares = await dBank.balanceOf(userAddress);
    return ethers.utils.formatUnits(shares, 18);
}

/**
 * Get user's token balance
 * @param {Contract} token - Token contract instance
 * @param {string} userAddress - User address
 * @returns {Promise<string>} Formatted balance amount
 */
async function getUserBalance(token, userAddress) {
    const balance = await token.balanceOf(userAddress);
    return ethers.utils.formatUnits(balance, 18);
}

/**
 * Fund an address with tokens
 * @param {Contract} token - Token contract instance
 * @param {string} to - Recipient address
 * @param {string} amount - Amount in tokens (will be converted to wei)
 * @param {Signer} from - Signer to send from
 */
async function fundAddress(token, to, amount, from) {
    const amountWei = ethers.utils.parseUnits(amount, 18);
    const tx = await token.connect(from).transfer(to, amountWei);
    await tx.wait();
}

module.exports = {
    checkX402Services,
    createMockPaymentRequest,
    createMockPaymentSignature,
    waitForTransaction,
    getUserShares,
    getUserBalance,
    fundAddress,
};
