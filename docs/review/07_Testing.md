# Testing Documentation

## Overview

The dBank protocol has comprehensive unit tests covering all contracts. Tests are written in JavaScript using Hardhat, Chai, and Ethers.js.

**Framework**: Hardhat
**Assertion Library**: Chai
**Test Location**: `test/unit/`

---

## Test Structure

```
test/
├── unit/
│   ├── Token.js           # ERC-20 token tests
│   ├── ConfigManager.js   # Configuration tests
│   ├── dBank.js           # Core vault tests (100 tests)
│   ├── StrategyRouter.js  # Router tests
│   └── MockS1.js          # Strategy tests
└── integration/
    └── (future integration tests)
```

---

## Running Tests

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/unit/dBank.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run with coverage
npx hardhat coverage
```

---

## dBank.js Test Coverage

**Total Tests**: 100

### Test Suites

| Suite | Tests | Coverage |
|-------|-------|----------|
| `[VAULT/SETUP] Metadata & Wiring` | 13 | Constructor, initial state |
| `[VAULT/GET] Totals & Conversions` | 7 | totalAssets, convertTo*, pricePerShare |
| `[VAULT/LIMITS] Max & Preview` | 13 | maxDeposit, maxWithdraw, preview* |
| `[VAULT/DEPOSIT] Buffer Policy` | 11 | deposit, mint, caps, reverts |
| `[VAULT/WITHDRAW] Instant & Sync` | 11 | withdraw, redeem, buffer logic |
| `[VAULT/ERC20] Share Token Functions` | 9 | transfer, approve, allowance |
| `[VAULT/ADMIN] Config Updates` | 9 | setters, owner-only |
| `[VAULT/FEE] Epoch & HWM` | 6 | crystallizeFees, highWaterMark |
| `[VAULT/INTEGRATION] End-to-End` | 4 | Full deposit/withdraw flows |
| `[VAULT/ALLOCATION] Strategy Allocation` | 8 | allocate function |
| `[VAULT/STRATEGY_WITHDRAW] Withdraw from Strategies` | 4 | Buffer + strategy withdrawal |
| `[VAULT/YIELD] Share/Asset Ratio with Yield` | 5 | Yield mechanics |

---

### Key Test Patterns

#### 1. Setup Pattern

```javascript
describe('dBank', () => {
    let token, dbank, configManager, strategyRouter
    let deployer, receiver, user1, user2

    beforeEach(async () => {
        // Get signers
        [deployer, receiver, user1, user2] = await ethers.getSigners()

        // Deploy contracts
        token = await Token.deploy('USDC', 'USDC', '10000000')
        configManager = await ConfigManager.deploy()
        strategyRouter = await StrategyRouter.deploy(token.address, configManager.address)
        dbank = await dBank.deploy(
            token.address,
            'dBank USDC Vault',
            'dbUSDC',
            strategyRouter.address,
            configManager.address
        )

        // Fund test users
        await token.transfer(user1.address, tokens(100000))
    })
})
```

#### 2. Happy Path Test

```javascript
it('deposit mints correct shares', async () => {
    const assets = tokens(1000)
    const expectedShares = await dbank.previewDeposit(assets)

    await token.connect(user1).approve(dbank.address, assets)
    const tx = await dbank.connect(user1).deposit(assets, user1.address)
    const receipt = await tx.wait()

    const depositEvent = receipt.events.find(e => e.event === 'Deposit')
    expect(depositEvent.args.shares).to.equal(expectedShares)
})
```

#### 3. Revert Test

```javascript
it('deposit reverts when paused', async () => {
    await dbank.connect(deployer).pause(true)

    await expect(
        dbank.connect(user1).deposit(tokens(1000), user1.address)
    ).to.be.revertedWithCustomError(dbank, 'dBank__Paused')
})
```

#### 4. Event Test

```javascript
it('deposit emits Deposit event', async () => {
    const assets = tokens(1000)
    await token.connect(user1).approve(dbank.address, assets)
    const expectedShares = await dbank.previewDeposit(assets)

    await expect(dbank.connect(user1).deposit(assets, user1.address))
        .to.emit(dbank, 'Deposit')
        .withArgs(user1.address, user1.address, assets, expectedShares)
})
```

#### 5. Time Manipulation Test

```javascript
it('pricePerShare increases when strategy generates yield', async () => {
    const priceBefore = await dbank.pricePerShare()

    // Advance time by 1 year
    await ethers.provider.send("evm_increaseTime", [365 * 24 * 3600])
    await ethers.provider.send("evm_mine", [])

    const priceAfter = await dbank.pricePerShare()
    expect(priceAfter).to.be.gt(priceBefore)
})
```

---

## Helper Functions

```javascript
// Convert to wei (18 decimals)
const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

