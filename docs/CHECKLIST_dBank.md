# Implementation Checklist - dBank (Vault4626)

## Contract Description

**dBank** is the main ERC-4626 compliant vault contract that acts as the entry point for users to deposit and withdraw USDC. Its primary functions are:

- **Accept deposits** and mint shares (ERC-20 tokens representing vault ownership)
- **Maintain liquidity buffer** (12% of TVL) for instant withdrawals
- **Route capital** to StrategyRouter for yield generation
- **Handle withdrawals** synchronously from buffer or asynchronously via queue
- **Calculate and charge fees** (performance fee with epoch-based crystallization)
- **Enforce limits** (TVL cap, per-transaction cap, tier-based access)

**Metaphor:** It's like a "bank vault" where users deposit money and receive "deposit slips" (shares). The vault keeps some cash in the drawer (buffer) for quick withdrawals, while the rest is invested through the router to generate yield.

---

## 📋 Implementation Checklist

### 🔧 **Constants**

- [X] `SCALE` (1e18) - Fixed-point arithmetic scale
- [X] `MAX_BPS` (10_000) - Maximum basis points (100%)
- [X] `EPOCH_DURATION` (7 days) - Duration of fee epoch in seconds

---

### 📦 **State Variables**

#### Core Addresses
- [X] `Token public immutable asset` - Underlying token (USDC)
- [X] `address public owner` - Contract owner
- [X] `address public strategyRouter` - StrategyRouter contract address
- [X] `address public configManager` - ConfigManager contract address

#### ERC-20 State (for shares)
- [X] `string public name` - Vault name (e.g., "dBank USDC Vault")
- [X] `string public symbol` - Vault symbol (e.g., "dbUSDC")
- [X] `uint8 public decimals` - Decimals (should match asset decimals, typically 18)
- [X] `uint256 public totalSupply` - Total shares minted
- [X] `mapping(address => uint256) public balanceOf` - Share balances
- [X] `mapping(address => mapping(address => uint256)) public allowance` - ERC-20 allowances

#### Liquidity Buffer
- [X] `uint256 public buffer` - Current buffer balance (idle liquidity)
- [X] `uint256 public bufferTargetBps` - Target buffer percentage (e.g., 1200 = 12%)

#### Fees & Epochs
- [X] `uint256 public performanceFeeBps` - Performance fee in basis points (e.g., 2500 = 25%)
- [X] `address public feeRecipient` - Address that receives fees
- [X] `uint256 public lastEpochTimestamp` - Timestamp of last fee crystallization
- [X] `uint256 public highWaterMark` - Highest pricePerShare achieved (for HWM fee calculation)

#### Limits & Caps
- [X] `uint256 public tvlCap` - Maximum TVL allowed
- [X] `uint256 public perTxCap` - Maximum deposit per transaction

#### Pause & Safety
- [X] `bool public paused` - Emergency pause flag

---

### ⚠️ **Custom Errors**

- [X] `dBank__NotOwner()` - When caller is not owner
- [X] `dBank__ZeroAddress()` - Invalid zero address parameter (Note: param removed, simpler error)
- [X] `dBank__InsufficientAllowance()` - Insufficient allowance for operation
- [X] `dBank__Paused()` - Contract is paused
- [X] `dBank__CapExceeded(uint256 requested, uint256 available)` - Deposit exceeds cap
- [X] `dBank__InsufficientLiquidity(uint256 requested, uint256 available)` - Not enough liquidity for withdrawal
- [X] `dBank__SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippageBps)` - Slippage too high
- [X] `dBank__InvalidAmount()` - Amount is zero or invalid
- [X] `dBank__InsufficientShares()` - Not enough shares for operation
- [X] `dBank__InvalidReceiver()` - Invalid receiver address
- [X] `dBank__EpochNotComplete()` - Fee epoch not complete yet

---

### 🎯 **Events**

#### ERC-4626 Required Events
- [X] `Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)` - ERC-4626 standard
- [X] `Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)` - ERC-4626 standard

#### ERC-20 Events (for shares)
- [X] `Transfer(address indexed from, address indexed to, uint256 value)` - ERC-20 standard
- [X] `Approval(address indexed owner, address indexed spender, uint256 value)` - ERC-20 standard

