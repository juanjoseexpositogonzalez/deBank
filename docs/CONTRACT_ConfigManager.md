# ConfigManager Contract Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Contract Purpose](#contract-purpose)
3. [Design Pattern: Centralized Configuration](#design-pattern-centralized-configuration)
4. [State Variables](#state-variables)
5. [Canonical Keys Pattern](#canonical-keys-pattern)
6. [Functions Deep Dive](#functions-deep-dive)
7. [Line-by-Line Code Explanation](#line-by-line-code-explanation)
8. [Design Decisions](#design-decisions)
9. [Security Considerations](#security-considerations)

---

## Architecture Overview

The `ConfigManager` contract acts as a **centralized configuration registry** for the entire dBank system. It stores all configurable parameters that control the behavior of the Vault, StrategyRouter, and strategies.

### High-Level Flow

```
Vault4626 → reads config → ConfigManager
StrategyRouter → reads config → ConfigManager
Strategies → read config → ConfigManager
```

### Key Responsibilities

1. **Parameter Storage**: Stores all configurable parameters (caps, fees, durations, etc.)
2. **Boundary Validation**: Enforces maximum/minimum values for safety
3. **Access Control**: Owner-only modifications
4. **Event Emission**: Tracks all configuration changes for off-chain indexing
5. **Role Management**: Stores addresses for different roles (pauser, harvester, allocator)

---

## Contract Purpose

### Why ConfigManager Exists

In complex DeFi systems, configuration parameters are scattered across multiple contracts, making them:
- Hard to update
- Difficult to audit
- Inconsistent across contracts
- Hard to track changes

**ConfigManager solves this** by:
- **Centralizing** all configuration in one place
- **Standardizing** how parameters are stored and updated
- **Validating** all changes with boundary checks
- **Tracking** all changes via events

### Real-World Analogy

Think of it like a **control panel**:
- **Without ConfigManager**: Settings scattered across different devices (hard to manage)
- **With ConfigManager**: All settings in one control panel (easy to manage, monitor, and update)

---

## Design Pattern: Centralized Configuration

### The Pattern

Instead of each contract storing its own configuration:

```solidity
// ❌ Bad: Configuration scattered
contract Vault {
    uint256 public bufferBps = 1200;
    uint256 public feeBps = 2500;
}

contract Router {
    uint256 public slippageBps = 30;
}
```

We centralize it:

```solidity
// ✅ Good: Configuration centralized
contract ConfigManager {
    uint256 public liquidityBufferBps = 1200;
    uint256 public performanceFeeBps = 2500;
    uint8 public maxSlippageBps = 30;
}

contract Vault {
    ConfigManager public configManager;
    function getBufferBps() view returns (uint256) {
        return configManager.liquidityBufferBps();
    }
}
```

### Benefits

1. **Single Source of Truth**: One place to check all config
2. **Easier Updates**: Update once, affects all contracts
3. **Better Auditing**: All changes tracked in one contract
4. **Consistency**: Prevents conflicting configurations
5. **Gas Efficiency**: Contracts can cache values if needed

---

## State Variables

### Canonical Keys (bytes32 Constants)

**What are they?**: Hash-based identifiers for configuration parameters.

**Why bytes32?**: 
- Efficient storage (32 bytes)
- Collision-resistant (using keccak256)
- Can be used as event keys for indexing

**Example**:
```solidity
bytes32 constant private LIQUIDITY_BUFFER_BPS = keccak256("LIQUIDITY_BUFFER_BPS");
```

**How they work**:
- `keccak256("LIQUIDITY_BUFFER_BPS")` produces a unique 32-byte hash
- This hash is used in events to identify which parameter changed
- Off-chain indexers can filter events by these keys

**Categories**:
1. **Numeric Parameters**: BPS values, caps, durations
2. **Addresses**: Fee recipient, oracle, roles
3. **Strategy Caps**: Per-strategy limits
4. **Roles**: Access control addresses

### Boundary Constants

**Purpose**: Define maximum allowed values for safety.

**Examples**:
```solidity
uint16 constant private MAX_LIQUIDITY_BUFFER_BPS = 10_000; // 100%
uint16 constant MAX_SLIPPAGE_BPS = 500; // 5%
uint256 constant MAX_TVL_GLOBAL_CAP = 200000e6; // 200M USDC
```

**Why?**: Prevents setting dangerous values (e.g., 200% buffer, 100% slippage).

### State Variables

#### Numeric Parameters

```solidity
uint16 public liquidityBufferBps = 1200;        // 12% buffer
uint8 public maxSlippageBps = 30;              // 0.3% max slippage
uint256 public tvlGlobalCap = 100000e6;         // 100M USDC cap
uint256 public perTxCap = 5000e6;                // 5M USDC per transaction
uint32 public performanceFeeBps = 2500;          // 25% performance fee
uint8 public epochDuration = 7;                  // 7 days (in days, not seconds!)
uint32 public settlementWindowUTC = 12 * 3600;  // 12:00 UTC (in seconds)
uint256 public strategyCapS1 = 100000e6;        // 100M USDC for S1
uint256 public strategyCapS2 = 50000e6;          // 50M USDC for S2
uint256 public strategyCapS3 = 25000e6;          // 25M USDC for S3
```

**Default Values**: Sensible defaults set at deployment.

#### Address Parameters

```solidity
address public feeRecipient;      // Receives performance fees
address public primaryOracle;     // Price oracle address
address public pauser;             // Can pause contracts
address public harvester;         // Can execute harvests
address public allocator;          // Can allocate capital
```

**Note**: These are set via separate setter functions (not yet implemented in current version).

#### Arrays

```solidity
address[] public allowedVenues;   // Whitelist of DEXs/protocols
```

**Purpose**: Restrict which venues strategies can interact with (security).

---

## Canonical Keys Pattern

### What is `keccak256`?

**`keccak256`** is a cryptographic hash function that:
- Takes any input (string, bytes, etc.)
- Produces a fixed 32-byte output
- Is deterministic (same input → same output)
- Is one-way (can't reverse the hash)

**Example**:
```solidity
keccak256("LIQUIDITY_BUFFER_BPS")
// Returns: 0x1234abcd... (32 bytes)
```

### Why Use Hashed Keys?

**Problem**: We need to identify parameters in events, but strings are expensive.

**Solution**: Use hash of the string as a compact identifier.

**Example**:
```solidity
event ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);

// Emit event with hashed key
emit ConfigUpdated(
    LIQUIDITY_BUFFER_BPS,  // bytes32 hash, not string!
    oldValue,
    newValue
);
```

**Benefits**:
- **Gas Efficient**: bytes32 is cheaper than string in events
- **Indexable**: Can filter events by key
- **Collision Resistant**: Very unlikely two strings hash to same value
- **Standard Practice**: Common pattern in DeFi (see MakerDAO, Compound)

### How Off-Chain Indexers Use Keys

```javascript
// Off-chain indexer listens for events
contract.on("ConfigUpdated", (key, oldValue, newValue) => {
    // Check which parameter changed
    if (key === LIQUIDITY_BUFFER_BPS) {
        // Update buffer configuration
    } else if (key === PERFORMANCE_FEE_BPS) {
        // Update fee configuration
    }
});
```

---

## Functions Deep Dive

### Constructor

```solidity
constructor() {
    owner = msg.sender;
}
```

**Purpose**: Initialize owner to deployer.

**Why no parameters?**: ConfigManager is deployed first, then other contracts reference it.

### Setter Functions Pattern

All setter functions follow the same pattern:

```solidity
function setParameter(uint256 _newValue) external onlyOwner returns(bool success) {
    // 1. Validate boundary
    if(_newValue > MAX_VALUE) revert ConfigManager__OutOfBounds(KEY, _newValue);
    
    // 2. Store old value
    uint256 _oldValue = parameter;
    
    // 3. Update value
    parameter = _newValue;
    
    // 4. Emit event
    emit ConfigUpdated(KEY, _oldValue, _newValue);
    
    // 5. Return success
    return true;
}
```

**Why this pattern?**:
- Consistent structure
- Always validates boundaries
- Always emits events
- Always returns success (for chaining)

### Individual Setter Functions

#### `setLiquidityBufferBps(uint16 _newLiquidityBufferBps)`

**Purpose**: Set the liquidity buffer percentage (in basis points).

**Validation**: `_newLiquidityBufferBps <= 10_000` (100%)

**Default**: 1200 (12%)

**Example**:
```solidity
// Set buffer to 15%
configManager.setLiquidityBufferBps(1500);
```

**Why uint16?**: Basis points range from 0 to 10,000 (fits in uint16).

#### `setMaxSlippageBps(uint8 _newMaxSlippageBps)`

**Purpose**: Set maximum allowed slippage for withdrawals.

**Validation**: `_newMaxSlippageBps <= 500` (5%)

**Default**: 30 (0.3%)

**Example**:
```solidity
// Set max slippage to 1%
configManager.setMaxSlippageBps(100);
```

**Why uint8?**: Slippage is small (0-5%), uint8 is sufficient and gas-efficient.

#### `setTvlGlobalCap(uint256 _newTvlGlobalCap)`

**Purpose**: Set maximum total value locked (TVL) for the entire vault.

**Validation**: `_newTvlGlobalCap <= 200000e6` (200M USDC)

**Default**: 100000e6 (100M USDC)

**Example**:
```solidity
// Set TVL cap to 150M USDC
configManager.setTvlGlobalCap(150000e6);
```

**Why e6?**: USDC has 6 decimals, so `100000e6` = 100,000 USDC.

#### `setPerTxCap(uint256 _newPerTxCap)`

**Purpose**: Set maximum deposit per transaction.

**Validation**: `_newPerTxCap <= tvlGlobalCap` (can't exceed TVL cap)

**Default**: 5000e6 (5M USDC)

**Example**:
```solidity
// Set per-tx cap to 10M USDC
configManager.setPerTxCap(10000e6);
```

**Why this validation?**: Per-tx cap should never exceed total TVL cap.

#### `setPerformanceFeeBps(uint32 _newPerformanceFeeBps)`

**Purpose**: Set performance fee percentage (in basis points).

**Validation**: `_newPerformanceFeeBps <= 50_000` (500%)

**Default**: 2500 (25%)

**Example**:
```solidity
// Set performance fee to 20%
configManager.setPerformanceFeeBps(2000);
```

**Why high max?**: Allows flexibility, but 25% is industry standard.

#### `setEpochDuration(uint8 _newEpochDuration)`

**Purpose**: Set fee epoch duration in days.

**Validation**: `_newEpochDuration <= 30` (30 days)

**Default**: 7 (7 days)

**Example**:
```solidity
// Set epoch to 14 days
configManager.setEpochDuration(14);
```

**Note**: Stored as days, not seconds (for simplicity).

#### `setSettlementWindowUTC(uint32 _newSettlementWindowUTC)`

**Purpose**: Set settlement window time in seconds from midnight UTC.

**Validation**: `_newSettlementWindowUTC <= 86400` (24 hours)

**Default**: 12 * 3600 (12:00 UTC = noon)

**Example**:
```solidity
// Set settlement window to 3:00 AM UTC
configManager.setSettlementWindowUTC(3 * 3600);
```

**Why UTC?**: Standard timezone for DeFi (no daylight saving issues).

#### `setStrategyCapS1/S2/S3(uint256 _newCap)`

**Purpose**: Set maximum capital for each strategy.

**Validation**: `_newCap <= tvlGlobalCap` (can't exceed total TVL)

**Defaults**:
- S1: 100000e6 (100M USDC)
- S2: 50000e6 (50M USDC)
- S3: 25000e6 (25M USDC)

**Example**:
```solidity
// Set S1 cap to 80M USDC
configManager.setStrategyCapS1(80000e6);
```

**Why separate functions?**: Each strategy might have different risk profiles.

#### `setOwner(address _newOwner)`

**Purpose**: Transfer ownership to a new address.

**Validation**: `_newOwner != address(0)`

**Event**: Emits `AddressUpdated` (not `ConfigUpdated`)

**Example**:
```solidity
// Transfer ownership to multi-sig
configManager.setOwner(multiSigAddress);
```

**Security**: Critical function - should use multi-sig in production.

---

## Line-by-Line Code Explanation

### Critical Section: Canonical Keys

```solidity
// Line 22: Define canonical key for liquidity buffer
bytes32 constant private LIQUIDITY_BUFFER_BPS = keccak256("LIQUIDITY_BUFFER_BPS");
```

**What is `keccak256`?**
- Cryptographic hash function (SHA-3 family)
- Takes string input, produces 32-byte hash
- Deterministic: same input → same output
- One-way: can't reverse to get original string

**Why use it?**
- **Gas Efficiency**: bytes32 is cheaper than string in events
- **Indexing**: Off-chain indexers can filter by key
- **Standard Pattern**: Used in MakerDAO, Compound, etc.

**Example**:
```solidity
// Input
"LIQUIDITY_BUFFER_BPS"

// Output (example, actual hash is different)
0x8f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f
```

**See**: This is a standard DeFi pattern. MakerDAO uses similar approach for their configuration.

### Critical Section: Boundary Validation

```solidity
// Line 120: Validate liquidity buffer
if(_newLiquidityBufferBps > MAX_LIQUIDITY_BUFFER_BPS) 
    revert ConfigManager__OutOfBounds(LIQUIDITY_BUFFER_BPS, _newLiquidityBufferBps);
```

**What happens here?**
1. Check if new value exceeds maximum
2. If yes, revert with custom error
3. Error includes key and value for debugging

**Why boundary checks?**
- **Safety**: Prevents setting dangerous values
- **Consistency**: Ensures values are within expected range
- **Documentation**: Max values document system limits

**Example**:
```solidity
// ❌ This would revert
configManager.setLiquidityBufferBps(15000); // 150% > 100% max

// ✅ This works
configManager.setLiquidityBufferBps(1500); // 15% <= 100% max
```

### Critical Section: Event Emission

```solidity
// Lines 126-130: Emit configuration update event
emit ConfigUpdated(
    LIQUIDITY_BUFFER_BPS,        // bytes32 key (hashed)
    _oldLiquidityBufferBps,       // uint256 old value
    _newLiquidityBufferBps        // uint256 new value
);
```

**What is `emit`?**
- Solidity keyword to emit events
- Events are stored in transaction logs
- Can be filtered and indexed off-chain
- Gas-efficient way to log data

**Event Structure**:
- `bytes32 indexed key`: Parameter identifier (indexed for filtering)
- `uint256 oldValue`: Previous value
- `uint256 newValue`: New value

**Why include old value?**
- **Audit Trail**: See what changed
- **Rollback**: Know what to revert to if needed
- **Analytics**: Track configuration history

**Off-Chain Usage**:
```javascript
// Listen for config changes
configManager.on("ConfigUpdated", (key, oldValue, newValue) => {
    console.log(`Config ${key} changed from ${oldValue} to ${newValue}`);
    // Update off-chain systems
});
```

### Critical Section: Return Pattern

```solidity
// Line 132: Return success
return true;
```

**Why return `bool success`?**
- **Chaining**: Allows function chaining (though not used here)
- **Consistency**: All setters return bool
- **Future-proof**: Enables batch operations

**Note**: In Solidity, `return true;` is optional if function signature says `returns(bool)`. But explicit return is clearer.

---

## Design Decisions

### 1. Why Separate Functions Instead of Generic Setter?

**Decision**: Individual functions like `setLiquidityBufferBps()` instead of `set(bytes32 key, uint256 value)`.

**Reasoning**:
- **Type Safety**: Compiler checks parameter types
- **Gas Efficiency**: No need to decode key and route
- **Clarity**: Function name documents what it does
- **IDE Support**: Better autocomplete and documentation

**Trade-off**: More code, but safer and clearer.

### 2. Why bytes32 Keys Instead of Enum?

**Decision**: Use `keccak256("KEY_NAME")` instead of enum.

**Reasoning**:
- **Extensibility**: Easy to add new keys without redeploying
- **Gas Efficiency**: bytes32 is cheaper than enum in events
- **Standard Pattern**: Matches MakerDAO/Compound approach
- **Off-Chain Friendly**: Easier for indexers to work with

**Trade-off**: Less type safety, but more flexible.

### 3. Why Boundary Constants?

**Decision**: Define MAX_* constants for each parameter.

**Reasoning**:
- **Safety**: Prevents dangerous values
- **Documentation**: Documents system limits
- **Consistency**: All parameters have max values
- **Auditability**: Clear what's allowed

**Trade-off**: More constants, but safer system.

### 4. Why Store Old Value Before Update?

**Decision**: Store old value in local variable before updating.

**Reasoning**:
- **Event Emission**: Need old value for event
- **Gas Efficiency**: One storage read vs two
- **Clarity**: Clear what the old value was

**Example**:
```solidity
uint256 _oldValue = parameter;  // Read once
parameter = _newValue;           // Update
emit ConfigUpdated(KEY, _oldValue, _newValue); // Use old value
```

### 5. Why Return `bool success`?

**Decision**: All setters return `bool success`.

**Reasoning**:
- **Consistency**: All functions follow same pattern
- **Future-proof**: Enables batch operations
- **Standard Pattern**: Common in Solidity

**Note**: Currently not used for chaining, but enables future features.

---

## Security Considerations

### 1. Access Control

**Current State**: `onlyOwner` modifier on all setters.

**Risk**: Single point of failure if owner key is compromised.

**Recommendation**: 
- Use multi-sig for owner in production
- Consider timelock for critical changes
- Implement role-based access (pauser, harvester, etc.)

### 2. Boundary Validation

**Current State**: All setters validate boundaries.

**Risk**: Low (boundaries prevent dangerous values).

**Recommendation**: 
- Review boundary values with team
- Consider minimum values (not just maximums)
- Add validation for relationships (e.g., perTxCap <= tvlGlobalCap)

### 3. Event Emission

**Current State**: All changes emit events.

**Risk**: Low (events are for off-chain tracking).

**Recommendation**: 
- Ensure off-chain systems monitor events
- Set up alerts for critical changes
- Archive event history for audits

### 4. Zero Address Checks

**Current State**: Only `setOwner()` checks for zero address.

**Risk**: Medium (other address setters might not check).

**Recommendation**: 
- Add zero address checks to all address setters
- Use modifier: `modifier validAddress(address _addr) { require(_addr != address(0)); _; }`

### 5. Integer Overflow

**Current State**: Solidity 0.8+ has built-in overflow protection.

**Risk**: None (automatic checks).

---

## Gas Optimization Notes

1. **Public Variables**: Direct storage reads (no function call overhead)
2. **Constants**: Stored in bytecode, not storage (free reads)
3. **Events**: Cheaper than storage for logging
4. **Boundary Checks**: Early revert saves gas on invalid inputs

---

## Future Enhancements

1. **Address Setters**: Implement setters for `feeRecipient`, `primaryOracle`, roles
2. **Venue Management**: Add/remove functions for `allowedVenues` array
3. **Batch Updates**: Function to update multiple parameters in one transaction
4. **Timelock**: Add timelock for critical changes
5. **Role-Based Access**: Implement role-based setters (pauser can only set pause-related config)
6. **View Functions**: Add function to get all config in one call
7. **Versioning**: Track config version for upgrade compatibility

---

## Integration with Other Contracts

### How Vault Uses ConfigManager

```solidity
contract Vault4626 {
    ConfigManager public configManager;
    
    function deposit(uint256 assets) external {
        // Read buffer target from config
        uint256 bufferTargetBps = configManager.liquidityBufferBps();
        // Use in deposit logic...
    }
}
```

### How StrategyRouter Uses ConfigManager

```solidity
contract StrategyRouter {
    ConfigManager public configManager;
    
    function depositToStrategy(uint256 _strategyId, uint256 _amount) external {
        // Read strategy cap from config
        uint256 cap = configManager.strategyCapS1(); // or S2, S3
        // Validate against cap...
    }
}
```

**Benefits**:
- Single source of truth
- Easy to update (change once, affects all)
- Consistent values across contracts

---

## Related Documentation

- [StrategyRouter Contract](./CONTRACT_StrategyRouter.md) - Uses ConfigManager for caps
- [dBank Vault Checklist](./CHECKLIST_dBank.md) - References ConfigManager parameters

---

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Author**: Juan José Expósito González



