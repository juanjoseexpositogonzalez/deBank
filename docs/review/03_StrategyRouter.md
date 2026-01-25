# StrategyRouter.sol - Technical Documentation

## Overview

`StrategyRouter` is the **strategy orchestration layer** that manages multiple yield strategies. It handles registration, allocation, and withdrawal from strategies while enforcing caps and slippage limits.

**File**: `contracts/StrategyRouter.sol`
**Solidity**: `^0.8.19`

---

## Architecture Role

```
┌─────────────┐
│   dBank     │
│   (Vault)   │
└──────┬──────┘
       │ allocate() / withdrawFromStrategies()
       ▼
┌──────────────────────────────────────────┐
│           StrategyRouter                 │
│  ┌─────────────────────────────────────┐ │
│  │  Strategy Registry                  │ │
│  │  • ID 1 → MockS1 (active, cap)     │ │
│  │  • ID 2 → Strategy2 (inactive)     │ │
│  │  • ID 3 → Strategy3 (active, cap)  │ │
│  └─────────────────────────────────────┘ │
└──────────────────┬───────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
   MockS1     Strategy2    Strategy3
```

---

## State Variables

### Core State

| Variable | Type | Description |
|----------|------|-------------|
| `asset` | `Token` | Underlying asset (USDC) |
| `configManager` | `address` | ConfigManager reference |
| `owner` | `address` | Contract owner |

### Strategy Registry

```solidity
struct Strategy {
    address strategyAddress;    // Contract address
    bool isActive;              // Can receive deposits
    uint256 cap;                // Maximum allocation
    uint256 totalDeposited;     // Tracking deposits
}

mapping(uint256 => Strategy) public strategies;
uint256 public totalStrategies;
```

---

## Custom Errors

```solidity
error StrategyRouter__NotOwner();
error StrategyRouter__InvalidStrategy();
error StrategyRouter__StrategyNotActive();
error StrategyRouter__CapExceeded(uint256 requested, uint256 available);
error StrategyRouter__SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippageBps);
error StrategyRouter__InsufficientBalance();
error StrategyRouter__TransferFailed();
```

---

## Events

```solidity
event StrategyRegistered(uint256 indexed strategyId, address strategyAddress, uint256 cap);
event StrategyUpdated(uint256 indexed strategyId, bool isActive, uint256 newCap);
event DepositedToStrategy(uint256 indexed strategyId, uint256 amount, uint256 totalAfter);
event WithdrawnFromStrategy(uint256 indexed strategyId, uint256 amount, uint256 totalAfter);
```

---

## Functions

### View Functions

#### `totalAssets()`
```solidity
function totalAssets() external view returns (uint256 total)
```

**Purpose**: Calculate total assets across all strategies.

**Logic:**
```solidity
for each registered strategy:
    if strategy.strategyAddress != address(0):
        total += Strategy(addr).totalAssets()
```

#### `getStrategy(uint256 _strategyId)`
```solidity
function getStrategy(uint256 _strategyId) external view returns (
    address strategyAddress,
    bool isActive,
    uint256 cap,
    uint256 totalDeposited
)
```

Returns strategy details by ID.

#### `getStrategyAssets(uint256 _strategyId)`
```solidity
function getStrategyAssets(uint256 _strategyId) external view returns (uint256)
```

Returns `totalAssets()` from specific strategy contract.

---

### Strategy Management (Admin)

#### `registerStrategy(uint256 _strategyId, address _strategyAddress, uint256 _cap)`
```solidity
function registerStrategy(
    uint256 _strategyId,
    address _strategyAddress,
    uint256 _cap
) external onlyOwner
```

**Purpose**: Add a new strategy to the registry.

**Requirements:**
- Strategy ID must not exist
- Address must not be zero
- Cap must be positive

**Flow:**
1. Validate inputs
2. Create Strategy struct
3. Increment `totalStrategies`
4. Emit `StrategyRegistered`

#### `updateStrategy(uint256 _strategyId, bool _isActive, uint256 _newCap)`
```solidity
function updateStrategy(
    uint256 _strategyId,
    bool _isActive,
    uint256 _newCap
) external onlyOwner
```

**Purpose**: Modify existing strategy settings.

**Use Cases:**
- Deactivate strategy before migration
- Increase/decrease allocation cap
- Reactivate after maintenance

---

### Deposit/Withdraw Operations

#### `depositToStrategy(uint256 _strategyId, uint256 _amount)`
```solidity
function depositToStrategy(uint256 _strategyId, uint256 _amount)
    external
    returns (uint256 deposited)
```

**Purpose**: Deposit assets to a specific strategy.

**Flow:**
1. Validate strategy exists and is active
2. Check amount doesn't exceed cap
3. Transfer tokens from caller to router
4. Approve strategy to spend tokens
5. Call `strategy.depositToStrategy(_amount)`
6. Update `totalDeposited` tracking
7. Emit `DepositedToStrategy`

**Note**: Caller (dBank) must approve router first.

#### `withdrawFromStrategy(uint256 _strategyId, uint256 _amount, uint256 _maxSlippageBps)`
```solidity
function withdrawFromStrategy(
    uint256 _strategyId,
    uint256 _amount,
    uint256 _maxSlippageBps
) external returns (uint256 withdrawn)
```

**Purpose**: Withdraw assets from a strategy with slippage protection.

**Flow:**
1. Validate strategy exists
2. Get strategy's current `totalAssets()`
3. Cap withdrawal at available assets
4. Call `strategy.withdrawFromStrategy(_amount)`
5. Verify actual received ≥ minimum (slippage check)
6. Transfer tokens to caller
7. Update `totalDeposited` tracking
8. Emit `WithdrawnFromStrategy`

**Slippage Protection:**
```solidity
uint256 minAmount = (_amount * (10000 - _maxSlippageBps)) / 10000;
if (actualAmount < minAmount) {
    revert StrategyRouter__SlippageExceeded(_amount, actualAmount, _maxSlippageBps);
}
```

---

## Strategy Interface

Strategies must implement:

```solidity
interface IStrategy {
    function totalAssets() external view returns (uint256);
    function depositToStrategy(uint256 amount) external;
    function withdrawFromStrategy(uint256 amount) external;
}
```

---

## Security Considerations

### Access Control
- `onlyOwner` for registration and updates
- Any address can call deposit/withdraw (designed for dBank)

### Slippage Protection
- Configurable max slippage per withdrawal
- Reverts if actual < expected - slippage

### Strategy Validation
- Cannot deposit to inactive strategy
- Cannot exceed strategy cap
- Zero address checks on registration

### Reentrancy
- State updated before external calls
- Token transfers after state changes

---

## Gas Considerations

1. **Strategy iteration**: `totalAssets()` loops through all strategies
   - Consider caching for large strategy counts

2. **External calls**: Each strategy call is expensive
   - Batch operations where possible

---

## Testing Coverage

See `test/unit/StrategyRouter.js` for tests covering:
- Strategy registration
- Strategy updates (active/inactive, cap changes)
- Deposit to strategy
- Withdrawal with slippage
- Cap enforcement
- Error conditions

---

## Integration with dBank

```solidity
// In dBank.allocate():
asset.approve(strategyRouter, _amount);
uint256 allocated = StrategyRouter(strategyRouter).depositToStrategy(_strategyId, _amount);

// In dBank._withdrawFromStrategies():
uint256 withdrawn = router.withdrawFromStrategy(i, toWithdraw, _maxSlippageBps);
```
