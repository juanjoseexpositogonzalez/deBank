# ConfigManager Implementation Checklist

## Contract Description

**ConfigManager** is a centralized configuration management contract that stores all configurable parameters for the dBank system. It provides a single source of truth for vault settings, strategy caps, fees, and access control addresses.

**Metaphor:** It's like a "control panel" where all system settings are stored and can be adjusted by the owner, with all changes tracked and validated.

---

## 📋 Implementation Checklist

### 🔧 **Constants**

#### Canonical Keys (bytes32)
- [X] `LIQUIDITY_BUFFER_BPS` - Key for liquidity buffer percentage
- [X] `SLIPPAGE_BPS` - Key for maximum slippage
- [X] `TVL_GLOBAL_CAP` - Key for total value locked cap
- [X] `PER_TX_CAP` - Key for per-transaction cap
- [X] `PERFORMANCE_FEE_BPS` - Key for performance fee
- [X] `EPOCH_DURATION` - Key for fee epoch duration
- [X] `SETTLEMENT_WINDOW_UTC` - Key for settlement window time
- [X] `FEE_RECIPIENT` - Key for fee recipient address
- [X] `PRIMARY_ORACLE` - Key for oracle address
- [X] `STRATEGY_CAP_S1` - Key for Strategy 1 cap
- [X] `STRATEGY_CAP_S2` - Key for Strategy 2 cap
- [X] `STRATEGY_CAP_S3` - Key for Strategy 3 cap
- [X] `OWNER` - Key for owner address
- [X] `ROLE_PAUSER` - Key for pauser role
- [X] `ROLE_HARVESTER` - Key for harvester role
- [X] `ROLE_ALLOCATOR` - Key for allocator role

#### Boundary Constants
- [X] `MAX_LIQUIDITY_BUFFER_BPS` (10_000) - Maximum buffer percentage
- [X] `MAX_SLIPPAGE_BPS` (500) - Maximum slippage percentage
- [X] `MAX_TVL_GLOBAL_CAP` (200000e6) - Maximum TVL cap
- [X] `MAX_PERFORMANCE_FEES` (50_000) - Maximum performance fee
- [X] `MAX_EPOCH_DURATION` (30 days) - Maximum epoch duration
- [X] `MAX_SETTLEMENT_WINDOW_UTC` (86400) - Maximum settlement window

---

### 📦 **State Variables**

#### Numeric Parameters
- [X] `address public owner` - Contract owner
- [X] `uint16 public liquidityBufferBps` - Liquidity buffer percentage (default: 1200 = 12%)
- [X] `uint8 public maxSlippageBps` - Maximum slippage (default: 30 = 0.3%)
- [X] `uint256 public tvlGlobalCap` - Total value locked cap (default: 100000e6)
- [X] `uint256 public perTxCap` - Per-transaction cap (default: 5000e6)
- [X] `uint32 public performanceFeeBps` - Performance fee (default: 2500 = 25%)
- [X] `uint8 public epochDuration` - Epoch duration in days (default: 7)
- [X] `uint32 public settlementWindowUTC` - Settlement window UTC time (default: 12 * 3600)
- [X] `uint256 public strategyCapS1` - Strategy 1 cap (default: 100000e6)
- [X] `uint256 public strategyCapS2` - Strategy 2 cap (default: 50000e6)
- [X] `uint256 public strategyCapS3` - Strategy 3 cap (default: 25000e6)

#### Address Parameters
- [X] `address public feeRecipient` - Fee recipient address
- [X] `address public primaryOracle` - Primary oracle address
- [X] `address public pauser` - Pauser role address
- [X] `address public harvester` - Harvester role address
- [X] `address public allocator` - Allocator role address

#### Arrays
- [X] `address[] public allowedVenues` - Whitelist of allowed DEXs/protocols

---

### ⚠️ **Custom Errors**

- [X] `ConfigManager__NotOwner()` - When caller is not owner
- [X] `ConfigManager__OutOfBounds(bytes32 key, uint256 value)` - Value exceeds maximum
- [X] `ConfigManager__zeroAddress(bytes32 key)` - Invalid zero address

