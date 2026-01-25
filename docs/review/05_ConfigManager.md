# ConfigManager.sol - Technical Documentation

## Overview

`ConfigManager` is the **centralized configuration contract** that stores all protocol parameters. It provides a single source of truth for caps, fees, roles, and other configurable values.

**File**: `contracts/ConfigManager.sol`
**Solidity**: `^0.8.19`
**Pattern**: Registry pattern with bounded setters

---

## Architecture Role

```
┌─────────────────────────────────────────────────────────────────┐
│                      ConfigManager                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Numeric Parameters                                        │  │
│  │ • liquidityBufferBps = 1200 (12%)                        │  │
│  │ • maxSlippageBps = 30 (0.3%)                             │  │
│  │ • tvlGlobalCap = 100000e6                                │  │
│  │ • perTxCap = 5000e6                                      │  │
│  │ • performanceFeeBps = 2500 (25%)                         │  │
│  │ • strategyCapS1/S2/S3                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Role Addresses                                            │  │
│  │ • owner, feeRecipient, pauser, harvester, allocator      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲
        │                    │                    │
    ┌───┴───┐            ┌───┴───┐            ┌───┴───┐
    │ dBank │            │Router │            │ Admin │
    └───────┘            └───────┘            └───────┘
```

---

## Canonical Keys

Configuration values are identified by keccak256 hashes for event logging:

```solidity
bytes32 constant LIQUIDITY_BUFFER_BPS = keccak256("LIQUIDITY_BUFFER_BPS");
bytes32 constant SLIPPAGE_BPS = keccak256("SLIPPAGE_BPS");
bytes32 constant TVL_GLOBAL_CAP = keccak256("TVL_GLOBAL_CAP");
bytes32 constant PER_TX_CAP = keccak256("PER_TX_CAP");
bytes32 constant PERFORMANCE_FEE_BPS = keccak256("PERFORMANCE_FEE_BPS");
bytes32 constant EPOCH_DURATION = keccak256("EPOCH_DURATION");
bytes32 constant SETTLEMENT_WINDOW_UTC = keccak256("SETTLEMENT_WINDOW_UTC");
bytes32 constant FEE_RECIPIENT = keccak256("FEE_RECIPIENT");
bytes32 constant PRIMARY_ORACLE = keccak256("PRIMARY_ORACLE");
bytes32 constant STRATEGY_CAP_S1 = keccak256("STRATEGY_CAP_S1");
// ... etc
```

---

## Boundary Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_LIQUIDITY_BUFFER_BPS` | 10,000 | 100% max |
| `MAX_SLIPPAGE_BPS` | 500 | 5% max slippage |
| `MAX_TVL_GLOBAL_CAP` | 200000e6 | 200K USDC |
| `MAX_PERFORMANCE_FEES` | 50,000 | 500% (unrestricted) |
| `MAX_EPOCH_DURATION` | 30 days | 30 day max |
| `MAX_SETTLEMENT_WINDOW_UTC` | 86400 | 24 hours |

---

## State Variables

### Numeric Parameters

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `liquidityBufferBps` | `uint16` | 1200 | Target buffer as % of TVL |
| `maxSlippageBps` | `uint8` | 30 | Max slippage (0.3%) |
| `tvlGlobalCap` | `uint256` | 100000e6 | Global TVL limit |
| `perTxCap` | `uint256` | 5000e6 | Per-transaction limit |
| `performanceFeeBps` | `uint32` | 2500 | Performance fee (25%) |
| `epochDuration` | `uint8` | 7 | Days between fee crystallization |
| `settlementWindowUTC` | `uint32` | 43200 | 12:00 UTC settlement |
| `strategyCapS1` | `uint256` | 100000e6 | Strategy 1 cap |
| `strategyCapS2` | `uint256` | 50000e6 | Strategy 2 cap |
| `strategyCapS3` | `uint256` | 25000e6 | Strategy 3 cap |

### Address Parameters

| Variable | Type | Description |
|----------|------|-------------|
| `owner` | `address` | Contract owner |
| `feeRecipient` | `address` | Fee receiver |
| `primaryOracle` | `address` | Price oracle |
| `pauser` | `address` | Can pause protocol |
| `harvester` | `address` | Can harvest yield |
| `allocator` | `address` | Can allocate to strategies |

### Arrays

| Variable | Type | Description |
|----------|------|-------------|
| `allowedVenues` | `address[]` | Approved trading venues |

---

## Custom Errors

```solidity
error ConfigManager__NotOwner();
error ConfigManager__OutOfBounds(bytes32 key, uint256 value);
error ConfigManager__zeroAddress(bytes32 key);
```

---

