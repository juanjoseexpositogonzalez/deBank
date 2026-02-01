# Codebase Concerns

**Analysis Date:** 2026-02-01

## Tech Debt

**Fee Collection Disabled in crystallizeFees():**
- Issue: Performance fee collection is completely disabled - fee calculation logic is commented out in lines 485-491 of `contracts/dBank.sol`
- Files: `contracts/dBank.sol` (lines 465-500)
- Impact: System collects zero fees despite `performanceFeeBps` being configured. Protocol loses revenue from yield. Gas costs accrued for no benefit.
- Fix approach: Uncomment and implement fee transfer logic. Calculate `feeAmount = (gain * performanceFeeBps) / MAX_BPS`, then mint corresponding shares to `feeRecipient` or transfer assets. Requires careful share accounting to not inflate `totalSupply` incorrectly.

**Buffer Auto-Fill Not Implemented:**
- Issue: `_updateBuffer()` in `contracts/dBank.sol` (lines 637-655) only withdraws from strategies to fill buffer deficit, never auto-deposits excess buffer back to strategies
- Files: `contracts/dBank.sol` (lines 637-655)
- Impact: Capital sits idle in buffer instead of being deployed to yield-generating strategies. Users' returns are lower than potential. Requires manual `allocate()` calls by owner.
- Fix approach: Implement auto-allocation logic in `_updateBuffer()` to deposit excess buffer (above target) to designated strategies. Requires strategy selection logic and careful orchestration to avoid circular calls.

**Inefficient Strategy Withdrawal Loop:**
- Issue: `_withdrawFromStrategies()` in `contracts/dBank.sol` (lines 596-631) iterates through ALL possible strategy IDs (1-10) even if most don't exist
- Files: `contracts/dBank.sol` (lines 596-631)
- Impact: Unnecessary gas waste. As strategies scale, withdrawal operations become increasingly expensive. With 10 strategies, every withdrawal execution checks 10 addresses.
- Fix approach: Maintain a list of active strategy IDs instead of iterating through all MAX_STRATEGIES. Use array of IDs that can be dynamically updated on registration/deactivation.

## Known Bugs

**Allocation Lock Prevents Unallocated Withdrawals:**
- Symptoms: User can deposit to vault and separately allocate to strategy from wallet, but `_revertIfAllocatedShares()` check at line 321 of `contracts/dBank.sol` prevents withdrawal of unallocated portion because contract conflates user's allocated tokens with their vault shares
- Files: `contracts/dBank.sol` (lines 320-321, 441-459); `test/integration/WithdrawAfterAllocation.js` (line 123 comment: "THIS IS THE BUG")
- Trigger:
  1. User deposits 5000 to vault → 5000 shares
  2. User allocates 4000 to strategy from wallet (separate transaction)
  3. User tries to withdraw 1000 (unallocated portion)
  4. Contract blocks withdrawal due to `_revertIfAllocatedShares()` treating user's wallet allocation as vault share lock
- Workaround: Un-allocate from strategy first, then withdraw from vault. Or system tracks allocations and shares separately without cross-contamination.

**Share Price Precision Loss on Large Allocations:**
- Symptoms: After user allocates significant portion to strategy while vault accrues yield, share conversions in `convertToShares()` and `convertToAssets()` (lines 159-176) may experience rounding errors due to integer division
- Files: `contracts/dBank.sol` (lines 159-176)
- Trigger: High TVL vault where yield accrues in strategies while large allocations reduce buffer share of total assets
- Workaround: Current implementation uses Solidity's implicit floor division which favors vault (rounds down on convert-to-shares, up on convert-to-assets)

**Frontend Depositors Table Stale on Network Switch:**
- Symptoms: Recently fixed in commit d215d5b, but residual risk remains. Frontend `loadDepositors()` call at line 71 of `src/components/Withdraw.js` may not refresh immediately when user switches networks/accounts
- Files: `src/components/Withdraw.js` (lines 65-79, 97-104); `src/store/interactions.js` (lines ~800-850 for loadDepositors)
- Impact: User sees stale depositor list from previous network until manual refresh or 30-second interval timer fires
- Fix approach: Ensure `loadDepositors()` is called synchronously in account/network change handlers with proper error handling and loading state