---

### 🎯 **Events**

- [X] `ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue)` - Numeric config updated
- [X] `AddressUpdated(bytes32 indexed key, address oldValue, address newValue)` - Address config updated

---

### 🔒 **Modifiers**

- [X] `onlyOwner` - Only owner can execute

---

### 🏗️ **Constructor**

- [X] Parameters: None
- [X] Initialization:
  - [X] `owner = msg.sender`

---

### 👁️ **View Functions**

**Note**: Currently, all state variables are `public`, so Solidity automatically generates getter functions. No explicit view functions needed.

**Future Enhancement**: Add `getAllConfig()` function to return all config in one call.

---

### 🔄 **External Functions - Setters**

#### Owner Management
- [X] `setOwner(address _newOwner) external onlyOwner returns(bool)`
  - [X] Validate `_newOwner != address(0)`
  - [X] Store old owner
  - [X] Update owner
  - [X] Emit `AddressUpdated` event
  - [X] Return true

#### Numeric Parameter Setters
- [X] `setLiquidityBufferBps(uint16 _newLiquidityBufferBps) external onlyOwner returns(bool)`
  - [X] Validate `_newLiquidityBufferBps <= MAX_LIQUIDITY_BUFFER_BPS`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setMaxSlippageBps(uint8 _newMaxSlippageBps) external onlyOwner returns(bool)`
  - [X] Validate `_newMaxSlippageBps <= MAX_SLIPPAGE_BPS`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setTvlGlobalCap(uint256 _newTvlGlobalCap) external onlyOwner returns(bool)`
  - [X] Validate `_newTvlGlobalCap <= MAX_TVL_GLOBAL_CAP`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setPerTxCap(uint256 _newPerTxCap) external onlyOwner returns(bool)`
  - [X] Validate `_newPerTxCap <= tvlGlobalCap`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setPerformanceFeeBps(uint32 _newPerformanceFeeBps) external onlyOwner returns(bool)`
  - [X] Validate `_newPerformanceFeeBps <= MAX_PERFORMANCE_FEES`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setEpochDuration(uint8 _newEpochDuration) external onlyOwner returns(bool)`
  - [X] Validate `_newEpochDuration <= MAX_EPOCH_DURATION`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setSettlementWindowUTC(uint32 _newSettlementWindowUTC) external onlyOwner returns(bool)`
  - [X] Validate `_newSettlementWindowUTC <= MAX_SETTLEMENT_WINDOW_UTC`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

#### Strategy Cap Setters
- [X] `setStrategyCapS1(uint256 _newStrategyCapS1) external onlyOwner returns(bool)`
  - [X] Validate `_newStrategyCapS1 <= tvlGlobalCap`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setStrategyCapS2(uint256 _newStrategyCapS2) external onlyOwner returns(bool)`
  - [X] Validate `_newStrategyCapS2 <= tvlGlobalCap`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

- [X] `setStrategyCapS3(uint256 _newStrategyCapS3) external onlyOwner returns(bool)`
  - [X] Validate `_newStrategyCapS3 <= tvlGlobalCap`
  - [X] Store old value
  - [X] Update value
  - [X] Emit `ConfigUpdated` event
  - [X] Return true

#### Address Setters (Not Yet Implemented)
- [ ] `setFeeRecipient(address _newFeeRecipient) external onlyOwner returns(bool)`
- [ ] `setPrimaryOracle(address _newOracle) external onlyOwner returns(bool)`
- [ ] `setPauser(address _newPauser) external onlyOwner returns(bool)`
- [ ] `setHarvester(address _newHarvester) external onlyOwner returns(bool)`
- [ ] `setAllocator(address _newAllocator) external onlyOwner returns(bool)`

#### Venue Management (Not Yet Implemented)
- [ ] `addAllowedVenue(address _venue) external onlyOwner returns(bool)`
- [ ] `removeAllowedVenue(address _venue) external onlyOwner returns(bool)`
- [ ] `isVenueAllowed(address _venue) external view returns(bool)`

---

### 🔍 **Internal Functions**

**Note**: Currently no internal functions. All logic is in setters.

**Future Enhancement**: Add internal validation helpers.

---

### 🧪 **Tests to Implement**

#### Suite: Deployment
- [X] `returns correct owner`
- [X] `initializes default values correctly`
- [X] `liquidityBufferBps defaults to 1200`
- [X] `maxSlippageBps defaults to 30`
- [X] `tvlGlobalCap defaults to 100000e6`
- [X] `performanceFeeBps defaults to 2500`

#### Suite: setLiquidityBufferBps()
- [X] `sets liquidity buffer correctly`
- [X] `reverts when exceeds MAX_LIQUIDITY_BUFFER_BPS`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`
- [X] `event includes correct key and values`