## Events

```solidity
event ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);
event AddressUpdated(bytes32 indexed key, address oldValue, address newValue);
```

---

## Functions

### Numeric Setters

Each setter follows the same pattern:

```solidity
function setLiquidityBufferBps(uint16 _newValue) external onlyOwner returns(bool) {
    // 1. Boundary check
    if (_newValue > MAX_LIQUIDITY_BUFFER_BPS)
        revert ConfigManager__OutOfBounds(LIQUIDITY_BUFFER_BPS, _newValue);

    // 2. Store old value
    uint256 _oldValue = liquidityBufferBps;

    // 3. Update state
    liquidityBufferBps = _newValue;

    // 4. Emit event
    emit ConfigUpdated(LIQUIDITY_BUFFER_BPS, _oldValue, _newValue);

    return true;
}
```

### Available Numeric Setters

| Function | Parameter | Bound |
|----------|-----------|-------|
| `setLiquidityBufferBps` | `uint16` | ≤ 10,000 |
| `setMaxSlippageBps` | `uint8` | ≤ 500 |
| `setTvlGlobalCap` | `uint256` | ≤ 200000e6 |
| `setPerTxCap` | `uint256` | ≤ tvlGlobalCap |
| `setPerformanceFeeBps` | `uint32` | ≤ 50,000 |
| `setEpochDuration` | `uint8` | ≤ 30 |
| `setSettlementWindowUTC` | `uint32` | ≤ 86400 |
| `setStrategyCapS1/S2/S3` | `uint256` | ≤ tvlGlobalCap |

### Address Setters

Each address setter validates against zero address:

```solidity
function setFeeRecipient(address _newAddr) external onlyOwner returns(bool) {
    if (_newAddr == address(0))
        revert ConfigManager__zeroAddress(FEE_RECIPIENT);

    address _oldAddr = feeRecipient;
    feeRecipient = _newAddr;

    emit AddressUpdated(FEE_RECIPIENT, _oldAddr, _newAddr);
    return true;
}
```

### Available Address Setters

| Function | Role |
|----------|------|
| `setOwner` | Contract owner |
| `setFeeRecipient` | Fee receiver |
| `setPrimaryOracle` | Price oracle |
| `setPauser` | Emergency pause role |
| `setHarvester` | Yield harvesting role |
| `setAllocator` | Strategy allocation role |

### Array Management

```solidity
function addAllowedVenue(address _venue) external onlyOwner returns(bool)
```

Adds trading venue to allowlist.

---

## Usage by Other Contracts

### dBank reads:

```solidity
// On deployment
bufferTargetBps = ConfigManager(configManager).liquidityBufferBps();
performanceFeeBps = ConfigManager(configManager).performanceFeeBps();
tvlCap = ConfigManager(configManager).tvlGlobalCap();
perTxCap = ConfigManager(configManager).perTxCap();

// On withdrawal
uint256 maxSlippageBps = ConfigManager(configManager).maxSlippageBps();
```

### StrategyRouter reads:

```solidity
uint256 cap = ConfigManager(configManager).strategyCapS1();
```

---

## Configuration Workflow

### Initial Setup

```javascript
// Deploy
const ConfigManager = await ethers.getContractFactory('ConfigManager');
configManager = await ConfigManager.deploy();

// Configure for production
await configManager.setTvlGlobalCap(ethers.utils.parseUnits("100000", 6));
await configManager.setPerTxCap(ethers.utils.parseUnits("5000", 6));
await configManager.setFeeRecipient(treasuryAddress);
await configManager.setStrategyCapS1(ethers.utils.parseUnits("80000", 6));
```

### Runtime Updates

```javascript
// Increase TVL cap as protocol grows
await configManager.setTvlGlobalCap(ethers.utils.parseUnits("500000", 6));

// Adjust buffer target
await configManager.setLiquidityBufferBps(1500); // 15%
```

---

## Security Considerations

### Access Control
- All setters are `onlyOwner`
- Consider multi-sig for production owner

### Boundary Protection
- All numeric values bounded
- Prevents accidental misconfiguration
- Cannot set perTxCap > tvlGlobalCap

### Zero Address Protection
- All address setters check for zero
- Prevents accidental lock-out

---

## Testing Coverage

See `test/unit/ConfigManager.js` for tests covering:
- Initial values
- All setter functions
- Boundary violations
- Zero address rejections
- Event emissions
- Owner-only access

---

## Future Considerations

1. **Timelock**: Add delay for critical parameter changes
2. **Multi-sig**: Use Gnosis Safe as owner
3. **Governance**: Transition to DAO governance
4. **Per-strategy configs**: More granular strategy settings