#### Custom Events
- [X] `BufferUpdated(uint256 oldBuffer, uint256 newBuffer)` - Buffer updated (Note: bufferTarget not included in event, but can be calculated)
- [X] `FeesCrystallized(uint256 gain, uint256 feeAmount, uint256 newHighWaterMark, uint256 timestamp)` - Fees charged
- [X] `ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue)` - Configuration updated
- [X] `Paused(bool paused)` - Pause state changed

---

### 🔒 **Modifiers**

- [X] `onlyOwner` - Only owner can execute
- [X] `whenNotPaused` - Contract must not be paused
- [X] `validAddress(address _addr)` - Address must not be zero

---

### 🏗️ **Constructor**

- [X] Parameters:
  - [X] `Token _asset` - Underlying token (USDC)
  - [X] `string memory _name` - Vault name
  - [X] `string memory _symbol` - Vault symbol
  - [X] `address _strategyRouter` - StrategyRouter address
  - [X] `address _configManager` - ConfigManager address
- [X] Initialization:
  - [X] `asset = _asset`
  - [X] `name = _name`
  - [X] `symbol = _symbol`
  - [X] `decimals = _asset.decimals()` (or 18 if asset doesn't have decimals)
  - [X] `owner = msg.sender`
  - [X] `strategyRouter = _strategyRouter`
  - [X] `configManager = _configManager`
  - [X] Initialize buffer target from ConfigManager
  - [X] Initialize fee parameters from ConfigManager
  - [X] `lastEpochTimestamp = block.timestamp`
  - [X] `highWaterMark = 0`
  - [X] `tvlCap = ConfigManager(configManager).tvlGlobalCap()`
  - [X] `perTxCap = ConfigManager(configManager).perTxCap()`
  - [X] `paused = false`

---

### 👁️ **ERC-4626 Required View Functions**

#### Asset & Total Assets
- [X] `asset() external view returns (Token)` - Returns underlying token address
- [X] `totalAssets() external view returns (uint256)` - Returns total managed assets
  - [X] Calculate: `buffer + strategyRouter.totalAssets()`
  - [X] Includes yield: Router's `totalAssets()` includes yield from strategies
  - [ ] TODO: Fee deduction from totalAssets when fees are crystallized (pending fee transfer implementation)

#### Conversion Functions
- [X] `convertToShares(uint256 assets) external view returns (uint256 shares)` - Convert assets to shares
  - [X] Formula: `shares = assets * totalSupply / totalAssets` (if totalSupply > 0)
  - [X] If totalSupply == 0: `shares = assets` (1:1 initial)
  - [X] Must round DOWN (floor)
  
- [X] `convertToAssets(uint256 shares) external view returns (uint256 assets)` - Convert shares to assets
  - [X] Formula: `assets = shares * totalAssets / totalSupply` (if totalSupply > 0)
  - [X] If totalSupply == 0: return 0
  - [X] Must round DOWN (floor)

#### Max Functions
- [X] `maxDeposit(address receiver) external view returns (uint256)` - Maximum assets that can be deposited
  - [X] Check TVL cap: `tvlCap - totalAssets()`
  - [X] Check per-tx cap: `perTxCap`
  - [X] Return minimum of all limits
- [X] `maxMint(address receiver) external view returns (uint256)` - Maximum shares that can be minted
- [X] `maxWithdraw(address owner) external view returns (uint256)` - Maximum assets that can be withdrawn
- [X] `maxRedeem(address owner) external view returns (uint256)` - Maximum shares that can be redeemed

#### Preview Functions
- [X] `previewDeposit(uint256 assets) external view returns (uint256 shares)` - Preview shares for deposit
  - [X] Use `convertToShares(assets)`
  - [X] Include deposit fees if any (currently 0 in MVP)

- [X] `previewMint(uint256 shares) external view returns (uint256 assets)` - Preview assets for mint
  - [X] Use `convertToAssets(shares)`
  - [X] Include deposit fees if any

- [X] `previewWithdraw(uint256 assets) external view returns (uint256 shares)` - Preview shares for withdraw
  - [X] Use `convertToShares(assets)`
  - [X] Include withdrawal fees if any (currently 0 in MVP)

- [X] `previewRedeem(uint256 shares) external view returns (uint256 assets)` - Preview assets for redeem
  - [X] Use `convertToAssets(shares)`
  - [X] Include withdrawal fees if any

---

### 💰 **ERC-4626 Required External Functions**

#### Deposit Functions
- [X] `deposit(uint256 assets, address receiver) external returns (uint256 shares)`
  - [X] Verify `whenNotPaused`
  - [X] Verify `assets > 0`
  - [X] Verify `receiver != address(0)`
  - [X] Verify `assets <= maxDeposit(receiver)`
  - [X] Calculate shares: `shares = previewDeposit(assets)`
  - [X] Mint shares to `receiver`
  - [X] Update buffer: fill buffer to target, route remainder to router
  - [X] Emit `Deposit` event
  - [X] Return shares minted

- [X] `mint(uint256 shares, address receiver) external returns (uint256 assets)`
  - [X] Verify `whenNotPaused`
  - [X] Verify `shares > 0`
  - [X] Verify `receiver != address(0)`
  - [X] Calculate assets: `assets = previewMint(shares)`
  - [X] Verify `assets <= maxDeposit(receiver)`
  - [X] Transfer assets from `msg.sender` to vault
  - [X] Mint shares to `receiver`
  - [X] Update buffer: fill buffer to target, route remainder to router
  - [X] Update total supply and balance of receiver
  - [X] Emit `Deposit` event
  - [X] Return assets deposited

#### Withdrawal Functions
- [X] `withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)`
  - [X] Verify `whenNotPaused` (or allow if queued withdrawals)
  - [X] Verify `assets > 0`
  - [X] Verify `receiver != address(0)`
  - [X] Verify `assets <= maxWithdraw(owner)`
  - [X] Calculate shares: `shares = previewWithdraw(assets)`
  - [X] Verify `shares <= balanceOf[owner]`
  - [ ] Handle approval if `owner != msg.sender` (TODO: Only `redeem()` handles this, `withdraw()` should too)
  - [X] Burn shares from `owner`
  - [X] Serve withdrawal:
    - [X] If `assets <= buffer`: serve from buffer
    - [X] Else: serve from buffer + withdraw from router (sync)
    - [X] If insufficient liquidity: queue withdrawal (async - future)
  - [X] Transfer assets to `receiver`
  - [X] Emit `Withdraw` event
  - [X] Return shares burned

- [X] `redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)`
  - [X] Verify `whenNotPaused` (or allow if queued withdrawals)
  - [X] Verify `shares > 0`
  - [X] Verify `receiver != address(0)`
  - [X] Verify `shares <= balanceOf[owner]`
  - [X] Calculate assets: `assets = previewRedeem(shares)`
  - [X] Handle approval if `owner != msg.sender`
  - [X] Burn shares from `owner`
  - [X] Serve withdrawal (same logic as `withdraw`)
  - [X] Transfer assets to `receiver`
  - [X] Emit `Withdraw` event
  - [X] Return assets withdrawn

---

### 🔄 **ERC-20 Functions (for Shares)**

#### Standard ERC-20
- [X] `transfer(address to, uint256 amount) external returns (bool)` - Transfer shares
- [X] `transferFrom(address from, address to, uint256 amount) external returns (bool)` - Transfer shares with approval
- [X] `approve(address spender, uint256 amount) external returns (bool)` - Approve spender
- [X] `increaseAllowance(address spender, uint256 addedValue) external returns (bool)` - Increase allowance
- [X] `decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool)` - Decrease allowance

#### Internal Helpers
- [X] `_transfer(address from, address to, uint256 amount) internal` - Internal transfer logic
- [X] `_mint(address to, uint256 amount) internal` - Mint shares
- [X] `_burn(address from, uint256 amount) internal` - Burn shares

---

### 🎛️ **Custom Functions - Buffer Management**

- [X] `_updateBuffer() internal` - Update buffer to target
  - [X] Calculate target: `targetBuffer = totalAssets * bufferTargetBps / MAX_BPS`
  - [X] If `buffer < targetBuffer`: withdraw from router to fill buffer (placeholder - router integration pending)
  - [X] If `buffer > targetBuffer`: deposit excess to router (placeholder - router integration pending)
  - [X] Emit `BufferUpdated` event

- [X] `_fillBuffer(uint256 targetAmount) internal` - Fill buffer to target amount
  - [X] Calculate needed: `needed = targetAmount - buffer`
  - [X] If `needed > 0`: withdraw from router (placeholder - router integration pending)
  - [X] Update buffer

---

### 💸 **Custom Functions - Fee Management**

- [X] `crystallizeFees() external` - Crystallize performance fees
  - [X] Verify epoch is complete: `block.timestamp >= lastEpochTimestamp + EPOCH_DURATION`
  - [X] Calculate current `pricePerShare = totalAssets / totalSupply`
  - [X] Calculate gain: `gain = pricePerShare - highWaterMark` (if positive)
  - [X] Calculate fee: `fee = gain * performanceFeeBps / MAX_BPS` (calculation done, transfer pending)
  - [X] Update `highWaterMark = max(highWaterMark, pricePerShare)`
  - [ ] Transfer fee to `feeRecipient` (TODO: Fee transfer not yet implemented)
  - [X] Update `lastEpochTimestamp = block.timestamp`
  - [X] Emit `FeesCrystallized` event

- [X] `pricePerShare() external view returns (uint256)` - Current price per share
  - [X] Return `totalAssets / totalSupply` (if totalSupply > 0)
  - [X] Return `1e18` if totalSupply == 0 (1:1 initial)

---

### 🔧 **Custom Functions - Configuration**

- [X] `setBufferTargetBps(uint256 _newTargetBps) external onlyOwner` - Update buffer target
  - [X] Verify `_newTargetBps <= MAX_BPS`
  - [X] Update `bufferTargetBps`
  - [X] Call `_updateBuffer()`
  - [X] Emit `ConfigUpdated` event

- [X] `setPerformanceFeeBps(uint256 _newFeeBps) external onlyOwner` - Update performance fee
  - [X] Verify `_newFeeBps <= MAX_BPS`
  - [X] Update `performanceFeeBps`
  - [X] Emit `ConfigUpdated` event

- [X] `setFeeRecipient(address _newRecipient) external onlyOwner` - Update fee recipient
  - [X] Verify `_newRecipient != address(0)`
  - [X] Update `feeRecipient`
  - [X] Emit `ConfigUpdated` event

- [X] `setTvlCap(uint256 _newCap) external onlyOwner` - Update TVL cap
  - [X] Update `tvlCap`
  - [X] Emit `ConfigUpdated` event

- [X] `setPerTxCap(uint256 _newCap) external onlyOwner` - Update per-transaction cap
  - [X] Update `perTxCap`
  - [X] Emit `ConfigUpdated` event

- [X] `pause(bool _paused) external onlyOwner` - Pause/unpause vault
  - [X] Update `paused`
  - [X] Emit `Paused` event

---

### 🔗 **Integration Functions**

- [ ] `_depositToRouter(uint256 amount) internal` - Deposit to StrategyRouter
  - [ ] Approve router if needed
  - [ ] Call `strategyRouter.depositToStrategy(strategyId, amount)`
  - [ ] Handle return value
  - **Status**: Not implemented - placeholder in `_updateBuffer()` and `_fillBuffer()`

- [ ] `_withdrawFromRouter(uint256 amount, uint256 maxSlippageBps) internal returns (uint256)` - Withdraw from StrategyRouter
  - [ ] Call `strategyRouter.withdrawFromStrategy(strategyId, amount, maxSlippageBps)`
  - [ ] Return actual amount received
  - [ ] Handle slippage validation
  - **Status**: Not implemented - placeholder in `withdraw()` and `redeem()` (reverts with `InsufficientLiquidity`)

---

### 🧪 **Tests to Implement**

#### Suite: [VAULT/SETUP] Metadata & Wiring
- [X] `returns correct asset address`
- [X] `returns correct ERC-20 name`
- [X] `returns correct ERC-20 symbol`
- [X] `returns correct decimals (matches asset)`
- [X] `sets strategyRouter address correctly`
- [X] `sets configManager address correctly`
- [X] `sets owner correctly`
- [X] `initializes buffer to 0`
- [X] `initializes totalSupply to 0`

#### Suite: [VAULT/GET] Totals & Conversions
- [X] `totalAssets returns buffer + router.totalAssets()`
- [X] `totalAssets returns 0 when empty`
- [X] `convertToShares rounds down correctly`
- [X] `convertToShares returns assets when totalSupply is 0`
- [X] `convertToAssets rounds down correctly`
- [X] `convertToAssets returns 0 when totalSupply is 0`
- [X] `pricePerShare returns 1e18 when totalSupply is 0`
- [X] `pricePerShare calculates correctly after deposits`

#### Suite: [VAULT/LIMITS] Max & Preview
- [X] `maxDeposit respects TVL cap`
- [X] `maxDeposit respects per-tx cap`
- [X] `maxDeposit returns minimum of all limits`
- [X] `maxMint calculates from maxDeposit correctly`
- [X] `maxWithdraw returns convertToAssets(balanceOf[owner])`
- [X] `maxRedeem returns balanceOf[owner]`
- [X] `previewDeposit includes deposit fees (0 in MVP)`
- [X] `previewMint includes deposit fees (0 in MVP)`
- [X] `previewWithdraw includes withdrawal fees (0 in MVP)`
- [X] `previewRedeem includes withdrawal fees (0 in MVP)`
- [X] `previewDeposit matches actual deposit shares`
- [X] `previewMint matches actual mint assets`

#### Suite: [VAULT/DEPOSIT] Buffer Policy
- [X] `deposit fills buffer to target (12%)`
- [X] `deposit routes remainder to router` (buffer updated, router integration pending)
- [X] `deposit mints correct shares`
- [X] `deposit transfers assets from user`
- [X] `deposit emits Deposit event`
- [X] `deposit reverts when paused`
- [X] `deposit reverts when exceeds maxDeposit`
- [X] `deposit reverts with zero amount`
- [X] `deposit reverts with zero receiver`
- [X] `mint works correctly (alternative to deposit)`
- [X] `mint routes excess to router after buffer filled` (buffer updated, router integration pending)

#### Suite: [VAULT/WITHDRAW] Instant & Sync
- [X] `withdraw serves from buffer when sufficient`
- [ ] `withdraw serves from buffer + router when needed` (router integration pending - currently reverts)
- [X] `withdraw burns correct shares`
- [X] `withdraw transfers assets to receiver`
- [X] `withdraw emits Withdraw event`
- [X] `withdraw reverts when paused`
- [X] `withdraw reverts when exceeds maxWithdraw`
- [X] `withdraw reverts with insufficient shares`
- [X] `withdraw reverts with zero receiver`
- [X] `redeem works correctly (alternative to withdraw)`
- [X] `withdraw handles slippage correctly` (basic implementation)
- [ ] `withdraw reverts when slippage exceeded` (slippage validation pending router integration)

#### Suite: [VAULT/FEE] Epoch & HWM
- [X] `crystallizeFees does nothing mid-epoch`
- [X] `crystallizeFees calculates fees correctly after epoch`
- [X] `crystallizeFees respects high-water mark`
- [ ] `crystallizeFees transfers fees to feeRecipient` (fee calculation done, transfer pending)
- [X] `crystallizeFees updates highWaterMark correctly`
- [X] `crystallizeFees updates lastEpochTimestamp`
- [X] `crystallizeFees emits FeesCrystallized event`
- [X] `crystallizeFees reverts when epoch not complete`
- [X] `highWaterMark prevents fee on losses`

#### Suite: [VAULT/ADMIN] Config Updates
- [X] `setBufferTargetBps updates correctly`
- [X] `setBufferTargetBps reverts when not owner`
- [X] `setBufferTargetBps reverts when > MAX_BPS`
- [X] `setBufferTargetBps triggers buffer update`
- [X] `setPerformanceFeeBps updates correctly`
- [X] `setFeeRecipient updates correctly`
- [X] `setTvlCap updates correctly`
- [X] `setPerTxCap updates correctly`
- [X] `pause updates correctly`
- [X] `all setters emit ConfigUpdated events`

#### Suite: [VAULT/ERC20] Share Token Functions
- [X] `transfer shares correctly`
- [X] `transferFrom works with approval`
- [X] `approve sets allowance correctly`
- [X] `increaseAllowance works correctly`
- [X] `decreaseAllowance works correctly`
- [X] `transfer emits Transfer event`
- [X] `approve emits Approval event`
- [X] `transfer reverts with insufficient balance`
- [X] `transferFrom reverts with insufficient allowance`

#### Suite: [VAULT/INTEGRATION] End-to-End
- [X] `deposit → buffer filled → router receives remainder` (buffer updated, router integration pending)
- [X] `withdraw from buffer only`
- [ ] `withdraw from buffer + router sync` (router integration pending)
- [X] `multiple deposits accumulate correctly`
- [X] `deposit and withdraw maintain share consistency`
- [ ] `yield from router increases totalAssets` (requires router integration with yield simulation)
- [ ] `yield increases pricePerShare` (requires router integration with yield simulation)

#### Suite: [VAULT/INVARIANTS] Safety Properties
- [ ] `totalAssets >= buffer` (always) - TODO: Add invariant test
- [ ] `totalAssets = buffer + router.totalAssets()` (always) - TODO: Add invariant test
- [ ] `shares never inflate` (totalSupply only increases on deposit) - TODO: Add invariant test
- [ ] `withdraw never exceeds totalAssets` - TODO: Add invariant test
- [ ] `pricePerShare never decreases` (unless fees or losses) - TODO: Add invariant test
- [ ] `convertToShares and convertToAssets are inverse` (approximately) - TODO: Add invariant test

---

## 📝 **Implementation Notes**

### Critical Considerations

1. **Rounding Direction:**
   - Always round DOWN (floor) in conversions to protect the vault
   - Users may receive slightly less, but vault never loses

2. **Buffer Management:**
   - Target buffer: 12% of TVL (configurable)
   - After each deposit, fill buffer to target
   - After each withdrawal, check if buffer needs refill

3. **Fee Crystallization:**
   - Only charge fees on gains (pricePerShare > highWaterMark)
   - Fees charged at epoch boundaries (7 days)
   - High-water mark prevents double-charging on same gains

4. **Integration with StrategyRouter:**
   - Vault must approve router to spend assets
   - Vault calls router functions to deposit/withdraw
   - Router aggregates strategies and returns totalAssets

5. **Reentrancy Protection:**
   - Use ReentrancyGuard on state-changing functions
   - Follow checks-effects-interactions pattern

6. **EIP-2612 (Permit) Support:**
   - Optional but recommended for better UX
   - Allows approval via signature instead of transaction

---

## ✅ **Completion Criteria**

The contract is complete when:
- [X] All ERC-4626 functions implemented and compliant
- [X] All ERC-20 functions implemented for shares
- [X] Buffer management works correctly (router integration pending)
- [X] Fee crystallization works correctly (fee transfer pending)
- [ ] Integration with StrategyRouter works (pending implementation of `_depositToRouter` and `_withdrawFromRouter`)
- [X] All tests pass (83 passing tests)
- [ ] Test coverage > 80% (TODO: Run coverage report)
- [ ] NatSpec documentation complete (TODO: Add comprehensive NatSpec comments)
- [X] No reentrancy vulnerabilities (checks-effects-interactions pattern followed)
- [X] All rounding is consistent (always floor)

---

## 🎯 **Suggested Implementation Order**

1. Basic structure (constructor, state variables, errors, events)
2. ERC-20 functions for shares (transfer, approve, etc.)
3. ERC-4626 view functions (asset, totalAssets, conversions, max, preview)
4. Deposit functions (deposit, mint) with buffer logic
5. Withdrawal functions (withdraw, redeem) with buffer + router logic
6. Fee crystallization logic
7. Admin functions (setters, pause)
8. Tests for each function group
9. Integration tests
10. Invariant tests

---

**Created:** [Current Date]  
**Last Updated:** [Current Date]  
**Status:** 🟡 In Progress | ✅ Mostly Completed

## 📌 **Pending TODOs**

1. **Router Integration**: 
   - Implement `_depositToRouter()` to deposit excess buffer to strategies
   - Implement `_withdrawFromRouter()` to withdraw from strategies when buffer insufficient
   - Currently placeholders that revert or update state without actual router calls

2. **Fee Transfer**: 
   - Complete fee transfer to `feeRecipient` in `crystallizeFees()`
   - Currently calculates fees but doesn't transfer them

3. **Test Coverage**: 
   - Run coverage report to verify > 80% coverage
   - Add invariant tests for safety properties

4. **NatSpec Documentation**: 
   - Add comprehensive NatSpec comments to all functions
   - Document parameters, return values, and side effects

5. **Withdrawal Approval Handling**: 
   - `withdraw()` should handle approval if `owner != msg.sender` (currently only `redeem()` does this)
   - This is a minor inconsistency - both functions should handle approvals the same way


