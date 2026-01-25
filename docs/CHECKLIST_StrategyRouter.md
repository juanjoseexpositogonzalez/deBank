# StrategyRouter Implementation Checklist

## Contract Description

**StrategyRouter** is the contract that acts as an intermediary between Vault4626 and individual strategies (MockS1, MockS2, MockS3). Its main functions are:

- **Aggregate** the `totalAssets()` from all active strategies
- **Distribute** capital from the vault to strategies according to allocation policy
- **Manage** limits and caps per strategy
- **Validate** that strategies are active and not paused before interacting with them

**Metaphor:** It's like a "railway switchyard" that routes trains (capital) to different tracks (strategies) according to traffic rules (allocation policy).

---

## 📋 Implementation Checklist

### 🔧 **Constants**

- [X] `SCALE` (1e18) - Fixed-point arithmetic scale
- [X] `MAX_STRATEGIES` (e.g., 10) - Maximum number of registered strategies

---

### 📦 **State Variables**

#### Addresses
- [X] `address public asset` - Base token (USDC)
- [X] `address public owner` - Contract owner
- [X] `address public configManager` - ConfigManager reference
- [X] `mapping(uint256 => address) public strategies` - Mapping of strategyId → strategy address
- [X] `mapping(address => uint256) public strategyId` - Reverse mapping: address → strategyId

#### Strategy State
- [X] `mapping(uint256 => bool) public strategyActive` - Strategy active or not
- [X] `mapping(uint256 => bool) public strategyPaused` - Cache of paused state for each strategy
- [X] `uint256 public totalStrategies` - Counter of registered strategies

#### Limits and Caps
- [X] `mapping(uint256 => uint256) public strategyCap` - Cap per strategy (can come from ConfigManager)
- [X] `mapping(uint256 => uint256) public strategyAllocated` - Currently allocated capital per strategy

---

### ⚠️ **Custom Errors**

- [X] `StrategyRouter__NotOwner()` - When caller is not owner
- [X] `StrategyRouter__StrategyNotRegistered()` - Strategy not registered
- [X] `StrategyRouter__StrategyPaused()` - Strategy is paused
- [X] `StrategyRouter__StrategyNotActive()` - Strategy is not active
- [X] `StrategyRouter__CapExceeded(uint256 strategyId, uint256 requested, uint256 available)` - Exceeds strategy cap
- [X] `StrategyRouter__InvalidStrategyAddress()` - Invalid strategy address (address(0))
- [X] `StrategyRouter__StrategyAlreadyRegistered()` - Attempt to register duplicate strategy
- [X] `StrategyRouter__InsufficientLiquidity()` - Not enough liquidity for withdrawal

---

### 🎯 **Events**

- [X] `StrategyRegistered(uint256 indexed strategyId, address indexed strategy, uint256 cap)` - Strategy registered
- [X] `StrategyActivated(uint256 indexed strategyId, bool active)` - Strategy activated/deactivated
- [X] `CapitalDeposited(uint256 indexed strategyId, uint256 amount, uint256 totalAllocated)` - Capital deposited to strategy
- [X] `CapitalWithdrawn(uint256 indexed strategyId, uint256 amount, uint256 totalAllocated)` - Capital withdrawn from strategy
- [X] `StrategyCapUpdated(uint256 indexed strategyId, uint256 oldCap, uint256 newCap)` - Strategy cap updated

---

### 🔒 **Modifiers**

- [X] `onlyOwner` - Only owner can execute
- [X] `strategyExists(uint256 _strategyId)` - Verify that strategy exists
- [X] `strategyActive(uint256 _strategyId)` - Verify that strategy is active
- [X] `strategyNotPaused(uint256 _strategyId)` - Verify that strategy is not paused

---

### 🏗️ **Constructor**

- [X] Parameters:
  - [X] `address _asset` - Base token (USDC)
  - [X] `address _configManager` - ConfigManager address
- [X] Initialization:
  - [X] `asset = _asset`
  - [X] `owner = msg.sender`
  - [X] `configManager = _configManager`
  - [X] `totalStrategies = 0`

---

### 👁️ **View Functions**

