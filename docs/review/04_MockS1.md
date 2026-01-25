# MockS1.sol - Technical Documentation

## Overview

`MockS1` is a **mock yield strategy** that simulates linear yield accrual for testing and development purposes. It implements a simple APR-based yield model where principal grows over time.

**File**: `contracts/MockS1.sol`
**Solidity**: `^0.8.19`
**Purpose**: Testing yield mechanics without external protocol dependencies

---

## Yield Model

### Linear APR Accumulator

```
totalAssets = principal × accumulator / SCALE

where:
- accumulator starts at 1e18 (SCALE)
- accumulator grows linearly based on APR and time elapsed
```

### Example

```
Initial:
- principal = 10,000 USDC
- aprBps = 500 (5%)
- accumulator = 1e18

After 1 year:
- accumulator = 1e18 + (500 × 1e18 / 10000) = 1.05e18
- totalAssets = 10,000 × 1.05e18 / 1e18 = 10,500 USDC
```

---

## State Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `token` | `Token` | - | Underlying asset |
| `principal` | `uint256` | 0 | Deposited amount |
| `accumulator` | `uint256` | 1e18 | Yield growth factor |
| `aprBps` | `int256` | 0 | APR in basis points (can be negative) |
| `lastAccrualTs` | `uint256` | 0 | Last accrual timestamp |
| `cap` | `uint256` | 0 | Maximum principal |
| `paused` | `bool` | false | Safety pause |
| `owner` | `address` | deployer | Contract owner |

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `SCALE` | `1e18` | Precision for accumulator |
| `YEAR` | `365 * 24 * 3600` | Seconds in a year |

---

## Custom Errors

```solidity
error MockS1__Paused();
error MockS1__CapExceeded();
error MockS1__InsufficientBalance();
```

---

## Events

```solidity
event S1Deposited(uint256 amount, uint256 principalAfter, uint256 totalAssetsAfter, uint256 timestamp);
event S1Withdrawn(uint256 amount, uint256 principalAfter, uint256 totalAssetsAfter, uint256 timestamp);
event S1Reported(uint256 gain, uint256 newPrincipal, uint256 timestamp);
event S1ParamsUpdated(int256 aprBps, uint256 cap);
event S1Paused(bool paused);
```

---

## Functions

### View Functions

#### `totalAssets()`
```solidity
function totalAssets() public view returns (uint256)
```

**Purpose**: Calculate current value including accrued yield.

**Implementation:**
```solidity
uint256 accumulatorValue = _accrueView();
return (principal * accumulatorValue / SCALE);
```

#### `params()`
```solidity
function params() view external returns (int256, uint256, bool, uint256)
```

Returns `(aprBps, cap, paused, principal)`

---

### Deposit/Withdraw

#### `depositToStrategy(uint256 _amount)`
```solidity
function depositToStrategy(uint256 _amount) external
```

**Flow:**
1. Check not paused
2. Call `_accrue()` to update accumulator
3. Verify `principal + _amount ≤ cap`
4. Add to principal
5. Emit `S1Deposited`

**Note**: Tokens must be transferred to strategy before calling (handled by StrategyRouter).

#### `withdrawFromStrategy(uint256 _amount)`
```solidity
function withdrawFromStrategy(uint256 _amount) external
```

**Flow:**
1. Check not paused
2. Call `_accrue()` to update accumulator
3. Calculate current totalAssets
4. Verify `_amount ≤ totalAssets`
5. Calculate principal to reduce: `principalToReduce = amount × SCALE / accumulator`
6. Reduce principal
7. Emit `S1Withdrawn`

**Note**: This doesn't transfer tokens - StrategyRouter handles that.

---

### Yield Accrual

#### `_accrue()` (internal)
```solidity
function _accrue() internal
```

**Purpose**: Update accumulator based on time elapsed and APR.