// Constants
const addressZero = '0x0000000000000000000000000000000000000000'
const YEAR = 365 * 24 * 3600
const EPOCH_DURATION = 7 * 24 * 3600
```

---

## Test Categories

### Unit Tests

Testing individual functions in isolation:

```javascript
describe('convertToShares', () => {
    it('returns assets when totalSupply is 0', async () => {
        const shares = await dbank.convertToShares(tokens(1000))
        expect(shares).to.equal(tokens(1000))
    })
})
```

### Integration Tests

Testing interactions between contracts:

```javascript
describe('[VAULT/ALLOCATION]', () => {
    beforeEach(async () => {
        // Deploy and configure MockS1
        mockS1 = await MockS1.deploy(token.address)
        await mockS1.setParams(500, tokens(1000000))

        // Register with router
        await strategyRouter.registerStrategy(1, mockS1.address, tokens(100000))

        // Deposit to dBank
        await token.connect(user1).approve(dbank.address, tokens(10000))
        await dbank.connect(user1).deposit(tokens(10000), user1.address)
    })

    it('allocate moves assets from buffer to strategy', async () => {
        await dbank.connect(deployer).allocate(1, tokens(5000))
        // Verify buffer decreased, strategy received
    })
})
```

### Edge Case Tests

```javascript
it('handles precision correctly in share calculations', async () => {
    // Test with small amounts that could lose precision
    const smallAmount = ethers.BigNumber.from('1000000000') // 1e9 wei

    await token.connect(user1).approve(dbank.address, smallAmount)
    await dbank.connect(user1).deposit(smallAmount, user1.address)

    const shares = await dbank.balanceOf(user1.address)
    expect(shares).to.be.gt(0)
})
```

---

## Test Coverage Requirements

| Category | Target | Notes |
|----------|--------|-------|
| Line Coverage | > 90% | All main code paths |
| Branch Coverage | > 85% | If/else branches |
| Function Coverage | 100% | All external functions |

---

## Common Test Scenarios

### 1. First Deposit (1:1 ratio)

```javascript
it('first deposit gets 1:1 shares', async () => {
    const assets = tokens(1000)
    await token.connect(user1).approve(dbank.address, assets)
    await dbank.connect(user1).deposit(assets, user1.address)

    const shares = await dbank.balanceOf(user1.address)
    expect(shares).to.equal(assets) // 1:1 ratio
})
```

### 2. Second Deposit (maintains ratio)

```javascript
it('second deposit maintains share ratio', async () => {
    // First deposit
    await token.connect(user1).approve(dbank.address, tokens(1000))
    await dbank.connect(user1).deposit(tokens(1000), user1.address)

    // Second deposit (same amount)
    await token.connect(user2).approve(dbank.address, tokens(1000))
    await dbank.connect(user2).deposit(tokens(1000), user2.address)

    // Both should have equal shares
    const shares1 = await dbank.balanceOf(user1.address)
    const shares2 = await dbank.balanceOf(user2.address)
    expect(shares1).to.equal(shares2)
})
```

### 3. Withdrawal After Yield

```javascript
it('user receives more assets after yield', async () => {
    // Deposit and allocate
    await dbank.connect(user1).deposit(tokens(1000), user1.address)
    await dbank.connect(deployer).allocate(1, tokens(800))

    // Simulate yield
    await ethers.provider.send("evm_increaseTime", [YEAR])
    await ethers.provider.send("evm_mine", [])

    // Withdraw all
    const shares = await dbank.balanceOf(user1.address)
    const assetsReceived = await dbank.convertToAssets(shares)

    expect(assetsReceived).to.be.gt(tokens(1000)) // More than deposited
})
```

---

## Debugging Tests

### Verbose Logging

```javascript
it('debug test', async () => {
    const totalAssets = await dbank.totalAssets()
    const totalSupply = await dbank.totalSupply()
    const buffer = await dbank.buffer()

    console.log('totalAssets:', ethers.utils.formatEther(totalAssets))
    console.log('totalSupply:', ethers.utils.formatEther(totalSupply))
    console.log('buffer:', ethers.utils.formatEther(buffer))
})
```

### Transaction Tracing

```javascript
const tx = await dbank.connect(user1).deposit(tokens(1000), user1.address)
const receipt = await tx.wait()

console.log('Gas used:', receipt.gasUsed.toString())
console.log('Events:', receipt.events.map(e => e.event))
```

---

## Future Test Improvements

1. **Fuzz Testing**: Property-based testing with random inputs
2. **Invariant Testing**: Ensure protocol invariants hold
3. **Gas Benchmarks**: Track gas usage over time
4. **Mainnet Forking**: Test against real USDC
5. **Scenario Testing**: Complex multi-step scenarios
