# Testing Strategy Documentation

## Table of Contents

1. [Overview](#overview)
2. [Testing Philosophy](#testing-philosophy)
3. [Test Structure](#test-structure)
4. [Testing Patterns](#testing-patterns)
5. [JavaScript/Chai/Ethers Specifics](#javascriptchaiethers-specifics)
6. [Advanced Testing Techniques](#advanced-testing-techniques)
7. [Common Patterns and Why](#common-patterns-and-why)
8. [Best Practices](#best-practices)
9. [Interesting Language Features](#interesting-language-features)

---

## Overview

This document explains the testing strategy used in the dBank project, focusing on:
- **Why** we test the way we do
- **How** we structure tests
- **What** patterns and techniques we use
- **Interesting aspects** of JavaScript, Chai, and Ethers.js for testing

### Testing Stack

- **Framework**: Mocha (via Hardhat)
- **Assertion Library**: Chai
- **Ethereum Library**: Ethers.js v5
- **Test Environment**: Hardhat Network (local blockchain)
- **Coverage**: Istanbul (via Hardhat)

---

## Testing Philosophy

### 1. Test Isolation

**Principle**: Each test should be independent and not rely on state from previous tests.

**Implementation**: 
- Use `beforeEach` to reset state before each test
- Deploy fresh contracts for each test suite
- Don't assume execution order

**Why?**:
- Tests can run in any order
- Easier to debug (isolated failures)
- More reliable CI/CD

### 2. Arrange-Act-Assert (AAA) Pattern

**Principle**: Structure tests in three clear phases.

**Example**:
```javascript
it('deposits to strategy correctly', async () => {
    // Arrange: Set up test conditions
    const amount = ethers.utils.parseUnits('100000', 18);
    await token.transfer(user1.address, amount);
    await token.connect(user1).approve(router.address, amount);
    
    // Act: Execute the function being tested
    await router.connect(user1).depositToStrategy(1, amount);
    
    // Assert: Verify the results
    const strategyInfo = await router.getStrategy(1);
    expect(strategyInfo.allocated).to.equal(amount);
});
```

**Why?**:
- Clear separation of concerns
- Easy to understand what's being tested
- Consistent structure across all tests

### 3. Test Both Success and Failure Cases

**Principle**: For every function, test:
- ✅ Happy path (success cases)
- ❌ Failure cases (reverts, edge cases)

**Example Structure**:
```javascript
describe('depositToStrategy()', () => {
    describe('Success', () => {
        it('deposits correctly', ...);
        it('updates allocated', ...);
    });
    
    describe('Failure', () => {
        it('reverts when paused', ...);
        it('reverts when cap exceeded', ...);
    });
});
```

**Why?**:
- Ensures error handling works
- Documents expected behavior
- Prevents regressions

### 4. Test Events

**Principle**: Verify that events are emitted with correct values.

**Why?**:
- Events are crucial for off-chain indexing
- Incorrect events break integrations
- Events document important state changes

---

## Test Structure

### Mocha's `describe` and `it`

**Structure**:
```javascript
describe('ContractName', () => {
    describe('FunctionName', () => {
        describe('Success', () => {
            it('should do something', async () => {
                // Test code
            });
        });
        
        describe('Failure', () => {
            it('should revert when...', async () => {
                // Test code
            });
        });
    });
});
```

**Naming Convention**:
- `describe`: Describes what is being tested (contract, function, scenario)
- `it`: Describes the expected behavior in plain English
- Nested `describe`: Groups related tests

**Example**:
```javascript
describe('StrategyRouter', () => {                    // Contract
    describe('depositToStrategy()', () => {            // Function
        describe('Success', () => {                    // Scenario
            it('deposits to strategy S1 correctly', ...); // Behavior
        });
    });
});
```

### `beforeEach` Hook

**Purpose**: Set up fresh state before each test.

**Example**:
```javascript
beforeEach(async () => {
    // Deploy contracts
    const Token = await ethers.getContractFactory('Token');
    token = await Token.deploy(...);
    
    // Get signers
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    user1 = accounts[1];
    
    // Set up initial state
    await mockS1.setParams(500, cap);
});
```

**Why `beforeEach` instead of `before`?**:
- `beforeEach`: Runs before **each** test (fresh state)
- `before`: Runs **once** before all tests (shared state)
- We use `beforeEach` for test isolation

**Nested `beforeEach`**:
```javascript
describe('depositToStrategy()', () => {
    beforeEach(async () => {
        // This runs before each test in this describe block
        await router.registerStrategy(1, mockS1.address, cap);
    });
    
    describe('Success', () => {
        // Parent beforeEach runs first, then this test
        it('deposits correctly', ...);
    });
});
```

---

## Testing Patterns

### Pattern 1: Deployment Tests

**Purpose**: Verify contracts deploy correctly and initialize properly.

**Structure**:
```javascript
describe('Deployment', () => {
    it('returns correct owner', async () => {
        expect(await contract.owner()).to.equal(deployer.address);
    });
    
    it('initializes state correctly', async () => {
        expect(await contract.totalStrategies()).to.equal(0);
    });
});
```

**Why?**: Catches deployment issues early.

### Pattern 2: Success Path Testing

**Purpose**: Verify functions work correctly under normal conditions.

**Structure**:
```javascript
describe('Success', () => {
    it('performs the action correctly', async () => {
        // Arrange
        const amount = ethers.utils.parseUnits('1000', 18);
        
        // Act
        await contract.function(amount);
        
        // Assert
        const result = await contract.getState();
        expect(result).to.equal(expectedValue);
    });
    
    it('emits correct event', async () => {
        await expect(contract.function(amount))
            .to.emit(contract, 'EventName')
            .withArgs(expectedArg1, expectedArg2);
    });
});
```

### Pattern 3: Failure Path Testing

**Purpose**: Verify error handling and edge cases.

**Structure**:
```javascript
describe('Failure', () => {
    it('reverts when condition not met', async () => {
        await expect(
            contract.function(invalidInput)
        ).to.be.reverted;
    });
    
    it('reverts with correct error', async () => {
        await expect(
            contract.function(invalidInput)
        ).to.be.revertedWithCustomError(contract, 'ErrorName');
    });
});
```

**Note**: We use `.reverted` instead of `.revertedWith('ErrorName')` because custom errors don't work with `revertedWith` in Ethers.js v5.

### Pattern 4: State Transition Testing

**Purpose**: Verify state changes correctly.

**Structure**:
```javascript
it('updates state correctly', async () => {
    // Get state before
    const stateBefore = await contract.getState();
    
    // Perform action
    await contract.action();
    
    // Get state after
    const stateAfter = await contract.getState();
    
    // Verify change
    expect(stateAfter).to.equal(stateBefore.add(amount));
});
```

### Pattern 5: Event Testing

**Purpose**: Verify events are emitted with correct values.

**Two Approaches**:

**Approach 1: Using `expect().to.emit()`** (Chai matcher):
```javascript
it('emits event with correct values', async () => {
    await expect(contract.function(amount))
        .to.emit(contract, 'EventName')
        .withArgs(expectedArg1, expectedArg2);
});
```

**Approach 2: Manual event extraction** (More control):
```javascript
it('emits event with correct values', async () => {
    const tx = await contract.function(amount);
    const receipt = await tx.wait();
    
    // Find event in logs
    const event = receipt.events.find(e => e.event === 'EventName');
    
    // Verify event arguments
    expect(event.args.arg1).to.equal(expectedArg1);
    expect(event.args.arg2).to.equal(expectedArg2);
});
```

**When to use each**:
- **Approach 1**: Simpler, good for basic checks
- **Approach 2**: More control, good for complex event verification

---

## JavaScript/Chai/Ethers Specifics

### BigNumber Handling

**The Problem**: JavaScript doesn't handle large integers well. Ethereum uses 256-bit integers.

**Solution**: Ethers.js uses `BigNumber` objects.

**Example**:
```javascript
// ❌ Wrong: JavaScript number overflow
const amount = 1000000000000000000; // Loses precision!

// ✅ Correct: Use BigNumber
const amount = ethers.utils.parseUnits('1000', 18); // 1000 tokens with 18 decimals
// Returns: BigNumber { _hex: '0x...', _isBigNumber: true }
```

**Operations**:
```javascript
const a = ethers.utils.parseUnits('100', 18);
const b = ethers.utils.parseUnits('50', 18);

// Addition
const sum = a.add(b); // NOT a + b!

// Subtraction
const diff = a.sub(b); // NOT a - b!

// Multiplication
const product = a.mul(b); // NOT a * b!

// Division
const quotient = a.div(b); // NOT a / b!

// Comparison
a.gt(b);  // greater than
a.lt(b);  // less than
a.eq(b);  // equal
a.gte(b); // greater than or equal
a.lte(b); // less than or equal
```

**Why?**: JavaScript's `Number` type can only safely represent integers up to `2^53 - 1`. Ethereum uses `uint256` which goes up to `2^256 - 1`.

### Chai Assertions

**Two Styles**: Assert and Expect

**Expect Style** (What we use):
```javascript
expect(value).to.equal(expected);
expect(value).to.be.true;
expect(value).to.be.greaterThan(min);
expect(value).to.be.closeTo(expected, tolerance);
```

**Assert Style** (Alternative):
```javascript
assert.equal(value, expected);
assert.isTrue(value);
assert.isAbove(value, min);
```

**Why Expect?**: More readable, chains better, better error messages.

### Chai Matchers We Use

#### Equality
```javascript
expect(await contract.value()).to.equal(expected);
// For BigNumbers, compares values, not objects
```

#### Boolean
```javascript
expect(await contract.paused()).to.be.true;
expect(await contract.paused()).to.be.false;
```

#### Comparison
```javascript
expect(amount).to.be.greaterThan(min);
expect(amount).to.be.lessThan(max);
expect(amount).to.be.gte(minimum); // greater than or equal
```

#### Approximate Equality
```javascript
expect(actual).to.be.closeTo(expected, tolerance);
// Useful for calculations with rounding errors
```

**Example**:
```javascript
const TOL = ethers.utils.parseUnits('0.01', 18); // 0.01 token tolerance
expect(totalAssets).to.be.closeTo(expected, TOL);
```

**Why `closeTo`?**: Fixed-point arithmetic can have tiny rounding errors. We accept small differences.

#### Reversion
```javascript
await expect(contract.function()).to.be.reverted;
await expect(contract.function()).to.be.revertedWithCustomError(contract, 'ErrorName');
```

**Note**: Custom errors require `revertedWithCustomError`, not `revertedWith`.

#### Events
```javascript
await expect(contract.function())
    .to.emit(contract, 'EventName')
    .withArgs(arg1, arg2);
```

### Ethers.js Specifics

#### Getting Signers
```javascript
accounts = await ethers.getSigners();
deployer = accounts[0];  // First account (usually deployer)
user1 = accounts[1];     // Second account
user2 = accounts[2];      // Third account
```

**Why multiple signers?**: Test different roles (owner, user, attacker).

#### Connecting as Different User
```javascript
// Deployer calls
await contract.function();

// User1 calls
await contract.connect(user1).function();

// User2 calls
await contract.connect(user2).function();
```

**Why?**: Test access control and multi-user scenarios.

#### Parsing Units
```javascript
// Parse human-readable numbers to BigNumber
ethers.utils.parseUnits('1000', 18);  // 1000 tokens with 18 decimals
ethers.utils.parseUnits('1', 6);      // 1 token with 6 decimals (like USDC)

// Helper function (common pattern)
const tokens = (n) => ethers.utils.parseUnits(n.toString(), 'ether');
tokens(1000); // Same as parseUnits('1000', 18)
```

**Why?**: Makes tests more readable. `tokens(1000)` is clearer than `ethers.utils.parseUnits('1000', 18)`.

#### Waiting for Transactions
```javascript
const tx = await contract.function();
await tx.wait(); // Wait for transaction to be mined

// Or in one line
const receipt = await contract.function().then(tx => tx.wait());
```

**Why?**: Need to wait for transaction to be mined before checking state changes.

#### Getting Transaction Receipt
```javascript
const tx = await contract.function();
const receipt = await tx.wait();

// Access receipt properties
receipt.blockNumber;  // Block number
receipt.events;       // Array of events
receipt.gasUsed;      // Gas consumed
```

**Why?**: Extract events, verify block numbers, check gas usage.

---

## Advanced Testing Techniques

### 1. Time Manipulation

**Problem**: Many DeFi contracts are time-dependent (yield accrual, epochs, etc.).

**Solution**: Hardhat Network allows time manipulation.

**Example**:
```javascript
// Advance time by 1 year
await ethers.provider.send("evm_increaseTime", [YEAR]);
await ethers.provider.send("evm_mine", []); // Mine a block to apply time change
```

**Why two commands?**:
- `evm_increaseTime`: Sets the time offset
- `evm_mine`: Mines a block (time only applies when block is mined)

**Use Cases**:
- Testing yield accumulation over time
- Testing fee epoch completion
- Testing time-based access controls

**Example from MockS1 tests**:
```javascript
it('accumulates 5% yield over 1 year', async () => {
    // Deposit
    await mockS1.depositToStrategy(amount);
    
    // Advance time
    await ethers.provider.send("evm_increaseTime", [YEAR]);
    await ethers.provider.send("evm_mine", []);
    
    // Check yield accumulated
    const totalAssets = await mockS1.totalAssets();
    expect(totalAssets).to.be.closeTo(expectedWithYield, TOL);
});
```

### 2. Event Extraction and Verification

**Problem**: Need to verify event arguments, especially when they're calculated dynamically.

**Solution**: Extract events from transaction receipt.

**Example**:
```javascript
it('emits event with correct calculated values', async () => {
    const tx = await contract.function();
    const receipt = await tx.wait();
    
    // Find event
    const event = receipt.events.find(e => e.event === 'EventName');
    
    // Verify arguments
    expect(event.args.amount).to.equal(expectedAmount);
    expect(event.args.timestamp).to.equal(block.timestamp);
});
```

**Why manual extraction?**: 
- More control over verification
- Can verify calculated values
- Can check multiple events in one transaction

### 3. Testing View Functions vs State-Modifying Functions

**Problem**: View functions shouldn't modify state, but they might call functions that do.

**Solution**: Test that view functions don't change storage.

**Example from MockS1**:
```javascript
it('_accrue() and _accrueView() produce same result', async () => {
    // Get state before
    const accumulatorBefore = await mockS1.accumulator();
    
    // Call view function (shouldn't modify state)
    const totalAssetsFromView = await mockS1.totalAssets();
    
    // Verify state didn't change
    const accumulatorAfterView = await mockS1.accumulator();
    expect(accumulatorAfterView).to.equal(accumulatorBefore);
    
    // Trigger state-modifying function
    await mockS1.depositToStrategy(1); // Triggers _accrue()
    
    // Verify results match
    const accumulatorAfterAccrue = await mockS1.accumulator();
    // Both should produce same result
});
```

**Why?**: Ensures `view` functions are truly read-only.

### 4. Testing with Tolerance

**Problem**: Fixed-point arithmetic can have tiny rounding errors.

**Solution**: Use `closeTo` matcher with tolerance.

**Example**:
```javascript
const TOL = ethers.utils.parseUnits('0.01', 18); // 0.01 token tolerance

it('calculates yield correctly', async () => {
    const expected = ethers.utils.parseUnits('1050', 18);
    const actual = await mockS1.totalAssets();
    
    expect(actual).to.be.closeTo(expected, TOL);
});
```

**Why tolerance?**: 
- Integer division can cause rounding
- Time-based calculations might have microsecond differences
- Better than exact equality for financial calculations

### 5. Testing Edge Cases

**Pattern**: Test boundaries and extreme values.

**Examples**:
```javascript
// Zero values
it('handles zero deposit', async () => {
    await expect(contract.deposit(0)).to.be.reverted;
});

// Maximum values
it('handles maximum cap', async () => {
    await contract.deposit(maxCap);
    await expect(contract.deposit(1)).to.be.reverted;
});

// Boundary conditions
it('allows deposit exactly at cap', async () => {
    await contract.deposit(cap); // Should work
});
```

### 6. Testing State Consistency

**Pattern**: Verify invariants hold.

**Example**:
```javascript
it('maintains invariant: totalAssets = principal * accumulator / SCALE', async () => {
    const principal = await mockS1.principal();
    const accumulator = await mockS1.accumulator();
    const totalAssets = await mockS1.totalAssets();
    
    const expected = principal.mul(accumulator).div(SCALE);
    expect(totalAssets).to.be.closeTo(expected, TOL);
});
```

**Why?**: Ensures mathematical consistency across state variables.

---

## Common Patterns and Why

### Pattern 1: Helper Functions

**Example**:
```javascript
const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}
```

**Why?**: 
- Reduces repetition
- Makes tests more readable
- Centralizes unit conversion logic

### Pattern 2: Constants at Top

**Example**:
```javascript
const YEAR = 365 * 24 * 3600;
const SCALE = ethers.utils.parseUnits('1', 18);
const TOL = ethers.utils.parseUnits('0.01', 18);
```

**Why?**: 
- Reusable across tests
- Single source of truth
- Easy to adjust

### Pattern 3: Nested `describe` Blocks

**Example**:
```javascript
describe('depositToStrategy()', () => {
    describe('Success', () => {
        // Success tests
    });
    
    describe('Failure', () => {
        // Failure tests
    });
});
```

**Why?**: 
- Groups related tests
- Clear test organization
- Easy to find specific scenarios

### Pattern 4: Setup in `beforeEach`

**Example**:
```javascript
describe('depositToStrategy()', () => {
    beforeEach(async () => {
        await router.registerStrategy(1, mockS1.address, cap);
        await token.transfer(user1.address, amount);
        await token.connect(user1).approve(router.address, amount);
    });
    
    // Tests can assume setup is done
});
```

**Why?**: 
- DRY (Don't Repeat Yourself)
- Consistent setup
- Tests focus on what they're testing

### Pattern 5: Testing Events Separately

**Example**:
```javascript
it('deposits correctly', async () => {
    // Test the main functionality
});

it('emits correct event', async () => {
    // Test the event separately
});
```

**Why?**: 
- Clear separation of concerns
- Easier to debug
- Can test events independently

---

## Best Practices

### 1. Descriptive Test Names

**Good**:
```javascript
it('deposits to strategy S1 correctly', ...);
it('reverts when strategy is paused', ...);
it('emits CapitalDeposited event with correct values', ...);
```

**Bad**:
```javascript
it('test1', ...);
it('works', ...);
it('deposit', ...);
```

**Why?**: Test names serve as documentation. They should describe expected behavior.

### 2. One Assertion Per Test (When Possible)

**Good**:
```javascript
it('returns correct owner', async () => {
    expect(await contract.owner()).to.equal(deployer.address);
});

it('returns correct asset', async () => {
    expect(await contract.asset()).to.equal(token.address);
});
```

**Acceptable** (when testing related things):
```javascript
it('updates all state variables correctly', async () => {
    expect(await contract.var1()).to.equal(val1);
    expect(await contract.var2()).to.equal(val2);
    expect(await contract.var3()).to.equal(val3);
});
```

**Why?**: Easier to identify which assertion failed.

### 3. Test Independence

**Good**:
```javascript
beforeEach(async () => {
    // Fresh setup for each test
    await setup();
});

it('test1', async () => {
    // Doesn't depend on test2
});

it('test2', async () => {
    // Doesn't depend on test1
});
```

**Bad**:
```javascript
let sharedState;

it('test1', async () => {
    sharedState = await contract.getState();
});

it('test2', async () => {
    // Depends on test1 running first!
    expect(await contract.getState()).to.equal(sharedState);
});
```

**Why?**: Tests should run in any order.

### 4. Use `async/await` Consistently

**Good**:
```javascript
it('deposits correctly', async () => {
    await contract.deposit(amount);
    const balance = await contract.balance();
    expect(balance).to.equal(amount);
});
```

**Avoid** (unless necessary):
```javascript
it('deposits correctly', () => {
    return contract.deposit(amount).then(() => {
        return contract.balance().then(balance => {
            expect(balance).to.equal(amount);
        });
    });
});
```

**Why?**: `async/await` is more readable and easier to debug.

### 5. Clean Up Test Data

**Pattern**: Use fresh contracts for each test.

**Why?**: Prevents test pollution and makes tests predictable.

---

## Interesting Language Features

### 1. JavaScript: Destructuring

**Example**:
```javascript
const [deployer, user1, user2] = await ethers.getSigners();
// Instead of:
// const accounts = await ethers.getSigners();
// const deployer = accounts[0];
// const user1 = accounts[1];
```

**Why?**: More concise, cleaner code.

### 2. JavaScript: Template Literals

**Example**:
```javascript
const amount = ethers.utils.parseUnits(`${1000}`, 18);
// More readable than string concatenation
```

### 3. JavaScript: Arrow Functions

**Example**:
```javascript
const tokens = (n) => ethers.utils.parseUnits(n.toString(), 'ether');
// Concise function definition
```

### 4. Chai: Method Chaining

**Example**:
```javascript
expect(value)
    .to.be.greaterThan(min)
    .and.to.be.lessThan(max);
```

**Why?**: Readable, fluent API.

### 5. Ethers.js: Contract Factories

**Example**:
```javascript
const MockS1 = await ethers.getContractFactory("MockS1");
const instance = await MockS1.deploy(token.address);
```

**Why?**: 
- Type-safe contract interaction
- Compile-time checking
- Better IDE support

### 6. Ethers.js: Contract Connections

**Example**:
```javascript
await contract.connect(user1).function();
// Calls function as user1, not deployer
```

**Why?**: Essential for testing access control and multi-user scenarios.

### 7. Mocha: Async Test Support

**Example**:
```javascript
it('async test', async () => {
    await contract.function();
    // Mocha automatically waits for promise resolution
});
```

**Why?**: Makes async testing natural and easy.

---

## Testing Challenges and Solutions

### Challenge 1: BigNumber Comparisons

**Problem**: Can't use `===` or `==` with BigNumbers.

**Solution**: Use Chai's built-in BigNumber support or `.eq()` method.

```javascript
// ✅ Works: Chai handles BigNumbers
expect(await contract.balance()).to.equal(expected);

// ✅ Also works: Explicit comparison
expect(await contract.balance()).to.equal(expected);
```

### Challenge 2: Custom Errors

**Problem**: Custom errors don't work with `revertedWith`.

**Solution**: Use `reverted` or `revertedWithCustomError`.

```javascript
// ❌ Doesn't work
await expect(contract.function()).to.be.revertedWith('CustomError');

// ✅ Works
await expect(contract.function()).to.be.reverted;

// ✅ Better: Explicit custom error check
await expect(contract.function())
    .to.be.revertedWithCustomError(contract, 'CustomError');
```

### Challenge 3: Time-Dependent Tests

**Problem**: Tests need to advance blockchain time.

**Solution**: Use Hardhat's `evm_increaseTime` and `evm_mine`.

```javascript
await ethers.provider.send("evm_increaseTime", [YEAR]);
await ethers.provider.send("evm_mine", []);
```

### Challenge 4: Event Verification with Calculated Values

**Problem**: Event arguments are calculated, need to verify they're correct.

**Solution**: Calculate expected values, then verify.

```javascript
const expectedGain = totalAssetsBefore.sub(principalBefore);
const tx = await contract.report();
const receipt = await tx.wait();
const event = receipt.events.find(e => e.event === 'Reported');
expect(event.args.gain).to.be.closeTo(expectedGain, TOL);
```

### Challenge 5: Testing View Functions That Call State-Modifying Logic

**Problem**: View functions shouldn't modify state, but might call internal functions that do.

**Solution**: Test that storage doesn't change after calling view function.

```javascript
const accumulatorBefore = await contract.accumulator();
await contract.totalAssets(); // View function
const accumulatorAfter = await contract.accumulator();
expect(accumulatorAfter).to.equal(accumulatorBefore);
```

---

## Test Coverage Strategy

### What We Test

1. **All Public Functions**: Every external/public function has tests
2. **Success Paths**: Normal operation scenarios
3. **Failure Paths**: Error conditions and edge cases
4. **Events**: All events are tested
5. **State Transitions**: Verify state changes correctly
6. **Access Control**: Owner-only functions, role-based access
7. **Edge Cases**: Zero values, maximum values, boundary conditions
8. **Invariants**: Mathematical consistency checks

### What We Don't Test (Yet)

1. **Gas Optimization**: Not a priority for MVP
2. **Fuzzing**: Would require additional tools
3. **Formal Verification**: Advanced technique, not needed for MVP
4. **Integration with Real Protocols**: Using mocks for now

---

## Interesting Testing Insights

### 1. The `view` Function Challenge

**Discovery**: `totalAssets()` is a `view` function but needs to calculate yield. We solved this by creating `_accrueView()` that calculates without modifying state.

**Test Insight**: We test that calling `totalAssets()` doesn't modify storage, ensuring it's truly a view function.

### 2. BigNumber Arithmetic

**Discovery**: JavaScript's number type can't handle Ethereum's large integers. Ethers.js BigNumbers solve this but require method chaining (`.add()`, `.mul()`, etc.).

**Test Insight**: Always use BigNumber methods, never JavaScript operators (`+`, `-`, `*`, `/`).

### 3. Custom Errors vs Revert Strings

**Discovery**: Custom errors are more gas-efficient but harder to test. We use `.reverted` for simplicity.

**Test Insight**: Custom errors require `revertedWithCustomError`, not `revertedWith`.

### 4. Time Manipulation Complexity

**Discovery**: Time changes only apply when a block is mined. Need both `evm_increaseTime` and `evm_mine`.

**Test Insight**: Always mine a block after increasing time.

### 5. Event Extraction Patterns

**Discovery**: Sometimes need to extract events manually to verify calculated values.

**Test Insight**: Two approaches: Chai's `.emit()` for simple checks, manual extraction for complex verification.

---

## Testing Metrics

### Current Coverage

- **MockS1**: ~90%+ coverage
- **StrategyRouter**: ~85%+ coverage
- **Overall**: Comprehensive test suite

### Test Count

- **MockS1**: ~30+ test cases
- **StrategyRouter**: ~50+ test cases
- **Total**: ~80+ test cases

### Test Execution Time

- **MockS1**: ~5-10 seconds
- **StrategyRouter**: ~30-40 seconds
- **Total**: ~40-50 seconds

**Why StrategyRouter takes longer?**: More complex setup, more contracts deployed, more interactions.

---

## Future Testing Improvements

### 1. Property-Based Testing

Use tools like [Echidna](https://github.com/crytic/echidna) or [Foundry's fuzzing](https://book.getfoundry.sh/forge/fuzz-testing) to test invariants.

### 2. Integration Tests

Test end-to-end flows across multiple contracts.

### 3. Gas Profiling

Add gas usage tests to catch regressions.

### 4. Formal Verification

For critical functions, use formal verification tools.

### 5. Test Helpers Library

Create reusable test utilities for common patterns.

---

## Conclusion

Our testing strategy focuses on:
- **Comprehensive coverage** of all functions
- **Clear structure** using Mocha's describe/it
- **Isolation** through beforeEach hooks
- **Both success and failure** paths
- **Event verification** for off-chain integration
- **Time manipulation** for time-dependent logic
- **Tolerance** for floating-point-like calculations

The combination of Mocha, Chai, and Ethers.js provides a powerful testing environment that allows us to test complex DeFi logic reliably and efficiently.

---

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Author**: Juan José Expósito González