#### Strategy Information
- [X] `getStrategy(uint256 _strategyId) external view returns (address strategy, bool active, uint256 cap, uint256 allocated)` - Get strategy info
- [X] `isStrategyActive(uint256 _strategyId) external view returns (bool)` - Check if strategy is active
- [X] `getTotalStrategies() external view returns (uint256)` - Get total number of strategies

#### Asset Aggregation
- [X] `totalAssets() external view returns (uint256)` - Aggregate totalAssets() from all active strategies
  - [X] Iterate over active strategies
  - [X] Call `strategy.totalAssets()` from each
  - [X] Sum all values
  - [X] Return total aggregated

#### Limits and Availability
- [X] `availableCapacity(uint256 _strategyId) external view returns (uint256)` - Available capacity in strategy (cap - allocated)
- [X] `getTotalAllocated() external view returns (uint256)` - Total capital allocated across all strategies

---

### 🔄 **External Functions - Registration and Configuration**

#### Strategy Registration
- [X] `registerStrategy(uint256 _strategyId, address _strategy, uint256 _cap) external onlyOwner`
  - [X] Validate that `_strategy != address(0)`
  - [X] Validate that strategy is not already registered
  - [X] Validate that `_strategyId` is valid (e.g., 1, 2, 3 for S1, S2, S3)
  - [X] Register strategy in mapping
  - [X] Set initial cap
  - [X] Mark as active (optional, can be default)
  - [X] Increment `totalStrategies`
  - [X] Emit `StrategyRegistered`

#### Activation/Deactivation
- [X] `setStrategyActive(uint256 _strategyId, bool _active) external onlyOwner`
  - [X] Verify that strategy exists
  - [X] Update `strategyActive[_strategyId]`
  - [X] Emit `StrategyActivated`

#### Cap Updates
- [X] `setStrategyCap(uint256 _strategyId, uint256 _newCap) external onlyOwner`
  - [X] Verify that strategy exists
  - [X] Validate that `_newCap >= strategyAllocated[_strategyId]` (cannot be reduced below allocated)
  - [X] Update cap
  - [X] Emit `StrategyCapUpdated`

---

### 💰 **External Functions - Capital Management**

#### Deposit to Strategy
- [X] `depositToStrategy(uint256 _strategyId, uint256 _amount) external returns (uint256)`
  - [X] Verify that strategy exists
  - [X] Verify that strategy is active
  - [X] Verify that strategy is not paused (check `strategy.paused()`)
  - [X] Verify that `_amount > 0`
  - [X] Verify that `strategyAllocated[_strategyId] + _amount <= strategyCap[_strategyId]`
  - [X] Transfer tokens from msg.sender to router (if needed) or from vault
  - [X] Approve tokens to strategy (if needed)
  - [X] Call `strategy.depositToStrategy(_amount)`
  - [X] Update `strategyAllocated[_strategyId] += _amount`
  - [X] Emit `CapitalDeposited`
  - [X] Return deposited amount

#### Withdraw from Strategy
- [X] `withdrawFromStrategy(uint256 _strategyId, uint256 _amount, uint256 _maxSlippageBps) external returns (uint256)`
  - [X] Verify that strategy exists
  - [X] Verify that strategy is active
  - [X] Verify that strategy is not paused
  - [X] Verify that `_amount > 0`
  - [X] Verify that `_amount <= strategy.totalAssets()` (available liquidity)
  - [X] Call `strategy.withdrawFromStrategy(_amount)`
  - [X] Calculate `actualAmount` received (may be less due to slippage)
  - [X] Validate slippage: `actualAmount >= _amount * (10000 - _maxSlippageBps) / 10000`
  - [X] Update `strategyAllocated[_strategyId] -= actualAmount` (or adjust according to logic)
  - [X] Transfer tokens to recipient (vault or user)
  - [X] Emit `CapitalWithdrawn`
  - [X] Return withdrawn amount

---

### 🔍 **Internal Functions**

#### Validation
- [X] `_validateStrategy(uint256 _strategyId) internal view` - Validate that strategy exists and is active
- [X] `_updateStrategyPausedCache(uint256 _strategyId) internal` - Update cache of paused state

#### Calculations
- [X] `_calculateAvailableCapacity(uint256 _strategyId) internal view returns (uint256)` - Calculate available capacity

---

### 🧪 **Tests to Implement**

