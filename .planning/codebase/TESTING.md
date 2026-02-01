# Testing Patterns

**Analysis Date:** 2026-02-01

## Test Framework

**Runner:**
- Hardhat + ethers.js for smart contract testing
- React Scripts test runner for frontend (Jest under the hood)
- Test command: `npm test` (runs both unit and integration tests via Hardhat)

**Assertion Library:**
- Chai (via Hardhat): `const { expect } = require('chai')`
- Testing Library for React components: `@testing-library/react`

**Run Commands:**
```bash
npm test                          # Run all tests (Hardhat)
npm run advance-time              # Run time-advance script
npm run advance-time:1day         # Advance time 1 day
npm run advance-time:7days        # Advance time 7 days
npm run advance-time:30days       # Advance time 30 days
npm run advance-time:1year        # Advance time 365 days
```

## Test File Organization

**Location:**
- Smart contract tests: `test/unit/` for unit tests, `test/integration/` for integration tests
- Frontend tests: Typically co-located with components (React Scripts convention)
- Helpers: `test/helpers/` (e.g., `test/helpers/x402Helpers.js`)

**Naming:**
- Test files match contract names: `test/unit/dBank.js` tests `contracts/dBank.sol`
- Integration tests describe flow: `test/integration/Flow.js`, `test/integration/WithdrawCap.js`
- Helper files: Descriptive with "Helpers" suffix (e.g., `x402Helpers.js`)

**Structure:**
```
test/
├── unit/                          # Unit tests for individual contracts
│   ├── dBank.js
│   ├── Token.js
│   ├── ConfigManager.js
│   ├── StrategyRouter.js
│   ├── MockS1.js
│   ├── Facilitator.js
│   └── Backend.js
├── integration/                   # Integration/end-to-end flows
│   ├── Flow.js
│   ├── WithdrawCap.js
│   ├── WithdrawAfterAllocation.js
│   ├── WithdrawWithAllocations.js
│   ├── X402Flow.js
│   └── X402EndToEnd.js
├── helpers/
│   └── x402Helpers.js
├── Token.js                       # Legacy test file (in review)
└── TODO.md                        # Test documentation/TODOs
```

## Test Structure

**Suite Organization:**

From `test/unit/dBank.js`:
```javascript
const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

describe('dBank', () => {
    let token, dbank, configManager, strategyRouter, accounts, deployer, receiver, user1, user2

    beforeEach(async () => {
        // Deploy all contracts and fund test accounts
        accounts = await ethers.getSigners()
        deployer = accounts[0]
        receiver = accounts[1]
        user1 = accounts[2]
        user2 = accounts[3]
        // ... contract deployments and setup ...
    })

    describe('[VAULT/SETUP] Metadata & Wiring', () => {
        it('returns correct asset address', async () => {
            expect(await dbank.asset()).to.equal(token.address)
        })
    })
})
```

**Patterns:**
- Test suites use `describe()` with semantic naming (e.g., `[VAULT/SETUP] Metadata & Wiring`)
- Test cases use `it()` with descriptive names matching acceptance criteria
- Setup: `beforeEach()` deploys fresh contract instances and funds test accounts
- Teardown: Not explicitly used (Hardhat resets state between tests by default)
- Assertions: Chai expect syntax (e.g., `expect(result).to.equal(expected)`)

## Mocking

**Framework:** ethers.js contract mocking via fixture-like setup

**Patterns:**
- Mock contracts deployed in `beforeEach()` with test parameters
- Example from `test/integration/Flow.js`:
```javascript
const MockS1 = await ethers.getContractFactory('MockS1');
mockS1 = await MockS1.deploy(token.address);
await mockS1.setParams(500, tokens(1000000)); // 5% APR, 1M cap
```
- Contract instances used directly: `await dbank.connect(user).deposit(...)`
- Signer mocking: Different accounts for different roles (deployer, user1, user2)

**What to Mock:**
- Time: EVM time advancement via `ethers.provider.send('evm_increaseTime', [seconds])`
- External strategies: MockS1 contract simulates yield-generating strategy
- Different user roles: Test accounts with different permissions and balances

**What NOT to Mock:**
- Core contract logic: All contracts deployed and function calls execute real code
- State transitions: Test actual state changes via contract calls
- Errors: Real custom errors tested with `expect().to.be.revertedWithCustomError()`

## Fixtures and Factories

**Test Data:**

