# dBank.sol - Technical Documentation

## Overview

`dBank` is the core vault contract implementing the **ERC-4626 tokenized vault standard**. It accepts USDC deposits, mints `dbUSDC` shares, and coordinates with the StrategyRouter to generate yield.

**File**: `contracts/dBank.sol`
**Solidity**: `^0.8.19`
**Lines**: ~602

---

## State Variables

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `SCALE` | `1e18` | Precision for calculations |
| `MAX_BPS` | `10000` | 100% in basis points |
| `EPOCH_DURATION` | `7 days` | Fee crystallization period |

### Core State

| Variable | Type | Description |
|----------|------|-------------|
| `asset` | `Token` | Underlying asset (USDC) |
| `owner` | `address` | Contract owner |
| `strategyRouter` | `address` | StrategyRouter contract |
| `configManager` | `address` | ConfigManager contract |

### ERC-20 State (Share Token)

| Variable | Type | Description |
|----------|------|-------------|
| `name` | `string` | "dBank USDC Vault" |
| `symbol` | `string` | "dbUSDC" |
| `decimals` | `uint8` | Matches asset decimals |
| `totalSupply` | `uint256` | Total shares minted |
| `balanceOf` | `mapping` | Share balances per address |
| `allowance` | `mapping` | ERC-20 allowances |

### Liquidity Buffer

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `buffer` | `uint256` | 0 | Current buffer amount |
| `bufferTargetBps` | `uint256` | 1200 (12%) | Target buffer as % of TVL |

### Performance Fees

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `performanceFeeBps` | `uint256` | 2500 (25%) | Fee on profits |
| `feeRecipient` | `address` | - | Fee recipient address |
| `lastEpochTimeStamp` | `uint256` | deploy time | Last fee crystallization |
| `highWaterMark` | `uint256` | 1e18 | High-water mark price |

### Safety & Limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `tvlCap` | `uint256` | 100000e6 | Maximum TVL |
| `perTxCap` | `uint256` | 5000e6 | Max per transaction |
| `paused` | `bool` | false | Emergency pause flag |

---

## Custom Errors

```solidity
error dBank__NotOwner();
error dBank__ZeroAddress();
error dBank__Paused();
error dBank__CapExceeded(uint256 requested, uint256 available);
error dBank__InsufficientLiquidity(uint256 requested, uint256 available);
error dBank__SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippageBps);
error dBank__InvalidAmount();
error dBank__InsufficientShares();
error dBank__InvalidReceiver();
error dBank__EpochNotComplete();
error dBank__InsufficientAllowance();
error dBank__InvalidStrategy();
error dBank__AllocationFailed();
```

---

## Events

### ERC-4626 Events

```solidity
event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
```

### ERC-20 Events

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

### Custom Events

```solidity
event BufferUpdated(uint256 oldBuffer, uint256 newBuffer);
event FeesCrystallized(uint256 gain, uint256 feeAmount, uint256 newHighWaterMark, uint256 timestamp);
event ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);
event Paused(bool paused);
event Allocated(uint256 indexed strategyId, uint256 amount, uint256 newBuffer);
event WithdrawnFromStrategy(uint256 indexed strategyId, uint256 amount);
```

---

## Functions

### ERC-4626 View Functions

#### `totalAssets()`
```solidity
function totalAssets() external view returns (uint256)
```
Returns total assets under management: `buffer + StrategyRouter.totalAssets()`

#### `convertToShares(uint256 _assets)`
```solidity
function convertToShares(uint256 _assets) external view returns (uint256 shares)
```
Converts asset amount to share amount using current exchange rate.

**Logic:**
```
if totalSupply == 0:
    shares = assets  (1:1 for first deposit)
else:
    shares = assets * totalSupply / totalAssets
```

#### `convertToAssets(uint256 _shares)`
```solidity
function convertToAssets(uint256 _shares) external view returns (uint256 assets)
```
Converts share amount to asset amount.

**Logic:**
```
if totalSupply == 0:
    assets = 0
else:
    assets = shares * totalAssets / totalSupply
```

#### `pricePerShare()`
```solidity
function pricePerShare() external view returns (uint256)
```
Returns current share price scaled by 1e18.

**Formula**: `totalAssets * 1e18 / totalSupply`

#### `maxDeposit(address)`
```solidity
function maxDeposit(address) external view returns (uint256)
```
Returns minimum of: `(tvlCap - totalAssets)` and `perTxCap`

#### `maxWithdraw(address _owner)`
```solidity
function maxWithdraw(address _owner) external view returns (uint256)
```
Returns `convertToAssets(balanceOf[_owner])`

### ERC-4626 Mutative Functions

