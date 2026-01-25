# StrategyRouter Contract Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Contract Purpose](#contract-purpose)
3. [State Variables](#state-variables)
4. [Functions Deep Dive](#functions-deep-dive)
5. [Line-by-Line Code Explanation](#line-by-line-code-explanation)
6. [Design Decisions](#design-decisions)
7. [Security Considerations](#security-considerations)

---

## Architecture Overview

The `StrategyRouter` contract acts as a **middleware layer** between the Vault4626 (dBank) and individual yield-generating strategies (MockS1, MockS2, MockS3). It implements a **registry pattern** where strategies are registered, managed, and routed to.

### High-Level Flow

```
Vault4626 → StrategyRouter → MockS1/MockS2/MockS3
   ↓              ↓                    ↓
Deposits    Routes capital      Generates yield
Withdraws   Aggregates assets    Manages state
```

### Key Responsibilities

1. **Strategy Registry**: Maintains a list of registered strategies with their configurations
2. **Capital Routing**: Distributes deposits from the vault to appropriate strategies
3. **Asset Aggregation**: Sums up `totalAssets()` from all active strategies for the vault
4. **State Management**: Tracks allocated capital, caps, and strategy states (active/paused)
5. **Safety Checks**: Validates strategy state before operations (active, not paused, within caps)

---

## Contract Purpose

### Why StrategyRouter Exists

In DeFi vault architectures, you typically have:

- **Vault**: User-facing contract that accepts deposits and mints shares
- **Strategies**: Individual yield-generating contracts (staking, lending, LP, etc.)
- **Router**: Intermediary that manages multiple strategies

The router pattern provides:

1. **Separation of Concerns**: Vault doesn't need to know strategy implementation details
2. **Flexibility**: Easy to add/remove strategies without modifying the vault
3. **Aggregation**: Single point to query total assets across all strategies
4. **Risk Management**: Centralized cap management and pause controls
5. **Upgradeability**: Can swap strategies without changing vault code

### Real-World Analogy

Think of it like a **mutual fund manager**:
- **Investors** (users) deposit money into the **fund** (Vault)
- The **fund manager** (Router) decides which **investment vehicles** (Strategies) to use
- Each vehicle has different risk/return profiles and capacity limits
- The manager aggregates performance and reports total assets

---

## State Variables

### Constants

```solidity
uint256 private constant SCALE = 1e18;
uint256 private constant MAX_STRATEGIES = 10;
```

- **SCALE**: Used for fixed-point arithmetic (though not heavily used in this contract, kept for consistency)
- **MAX_STRATEGIES**: Maximum number of strategies that can be registered (prevents unbounded loops)

### Core Addresses

```solidity
address public immutable asset;        // USDC token address
address public owner;                  // Contract owner (can register/manage strategies)
address public configManager;          // ConfigManager contract reference
```

- **asset**: Immutable reference to the base token (USDC). Set once in constructor.
- **owner**: Can register strategies, set caps, activate/deactivate strategies
- **configManager**: Reference to configuration contract (for future extensibility)

### Strategy Registry

```solidity
mapping(uint256 => address) public strategies;      // strategyId → strategy address
mapping(address => uint256) public strategyId;      // strategy address → strategyId (0 = not registered)
```

**Why two mappings?**
- `strategies[id]` → Lookup strategy address by ID (used in loops)
- `strategyId[addr]` → Check if address is already registered (prevents duplicates)

### Strategy State

```solidity
mapping(uint256 => bool) public strategyActive;     // Is strategy active?
mapping(uint256 => bool) public strategyPaused;     // Cache of paused state
uint256 public totalStrategies;                     // Counter of registered strategies
```

- **strategyActive**: Owner can activate/deactivate strategies (deactivated strategies excluded from `totalAssets()`)
- **strategyPaused**: Cached paused state (strategies can pause themselves, router caches this)
- **totalStrategies**: Simple counter for tracking (not used in logic, just for queries)

### Limits and Caps

```solidity
mapping(uint256 => uint256) public strategyCap;        // Maximum capital per strategy
mapping(uint256 => uint256) public strategyAllocated;   // Currently allocated capital
```

- **strategyCap**: Maximum amount of capital a strategy can accept (risk management)
- **strategyAllocated**: Tracks how much capital is currently in each strategy (for cap enforcement)

---

## Functions Deep Dive

### View Functions

#### `totalAssets()`

**Purpose**: Aggregate total assets from all active, non-paused strategies.

**Why it's needed**: The Vault4626 needs to know total managed assets to calculate `pricePerShare`.

**Key Implementation Details**:

1. Iterates through all possible strategy IDs (1 to MAX_STRATEGIES)
2. Checks if strategy exists (`address(0)` check)
3. Checks if strategy is active
4. **Calls `paused()` directly** (doesn't use cache in view function - see explanation below)
5. Calls `totalAssets()` on each strategy using low-level calls
6. Sums all values

**Why low-level calls?**: Strategies don't share a common interface. We use `staticcall` to call functions by signature.

#### `getStrategy(uint256 _strategyId)`

Returns all information about a strategy in a single call (gas-efficient for frontends).

#### `availableCapacity(uint256 _strategyId)`

Calculates `cap - allocated` for a strategy. Used to check if deposits are allowed.

---

### Registration Functions

#### `registerStrategy(uint256 _strategyId, address _strategy, uint256 _cap)`

**Purpose**: Register a new strategy with the router.

**Validations**:
1. Strategy address must not be `address(0)`
2. Strategy ID must not already be registered
3. Strategy address must not already be registered (prevents duplicate addresses)
4. Strategy ID must be between 1 and MAX_STRATEGIES

**State Updates**:
- Stores strategy address
- Sets initial cap
- Marks as active by default
- Initializes allocated to 0
- Updates paused cache
- Increments `totalStrategies` counter

**Events**: Emits `StrategyRegistered` for off-chain indexing.

#### `setStrategyActive(uint256 _strategyId, bool _active)`

**Purpose**: Enable/disable a strategy without unregistering it.

**Use Cases**:
- Temporarily disable a strategy (e.g., during upgrades)
- Emergency shutdown of a specific strategy
- Gradual rollout of new strategies

**Effect**: Deactivated strategies are excluded from `totalAssets()` aggregation.

#### `setStrategyCap(uint256 _strategyId, uint256 _newCap)`

**Purpose**: Update the maximum capital a strategy can accept.

**Validation**: New cap must be >= currently allocated capital (can't trap funds).

**Use Cases**:
- Increase cap as strategy proves reliable
- Decrease cap if strategy shows risk
- Adjust based on market conditions

---

### Capital Management Functions

#### `depositToStrategy(uint256 _strategyId, uint256 _amount)`

**Purpose**: Deposit capital from the router to a strategy.

**Flow**:
1. Validate strategy exists and is active
2. Update paused cache and check if paused
3. Validate amount > 0
4. Check if deposit would exceed cap
5. Transfer tokens from `msg.sender` to router
6. **Call strategy's `depositToStrategy()`** using low-level call
7. Update allocated tracking
8. Emit event

**Why transfer to router first?**: Router holds tokens and manages approvals. Strategies (like MockS1) are "virtual" - they don't hold tokens, only track state.

#### `withdrawFromStrategy(uint256 _strategyId, uint256 _amount, uint256 _maxSlippageBps)`

**Purpose**: Withdraw capital from a strategy back to the caller.

**Flow**:
1. Validate strategy exists and is active
2. Update paused cache and check if paused
3. Validate amount > 0
4. **Check available liquidity** by calling strategy's `totalAssets()`
5. **Call strategy's `withdrawFromStrategy()`** to update strategy state
6. Validate slippage (for real strategies, actual amount might differ)
7. Check router has enough balance (tokens stay in router for MockS1)
8. Update allocated tracking
9. Transfer tokens to `msg.sender`
10. Emit event

**Slippage Protection**: For real strategies (not mocks), withdrawals might have slippage. We validate that actual amount received >= `amount * (10000 - maxSlippageBps) / 10000`.

---

## Line-by-Line Code Explanation

### Critical Section: Low-Level Calls (Lines 308-317)

This is the most complex part of the contract. Let's break it down:

```solidity
// Line 307: Get strategy address from mapping
address strategyAddr = strategies[_strategyId];

// Lines 308-310: Call strategy's totalAssets() function
(bool success, bytes memory data) = strategyAddr.staticcall(
    abi.encodeWithSignature("totalAssets()")
);
```

**What is `staticcall`?**
- A low-level Solidity function that calls another contract **without modifying state**
- Returns `(bool success, bytes memory data)`
- `success`: Whether the call succeeded
- `data`: Return value encoded as bytes

**What is `abi.encodeWithSignature`?**
- Encodes a function call into bytes
- Format: `"functionName(type1,type2)"`
- Example: `"totalAssets()"` encodes a call to `totalAssets()` with no parameters

**Why use this instead of interface?**
- Strategies might not share a common interface
- Allows calling any function by signature
- More flexible for different strategy implementations

```solidity
// Line 311: Check if call succeeded
require(success, "Strategy totalAssets call failed");

// Line 312: Decode return value and validate
if (_amount > abi.decode(data, (uint256))) revert StrategyRouter__InsufficientLiquidity();
```

**What is `abi.decode`?**
- Decodes bytes back into Solidity types
- Format: `abi.decode(bytes, (type1, type2, ...))`
- Here: Decodes `data` as `uint256` (the return value of `totalAssets()`)

```solidity
// Lines 315-317: Call strategy's withdrawFromStrategy() function
(success, ) = strategyAddr.call(
    abi.encodeWithSignature("withdrawFromStrategy(uint256)", _amount)
);
```

**What is `call` (vs `staticcall`)?**
- `call`: Can modify state (for state-changing functions)
- `staticcall`: Read-only (for view functions)
- Here we use `call` because `withdrawFromStrategy()` modifies strategy state

**Why ignore return value?**
- `withdrawFromStrategy()` doesn't return a value we need
- We only care if it succeeded (checked with `require`)

**See**: `docs/ANNEX_LowLevelCalls.md` for detailed technical explanation.

---

### Other Critical Sections

#### `totalAssets()` Function (Lines 130-160)

```solidity
function totalAssets() external view returns (uint256) {
    uint256 total = 0;
    
    // Iterate through all possible strategy IDs
    for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
        address strategy = strategies[i];
        if (strategy != address(0) && strategyActive[i]) {
            // Check if paused (call directly, don't use cache)
            (bool pausedSuccess, bytes memory pausedData) = strategy.staticcall(
                abi.encodeWithSignature("paused()")
            );
            bool isPaused = false;
            if (pausedSuccess) {
                isPaused = abi.decode(pausedData, (bool));
            }
            
            if (!isPaused) {
                // Call totalAssets() and add to total
                (bool success, bytes memory data) = strategy.staticcall(
                    abi.encodeWithSignature("totalAssets()")
                );
                if (success) {
                    uint256 assets = abi.decode(data, (uint256));
                    total += assets;
                }
            }
        }
    }
    
    return total;
}
```

**Why check `paused()` directly instead of using cache?**
- This is a `view` function (read-only)
- Cache updates require state changes (not allowed in `view`)
- Must call strategy directly to get current paused state

**Why nested `if` statements?**
- First check: Strategy exists (`address(0)`)
- Second check: Strategy is active
- Third check: Strategy is not paused
- Only then: Call `totalAssets()` and add to total

**Gas Optimization**: Early returns prevent unnecessary calls.

---

#### `_updateStrategyPausedCache()` Function (Lines 368-378)

```solidity
function _updateStrategyPausedCache(uint256 _strategyId) internal {
    address strategy = strategies[_strategyId];
    if (strategy == address(0)) return;
    
    (bool success, bytes memory data) = strategy.staticcall(
        abi.encodeWithSignature("paused()")
    );
    if (success) {
        strategyPaused[_strategyId] = abi.decode(data, (bool));
    }
}
```

**Purpose**: Update the cached paused state before operations.

**Why cache?**
- Reduces gas costs (one call instead of multiple)
- Allows checking paused state in modifiers
- But: Cache can be stale, so we update it before critical operations

**When is it called?**
- Before `depositToStrategy()`
- Before `withdrawFromStrategy()`
- In `strategyNotPaused` modifier
- After registering a new strategy

---

## Design Decisions

### 1. Why Low-Level Calls Instead of Interfaces?

**Decision**: Use `call`/`staticcall` with `abi.encodeWithSignature` instead of interfaces.

**Reasoning**:
- Strategies might have different interfaces
- More flexible for future strategy types
- Allows calling functions without importing strategy contracts

**Trade-off**: Less type safety, but more flexibility.

### 2. Why Cache Paused State?

**Decision**: Cache `paused()` state in a mapping.

**Reasoning**:
- Reduces gas costs (one call vs multiple)
- Allows use in modifiers

**Trade-off**: Cache can be stale, so we update before operations.

### 3. Why Two Mappings for Strategies?

**Decision**: Both `strategies[id]` and `strategyId[addr]` mappings.

**Reasoning**:
- `strategies[id]`: Fast lookup by ID (used in loops)
- `strategyId[addr]`: Fast duplicate check (used in registration)

**Trade-off**: Extra storage, but better performance.

### 4. Why MAX_STRATEGIES Limit?

**Decision**: Limit to 10 strategies maximum.

**Reasoning**:
- Prevents unbounded loops (gas limit protection)
- Reasonable limit for MVP
- Can be increased later if needed

**Trade-off**: Less flexible, but safer.

### 5. Why Router Holds Tokens?

**Decision**: Router receives tokens from vault, strategies are "virtual".

**Reasoning**:
- MockS1 doesn't handle tokens, only tracks state
- Router manages token transfers
- Simpler for MVP (can change later)

**Trade-off**: Router becomes token holder, but simpler strategy logic.

---

## Security Considerations

### 1. Reentrancy Protection

**Current State**: No explicit reentrancy guard.

**Risk**: Low (no external calls before state updates in most functions).

**Recommendation**: Add `ReentrancyGuard` for `depositToStrategy` and `withdrawFromStrategy` if strategies become more complex.

### 2. Access Control

**Current State**: `onlyOwner` modifier for admin functions.

**Risk**: Low (only owner can register/manage strategies).

**Recommendation**: Consider multi-sig for owner in production.

### 3. Integer Overflow

**Current State**: Solidity 0.8+ has built-in overflow protection.

**Risk**: None (automatic checks).

### 4. Strategy Validation

**Current State**: Validates strategy exists, is active, not paused.

**Risk**: Medium (malicious strategy could revert or return wrong values).

**Recommendation**: 
- Whitelist strategy addresses
- Add strategy interface validation
- Consider strategy registry with verified strategies

### 5. Slippage Protection

**Current State**: Validates slippage in `withdrawFromStrategy`.

**Risk**: Low for MockS1 (no real slippage), but important for real strategies.

**Recommendation**: Keep slippage validation for production strategies.

---

## Gas Optimization Notes

1. **Caching**: Paused state is cached to reduce calls
2. **Early Returns**: Functions return early on validation failures
3. **Bounded Loops**: MAX_STRATEGIES limits loop iterations
4. **Storage Packing**: Consider packing bools into single storage slot (future optimization)

---

## Future Enhancements

1. **Strategy Interface**: Define common interface for strategies
2. **Batch Operations**: Add batch deposit/withdraw functions
3. **Strategy Weights**: Add allocation weights for automatic distribution
4. **Emergency Withdraw**: Add function to withdraw all capital from a strategy
5. **Strategy Upgrades**: Add function to replace strategy address (for upgrades)

---

## Related Documentation

- [ANNEX_LowLevelCalls.md](./ANNEX_LowLevelCalls.md) - Deep dive into low-level calls
- [CHECKLIST_StrategyRouter.md](./CHECKLIST_StrategyRouter.md) - Implementation checklist

---

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Author**: Juan José Expósito González