## Security Considerations

**SingleOwner Control Over Critical Parameters:**
- Risk: All caps (`tvlCap`, `perTxCap`), buffer settings, and fee configuration controlled by single owner address with no timelock or governance
- Files: `contracts/dBank.sol` (lines 513-558); `contracts/StrategyRouter.sol` (lines 258-313)
- Current mitigation: Immutable address references in constructor (`strategyRouter`, `configManager`), owner checks in modifiers
- Recommendations:
  1. Implement timelock on critical config changes (2-3 day delay)
  2. Add emergency pause mechanism separate from owner
  3. Consider governance token or multi-sig for owner operations
  4. Document all owner-controlled parameters in external specification

**staticcall Reliability in Strategy Queries:**
- Risk: Views like `totalAssets()` in `contracts/StrategyRouter.sol` (lines 133-163) and withdrawal in dBank (lines 596-631) silently ignore failed staticcalls on strategy contracts
- Files: `contracts/StrategyRouter.sol` (lines 141-158); `contracts/dBank.sol` (lines 608-614, 619-628)
- Current mitigation: `if (!success) continue` skips failed calls, but doesn't emit warnings
- Recommendations:
  1. Emit events on staticcall failures for off-chain monitoring
  2. Track failure count per strategy
  3. Consider auto-deactivating strategies with repeated failures
  4. Add admin function to manually mark strategy as unhealthy

**Unbounded Strategy Iteration in StrategyRouter:**
- Risk: MAX_STRATEGIES = 10 is hardcoded, but `totalAssets()` and `userTotalAssets()` iterate through all 10 regardless of usage
- Files: `contracts/StrategyRouter.sol` (lines 136-137, 173-174)
- Current mitigation: Loop bounded to 10 iterations max
- Recommendations: Track active strategy count to avoid unnecessary iterations

**No Input Validation on Strategy Address Registration:**
- Risk: `registerStrategy()` at line 258 of `contracts/StrategyRouter.sol` doesn't validate that registered address is an actual strategy contract
- Files: `contracts/StrategyRouter.sol` (lines 258-279)
- Current mitigation: Only owner can register
- Recommendations: Add optional callback check (e.g., call `paused()` or `totalAssets()` to validate interface)

## Performance Bottlenecks

**Inefficient Depositor List Enumeration:**
- Problem: `loadDepositors()` in `src/store/interactions.js` iterates through all historical events to build current depositor list
- Files: `src/store/interactions.js` (lines ~800-900)
- Cause: No on-chain index of current depositors. Must scan all Transfer events from vault inception
- Improvement path:
  1. Index deposits in Deposit event emission
  2. Implement off-chain service to track depositor list
  3. Add getter to dBank contract that returns paginated depositor list

**Debouncing With 300ms Delay on Conversions:**
- Problem: User input in Withdraw component (line 186 of `src/components/Withdraw.js`) waits 300ms before making contract calls
- Files: `src/components/Withdraw.js` (lines 162-203)
- Cause: Prevent excessive RPC calls during rapid typing
- Impact: Users experience up to 300ms lag on balance conversions. Poor UX for fast input changes.
- Improvement path:
  1. Implement optimistic updates (calculate locally with cached share ratio)
  2. Reduce debounce to 100ms
  3. Cache conversion results with TTL to reuse across components

**Full Re-render of Charts on Every Block:**
- Problem: `src/components/Charts.js` polls contract state on each block, updating Redux state even if values unchanged
- Files: `src/components/Charts.js` (lines ~200-300)
- Impact: Unnecessary re-renders, especially with 12s block times on test networks
- Improvement path:
  1. Implement value comparison before Redux dispatch
  2. Use blockNumber-based caching
  3. Increase polling interval to 2-3 blocks instead of every block

## Fragile Areas