#### Suite: setMaxSlippageBps()
- [X] `sets max slippage correctly`
- [X] `reverts when exceeds MAX_SLIPPAGE_BPS`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setTvlGlobalCap()
- [X] `sets TVL cap correctly`
- [X] `reverts when exceeds MAX_TVL_GLOBAL_CAP`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setPerTxCap()
- [X] `sets per-tx cap correctly`
- [X] `reverts when exceeds tvlGlobalCap`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setPerformanceFeeBps()
- [X] `sets performance fee correctly`
- [X] `reverts when exceeds MAX_PERFORMANCE_FEES`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setEpochDuration()
- [X] `sets epoch duration correctly`
- [X] `reverts when exceeds MAX_EPOCH_DURATION`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setSettlementWindowUTC()
- [X] `sets settlement window correctly`
- [X] `reverts when exceeds MAX_SETTLEMENT_WINDOW_UTC`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setStrategyCapS1/S2/S3()
- [X] `sets strategy cap correctly`
- [X] `reverts when exceeds tvlGlobalCap`
- [X] `reverts when not owner calls`
- [X] `emits ConfigUpdated event`

#### Suite: setOwner()
- [X] `sets owner correctly`
- [X] `reverts when address is zero`
- [X] `reverts when not owner calls`
- [X] `emits AddressUpdated event`
- [X] `new owner can call functions`

#### Suite: Edge Cases
- [X] `handles boundary values correctly`
- [X] `handles zero values correctly`
- [X] `handles maximum values correctly`
- [X] `maintains consistency between related parameters`

---

## 📝 **Implementation Notes**

### Important Considerations

1. **Canonical Keys Pattern:**
   - Uses `keccak256()` to create bytes32 keys
   - Keys used in events for off-chain indexing
   - Standard DeFi pattern (see MakerDAO, Compound)

2. **Boundary Validation:**
   - All setters validate against maximum values
   - Some validate against related parameters (e.g., perTxCap <= tvlGlobalCap)
   - Prevents setting dangerous values

3. **Event Emission:**
   - All changes emit events with old/new values
   - Events use indexed keys for efficient filtering
   - Enables off-chain monitoring and indexing

4. **Default Values:**
   - Sensible defaults set at deployment
   - Can be changed by owner
   - Documented in code comments

5. **Gas Optimization:**
   - Public variables generate free getter functions
   - Constants stored in bytecode (not storage)
   - Events cheaper than storage for logging

---

## ✅ **Completion Criteria**

The contract is complete when:
- [X] All setter functions implemented
- [X] All boundary validations in place
- [X] All events emitted correctly
- [X] All tests pass
- [ ] Address setters implemented (future)
- [ ] Venue management implemented (future)
- [ ] Batch update function implemented (future)
- [ ] View function to get all config (future)

---

## 🎯 **Suggested Implementation Order**

1. Constants and state variables
2. Constructor and modifiers
3. Numeric parameter setters
4. Strategy cap setters
5. Owner setter
6. Tests for each setter
7. Address setters (future)
8. Venue management (future)

---

**Created:** [Current Date]  
**Last Updated:** [Current Date]  
**Status:** 🟡 Partially Complete (core functions done, address/venue management pending)