**Logic:**
```solidity
// 1. First use - initialize
if (lastAccrualTs == 0) {
    lastAccrualTs = block.timestamp;
    accumulator = SCALE;
    return;
}

// 2. Calculate time delta
uint256 dt = block.timestamp - lastAccrualTs;
if (dt == 0) return;

// 3. Skip if no APR or no principal
if (aprBps == 0 || principal == 0) {
    lastAccrualTs = block.timestamp;
    return;
}

// 4. Calculate rate per second
uint256 ratePerSecondScaled = absApr * SCALE / (10_000 * YEAR);

// 5. Calculate delta
uint256 deltaScaled = ratePerSecondScaled * dt;

// 6. Update accumulator (handles positive/negative APR)
if (aprBps > 0) {
    accumulator = accumulator * (SCALE + deltaScaled) / SCALE;
} else {
    accumulator = accumulator * (SCALE - deltaScaled) / SCALE;
}

lastAccrualTs = block.timestamp;
```

#### `_accrueView()` (internal view)
```solidity
function _accrueView() internal view returns (uint256)
```

Same logic as `_accrue()` but doesn't modify state - used by `totalAssets()`.

---

### Reporting

#### `report()`
```solidity
function report() external onlyOwner
```

**Purpose**: Crystallize accrued yield into principal.

**Use Case**: Converting unrealized gains to realized gains for accounting.

**Flow:**
1. Verify not paused, has principal, has APR
2. Call `_accrue()`
3. Calculate gain: `gain = totalAssets - principal`
4. Update principal to include gain
5. Reset accumulator to SCALE
6. Emit `S1Reported`

---

### Admin Functions

#### `setParams(int256 _newAprBps, uint256 _newCap)`
```solidity
function setParams(int256 _newAprBps, uint256 _newCap) external onlyOwner
```

**Parameters:**
- `_newAprBps`: New APR (500 = 5%, -200 = -2%)
- `_newCap`: Maximum principal allowed

#### `pause(bool _paused)`
```solidity
function pause(bool _paused) external onlyOwner
```

Emergency pause for deposits/withdrawals.

---

## Yield Calculation Example

```
Scenario: 10,000 USDC at 5% APR for 6 months

Initial State:
- principal = 10,000e18
- accumulator = 1e18
- aprBps = 500

After 6 months (182.5 days = 15,768,000 seconds):
- ratePerSecond = 500 × 1e18 / (10000 × 31,536,000) = 1,585,489,599 per second
- delta = 1,585,489,599 × 15,768,000 = 2.5e16 (approx 0.025e18)
- new accumulator = 1e18 × (1e18 + 2.5e16) / 1e18 = 1.025e18
- totalAssets = 10,000e18 × 1.025e18 / 1e18 = 10,250e18 (10,250 USDC)

Yield: 250 USDC (2.5% for 6 months)
```

---

## Negative APR (Loss Simulation)

MockS1 supports negative APR to simulate losses:

```solidity
// Set -5% APR (loss scenario)
await mockS1.setParams(-500, cap);

// After 1 year:
// accumulator = 1e18 - (500 × 1e18 / 10000) = 0.95e18
// totalAssets = 10,000 × 0.95 = 9,500 USDC
```

This is useful for testing:
- High-water mark fee protection
- Loss scenarios in the vault

---

## Integration with StrategyRouter

```solidity
// StrategyRouter.depositToStrategy():
token.transferFrom(caller, address(this), _amount);
token.approve(strategyAddress, _amount);
strategy.depositToStrategy(_amount);

// StrategyRouter.withdrawFromStrategy():
strategy.withdrawFromStrategy(_amount);
// Note: MockS1 doesn't transfer - real strategies would
token.transfer(caller, actualAmount);
```

**Important**: MockS1 tracks principal but doesn't hold actual tokens. In a real implementation, the strategy would manage token transfers. For testing, StrategyRouter holds the tokens.

---

## Testing Usage

```javascript
// Deploy
const MockS1 = await ethers.getContractFactory('MockS1');
mockS1 = await MockS1.deploy(token.address);

// Configure
await mockS1.setParams(500, tokens(1000000)); // 5% APR, 1M cap

// Simulate yield by advancing time
await ethers.provider.send("evm_increaseTime", [365 * 24 * 3600]); // 1 year
await ethers.provider.send("evm_mine", []);

// Check yield
const totalAssets = await mockS1.totalAssets();
// totalAssets > principal due to yield
```