#### Suite: Setup and Registration
- [X] `returns correct asset address`
- [X] `returns correct owner`
- [X] `returns correct configManager address`
- [X] `registers strategy S1 correctly`
- [X] `registers strategy S2 correctly`
- [X] `registers strategy S3 correctly`
- [X] `reverts when registering strategy with address(0)`
- [X] `reverts when registering duplicate strategy`
- [X] `reverts when not owner registers strategy`
- [X] `emits StrategyRegistered event`

#### Suite: Activation/Deactivation
- [X] `activates strategy correctly`
- [X] `deactivates strategy correctly`
- [X] `reverts when activating non-existent strategy`
- [X] `emits StrategyActivated event`

#### Suite: Caps
- [X] `sets strategy cap correctly`
- [X] `reverts when setting cap below allocated amount`
- [X] `reverts when not owner sets cap`
- [X] `emits StrategyCapUpdated event`

#### Suite: totalAssets() - Aggregation
- [X] `returns 0 when no strategies registered`
- [X] `returns correct totalAssets with single strategy`
- [X] `aggregates totalAssets from multiple active strategies`
- [X] `excludes inactive strategies from aggregation`
- [X] `excludes paused strategies from aggregation`
- [X] `handles strategies with yield accumulated correctly`

#### Suite: depositToStrategy()
- [X] `deposits to strategy S1 correctly`
- [X] `updates strategyAllocated correctly`
- [X] `respects strategy cap`
- [X] `reverts when strategy not registered`
- [X] `reverts when strategy not active`
- [X] `reverts when strategy is paused`
- [X] `reverts when cap would be exceeded`
- [X] `reverts when amount is 0`
- [X] `emits CapitalDeposited event`
- [X] `transfers tokens correctly`

#### Suite: withdrawFromStrategy()
- [X] `withdraws from strategy correctly`
- [X] `updates strategyAllocated correctly`
- [X] `respects slippage tolerance`
- [X] `reverts when strategy not registered`
- [X] `reverts when strategy not active`
- [X] `reverts when strategy is paused`
- [X] `reverts when insufficient liquidity`
- [X] `reverts when slippage exceeded`
- [X] `emits CapitalWithdrawn event`
- [X] `transfers tokens to correct recipient`

#### Suite: Edge Cases
- [X] `handles multiple deposits to same strategy`
- [X] `handles partial withdrawals correctly`
- [X] `handles withdrawal of all capital from strategy`
- [X] `handles strategy pause during operation`
- [X] `handles strategy deactivation during operation`

#### Suite: Integration
- [X] `integrates correctly with MockS1`
- [X] `integrates correctly with ConfigManager`
- [X] `handles end-to-end deposit flow`
- [X] `handles end-to-end withdrawal flow`

---

## 📝 **Implementation Notes**

### Important Considerations

1. **Strategy Interface:** Strategies must implement:
   - `totalAssets() external view returns (uint256)`
   - `depositToStrategy(uint256 _amount) external`
   - `withdrawFromStrategy(uint256 _amount) external`
   - `paused() external view returns (bool)`

2. **Token Management:**
   - Router must have approval from vault to transfer tokens
   - Or vault must transfer tokens to router before depositing

3. **Slippage Protection:**
   - On withdrawals, validate that received amount meets `maxSlippageBps`
   - For MockS1, slippage will be minimal (it's virtual), but validation must be present

4. **Paused State Cache:**
   - Consider caching the `paused` state of each strategy
   - Or query it each time (more gas but safer)

5. **Allocation Policy (MVP):**
   - In MVP, simple allocation: everything goes to S1
   - In the future, distribution logic can be added according to tier

---

## ✅ **Completion Criteria**

The contract is complete when:
- [X] All functions are implemented
- [X] All tests pass
- [X] Test coverage > 80%
- [X] Integration with MockS1 works correctly
- [X] Integration with ConfigManager works correctly
- [X] NatSpec documentation complete

---

## 🎯 **Suggested Implementation Order**

1. Basic structure (constructor, variables, errors, events)
2. Registration functions (registerStrategy, setStrategyActive)
3. `totalAssets()` function (aggregation)
4. `depositToStrategy()` function
5. `withdrawFromStrategy()` function
6. Tests for each function
7. Integration tests

---

**Created:** [Current Date]  
**Last Updated:** [Current Date]  
**Status:** ✅ Completed