#### `deposit(uint256 _assets, address _receiver)`
```solidity
function deposit(uint256 _assets, address _receiver)
    external
    whenNotPaused
    validAddress(_receiver)
    returns (uint256 shares)
```

**Flow:**
1. Validate amount > 0
2. Validate amount ≤ maxDeposit
3. Calculate shares via `convertToShares()`
4. Transfer assets from caller to vault
5. Update buffer
6. Mint shares to receiver
7. Emit `Deposit` event

#### `withdraw(uint256 _assets, address _receiver, address _owner)`
```solidity
function withdraw(uint256 _assets, address _receiver, address _owner)
    external
    whenNotPaused
    validAddress(_receiver)
    validAddress(_owner)
    returns (uint256 shares)
```

**Flow:**
1. Validate amount ≤ maxWithdraw
2. Calculate shares to burn
3. Burn shares from owner
4. **If assets ≤ buffer**: Serve from buffer
5. **If assets > buffer**: Drain buffer, then call `_withdrawFromStrategies()`
6. Transfer assets to receiver
7. Emit `Withdraw` event

#### `redeem(uint256 _shares, address _receiver, address _owner)`
```solidity
function redeem(uint256 _shares, address _receiver, address _owner)
    external
    whenNotPaused
    returns (uint256 assets)
```
Similar to `withdraw()` but input is shares instead of assets.

---

### Strategy Allocation

#### `allocate(uint256 _strategyId, uint256 _amount)`
```solidity
function allocate(uint256 _strategyId, uint256 _amount)
    external
    onlyOwner
    whenNotPaused
    returns (uint256)
```

**Purpose**: Move assets from buffer to a yield strategy.

**Flow:**
1. Validate amount > 0 and amount ≤ buffer
2. Approve router to spend tokens
3. Call `StrategyRouter.depositToStrategy()`
4. Reduce buffer by allocated amount
5. Emit `Allocated` event

#### `_withdrawFromStrategies(uint256 _amount, uint256 _maxSlippageBps)`
```solidity
function _withdrawFromStrategies(uint256 _amount, uint256 _maxSlippageBps)
    internal
    returns (uint256 totalWithdrawn)
```

**Purpose**: Internal function to withdraw from strategies when buffer is insufficient.

**Flow:**
1. Get total strategies from router
2. Iterate through active strategies
3. For each strategy with assets, withdraw up to needed amount
4. Add withdrawn amount to buffer
5. Emit `WithdrawnFromStrategy` for each withdrawal

---

### Fee Crystallization

#### `crystallizeFees()`
```solidity
function crystallizeFees() external onlyOwner
```

**Purpose**: Calculate and mint performance fee shares.

**Requirements:**
- Must be called after epoch duration (7 days)

**Flow:**
1. Check epoch is complete
2. Get current pricePerShare
3. If price > highWaterMark, calculate gain
4. Mint fee shares (25% of gain) to feeRecipient
5. Update highWaterMark
6. Update lastEpochTimeStamp
7. Emit `FeesCrystallized`

---

### Admin Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `setBufferTargetBps` | `uint256` | Set buffer target (max 10000) |
| `setPerformanceFeeBps` | `uint256` | Set fee percentage |
| `setFeeRecipient` | `address` | Set fee recipient |
| `setTvlCap` | `uint256` | Set TVL cap |
| `setPerTxCap` | `uint256` | Set per-tx cap |
| `pause` | `bool` | Emergency pause |

---

## Security Considerations

### Reentrancy Protection
- State changes before external calls
- Buffer updated before transfers

### Access Control
- `onlyOwner` modifier for admin functions
- `whenNotPaused` modifier for user functions

### Slippage Protection
- `_maxSlippageBps` parameter when withdrawing from strategies
- ConfigManager provides default slippage limit

### Integer Overflow
- Solidity 0.8.x built-in overflow protection
- Careful ordering of multiplication before division

---

## Gas Optimization

1. **Immutable variables**: `asset` is immutable
2. **Custom errors**: Use custom errors instead of require strings
3. **Short-circuit evaluation**: Check simpler conditions first
4. **Storage packing**: Related variables grouped together

---

## Testing Coverage

See `test/unit/dBank.js` for comprehensive tests covering:
- Metadata & wiring (13 tests)
- Totals & conversions (7 tests)
- Max & preview functions (13 tests)
- Deposit/buffer policy (11 tests)
- Withdrawal functions (11 tests)
- ERC-20 functions (9 tests)
- Admin config updates (9 tests)
- Fee crystallization (6 tests)
- Strategy allocation (8 tests)
- Strategy withdrawal (4 tests)
- Yield mechanics (5 tests)

**Total: 100 tests**