**Allocation Lock Check Conflates Different Token Flows:**
- Files: `contracts/dBank.sol` (lines 320-321, 441-459)
- Why fragile: Logic assumes user allocations tracked in StrategyRouter directly correspond to vault share locks, but these are independent concepts. User can allocate from wallet funds without touching vault.
- Safe modification:
  1. Add explicit documentation that allocations are "intention signals" not "share locks"
  2. Consider removing `_revertIfAllocatedShares()` in favor of informational API that lets frontend show user their unallocated balance
  3. If keeping the lock, add test coverage for all allocation+withdrawal combinations
- Test coverage: `test/integration/WithdrawAfterAllocation.js` covers basic case, but needs tests for:
  - Multiple allocations across different strategies
  - Yield accrual before/after allocations
  - Re-allocation after partial withdrawals

**ERC4626 Conversion Functions Edge Cases:**
- Files: `contracts/dBank.sol` (lines 159-176, 249-263)
- Why fragile: Preview functions return expected values but actual behavior can differ due to:
  - Buffer changes between preview and execution
  - Slippage on strategy withdrawals
  - Rounding direction differences in previewWithdraw vs withdraw
- Safe modification:
  1. Add explicit tests for preview vs actual value mismatches
  2. Document preview assumptions in function comments
  3. Consider adding `maxSlippage` parameter to withdraw functions
- Test coverage: `test/unit/dBank.js` has basic conversion tests, needs:
  - Large amounts to test rounding
  - Scenario where buffer depletes between preview and execution
  - Multi-user concurrent operations

**StrategyRouter User Allocation Tracking Relies on msg.sender:**
- Files: `contracts/StrategyRouter.sol` (lines 351, 416)
- Why fragile: `userStrategyAllocations[msg.sender]` means only direct allocators are tracked. If intermediary contract allocates, user appears as allocator zero.
- Safe modification:
  1. Add `on-behalf-of` parameter to depositToStrategy/withdrawFromStrategy
  2. Require explicit user address in call signature
  3. Add tests for delegated allocations
- Test coverage: All tests use direct user calls, need test for:
  - Approval-based delegation
  - Router receiving allocations on behalf of another address

## Scaling Limits

**Strategy Count Hard-Capped at 10:**
- Current capacity: 10 strategies maximum (MAX_STRATEGIES constant)
- Limit: Any production system needing 11+ strategies must fork/redeploy
- Files: `contracts/StrategyRouter.sol` (line 16); loop iterations at lines 137, 173, 217, 232
- Scaling path:
  1. Replace MAX_STRATEGIES constant with dynamic array of active strategy IDs
  2. Implement strategy registry pattern with O(1) lookup instead of O(10) iteration
  3. Version 2: Use separate StrategyRegistry contract, StrategyRouter queries it

**Gas Cost Scaling with Historical Data:**
- Current capacity: Depositor enumeration works for ~1000 deposits, becomes slow beyond that
- Limit: Frontend becomes unresponsive when loading full depositor history (>5000 events)
- Files: `src/store/interactions.js` (depositor loading); `contracts/dBank.sol` (Deposit event emission only)
- Scaling path:
  1. Implement on-chain paginated query using events with indexed parameters
  2. Add backend API to cache and serve depositor list
  3. Implement bloom filters or Merkle tree for efficient verification

**Buffer Withdrawal Loop Gas Cost:**
- Current capacity: Safe for 10 strategies, each requiring staticcall + try/catch
- Limit: ~100-150k gas per withdrawal when multiple strategies active. Risk of transaction exceeding block gas limits if strategy count increases
- Files: `contracts/dBank.sol` (lines 596-631)
- Scaling path:
  1. Implement batch withdrawal function that pre-calculates which strategies to pull from
  2. Use strategy registry to iterate only active strategies
  3. Cache total allocated per strategy to avoid repeated calls

## Dependencies at Risk

**ethers.js v5 → v6 Breaking Changes:**
- Risk: Project uses ethers.js v5 (ethers.utils.parseUnits, ethers.BigNumber), v6 has incompatible API
- Impact: npm packages will eventually stop supporting v5. Hardhat and test tools may drop v5 compatibility.
- Files: `package.json` (likely has ^5.x specification); all React components using ethers
- Migration plan:
  1. Test with ethers v6 in isolated branch first
  2. Update parseUnits to new API
  3. Replace BigNumber usage with native JS BigInt where possible
  4. Audit all .utils calls for compatibility