From `test/unit/dBank.js`:
```javascript
const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens
const addressZero = '0x0000000000000000000000000000000000000000'
const YEAR = 365 * 24 * 3600;
const SCALE = ethers.utils.parseUnits('1', 18);
const TOL = ethers.utils.parseUnits('0.01', 18);
const EPOCH_DURATION = 7 * 24 * 3600;

const SMALL_AMOUNT = ethers.BigNumber.from('1000000000')
const MEDIUM_AMOUNT = ethers.BigNumber.from('2000000000')
const LARGE_AMOUNT = ethers.BigNumber.from('4000000000')
```

**Location:**
- Helper constants defined at top of test files
- Reusable `tokens()` function converts human-readable amounts to wei
- Named constants for amounts, time durations, and tolerances
- Test-specific constants for limits and caps (e.g., `SMALL_AMOUNT`, `LARGE_AMOUNT`)

## Coverage

**Requirements:** No explicit coverage requirement enforced

**View Coverage:**
```bash
# Coverage data exists in /home/juanjo/code/dBank/coverage
# File: coverage.json (26KB from Dec 10, 2024)
```

**Current State:**
- Coverage artifacts present but not actively enforced in CI
- Tests exist for critical paths but full coverage status unknown
- Integration tests focus on user flows over line coverage

## Test Types

**Unit Tests:**
- Scope: Individual contract functions and state management
- Approach: Direct function calls with specific inputs and output assertions
- Example: `test/unit/dBank.js` tests vault metadata, deposit/withdraw mechanics
- Location: `test/unit/`
- Coverage: Metadata validation, ERC-4626 compliance, error conditions

**Integration Tests:**
- Scope: Multi-contract interactions and complete user flows
- Approach: End-to-end scenarios with time advancement and multiple transactions
- Example from `test/integration/Flow.js`: User deposits → vault allocates → yield accrues → user withdraws within buffer
- Location: `test/integration/`
- Coverage: Allocation flows, withdrawal caps, strategy interactions, X402 integration paths

**E2E Tests:**
- Framework: X402-specific end-to-end flows (not traditional Selenium/Cypress)
- Usage: Testing backend integration and cross-chain scenarios
- Files: `test/integration/X402EndToEnd.js`, `test/integration/X402Flow.js`

## Common Patterns

**Async Testing:**
```javascript
it('happy path: vault allocation earns yield', async () => {
    // Use await for contract calls
    await dbank.connect(user).deposit(tokens(5000), user.address);

    // Advance EVM time for yield accrual
    await ethers.provider.send('evm_increaseTime', [YEAR]);
    await ethers.provider.send('evm_mine', []);

    // Assert state changes
    const assetsAfter = await dbank.convertToAssets(shares);
    expect(assetsAfter).to.be.gt(assetsBefore);
});
```

**Error Testing:**
```javascript
it('withdraw reverts when cap exceeded', async () => {
    // Expect custom error with optional parameters
    await expect(
        dbank.connect(user).withdraw(tokens(5000), user.address, user.address)
    ).to.be.revertedWithCustomError(dbank, 'dBank__CapExceeded');

    // Or with require errors
    await expect(
        someCall()
    ).to.be.reverted;
});
```

**State Assertion:**
```javascript
// Direct state reads
const bufferAmount = await dbank.buffer();
expect(bufferAmount).to.equal(tokens(1500));

// Computation assertions
const shares = await dbank.balanceOf(user.address);
const assetsFromShares = await dbank.convertToAssets(shares);
expect(assetsFromShares).to.be.gt(previousAssets);
```

**Multi-User Flows:**
```javascript
// Different signers (users) interact with same contract
await token.connect(user1).approve(dbank.address, tokens(10000));
await dbank.connect(user1).deposit(tokens(5000), user1.address);

await dbank.connect(deployer).allocate(1, tokens(3500));

await dbank.connect(user1).withdraw(tokens(1500), user1.address, user1.address);
```

## Test Debugging

**Common Issues:**
- Stale state during network/account switches: Tests reset state in `beforeEach()`
- Block timestamp inconsistencies: Use `ethers.provider.send('evm_increaseTime', [...])` and `evm_mine`
- Capacity limits: Tests set high caps with `setTvlCap()` and `setPerTxCap()`
- ABI mismatches: ABIs kept in sync via `npm run sync-abis` script

**Error Decoding:**
From `src/store/interactions.js`:
```javascript
try {
    // contract call
} catch (error) {
    try {
        const iface = new ethers.utils.Interface(DBANK_ABI);
        const reason = iface.parseError(error.data);
        console.error('Custom error:', reason.name);
    } catch (decodeError) {
        console.error('Error decoding revert:', decodeError);
    }
}
```

---

*Testing analysis: 2026-02-01*