**Hardhat Local Network Testing Limitations:**
- Risk: All tests run on local hardhat network. Integration tests don't verify testnet deployment
- Impact: Bugs specific to Sepolia/Base Sepolia (rpc node behavior, contract state) only found in production
- Current mitigation: Recent commits show testnet redeployments, but tests don't run against live testnet
- Recommendations:
  1. Add GitHub Actions workflow to run integration tests against live testnet
  2. Implement contract verification on deployment
  3. Keep deployment checklist (caps, configs) in sync with test assumptions

## Missing Critical Features

**Performance Fee Collection Not Operational:**
- Problem: Fee mechanism exists but collection disabled (see Tech Debt section). System cannot sustain itself through fees.
- Blocks: Revenue model, protocol sustainability, long-term operations
- Status: Code present but commented out (lines 485-491 of dBank.sol)

**Strategy Rebalancing Interface Absent:**
- Problem: No on-chain mechanism to move capital between strategies after allocation
- Blocks: Dynamic yield optimization, responding to changing APRs
- Current workaround: Owner must withdraw all and re-allocate (capital inefficient)

**Access Control Not Implemented:**
- Problem: Only single owner can perform all admin functions (register strategies, set caps, allocate capital)
- Blocks: Decentralization, emergency response without owner, multi-sig governance
- Status: ConfigManager has role definitions (ROLE_PAUSER, ROLE_HARVESTER, etc.) but not enforced

**Withdrawal Queue or Rate Limiting Not Implemented:**
- Problem: No protection against bank run scenarios. Large withdrawal requests can drain buffer instantly.
- Blocks: Stability in stress scenarios
- Current mitigation: `perTxCap` limits single tx, but doesn't prevent series of txs from same user

## Test Coverage Gaps

**Withdrawal Scenarios With Yield Accrual:**
- What's not tested: Withdrawing after strategies accrue yield while user has allocations
- Files: `contracts/dBank.sol` (maxWithdraw logic); `test/integration/WithdrawAfterAllocation.js` partially covers this
- Risk: Users might be unable to withdraw proportional share of yield on unallocated deposits due to rounding or allocation lock confusion
- Priority: High

**Multi-User Concurrent Allocations:**
- What's not tested: Two users allocating to same strategy simultaneously, checking allocation tracking accuracy
- Files: `contracts/StrategyRouter.sol` (userStrategyAllocations mapping); no specific test file
- Risk: Allocation accounting could become inconsistent under contention
- Priority: Medium

**Edge Case: Allocation Exceeds User Balance:**
- What's not tested: User deposits 100 tokens to vault, tries to allocate 200 to strategy (should fail but unclear where)
- Files: `contracts/StrategyRouter.sol` (depositToStrategy line 338: transfers from msg.sender, could fail silently)
- Risk: Unclear error message to user if balance insufficient
- Priority: Medium

**High-Precision Rounding in convertToAssets/convertToShares:**
- What's not tested: Large amounts (>1M tokens) with small share counts, checking for loss of precision
- Files: `contracts/dBank.sol` (lines 159-176)
- Risk: Rounding errors could compound in large vaults
- Priority: Medium

**Strategy Pause During Active Withdrawals:**
- What's not tested: What happens if strategy pauses mid-withdrawal request
- Files: `contracts/dBank.sol` (lines 596-631); `contracts/StrategyRouter.sol` (lines 365-429)
- Risk: User's withdrawal could fail or silently serve from buffer instead of strategy
- Priority: High

**Empty Buffer Withdrawal Attempts:**
- What's not tested: User tries to withdraw when buffer is exactly 0 but strategies have capital
- Files: `contracts/dBank.sol` (lines 311-336, 338-361)
- Risk: Revert with uninformative error message
- Priority: Low

---

*Concerns audit: 2026-02-01*
