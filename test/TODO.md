1) Vault4626.js

Goal: ERC-4626 compliance (getters, conversions, max/preview paths), buffer logic, deposit/withdraw, fee epoch hooks.

Suites / Cases

[VAULT/SETUP] Metadata & Wiring

returns asset() (USDC native)

ERC-20 metadata (name/symbol/decimals)

strategyRouter & config addresses set

[VAULT/GET] Totals & Conversions

totalAssets = buffer + router.totalAssets()

convertToShares rounds down

convertToAssets rounds down

[VAULT/LIMITS] Max & Preview

maxDeposit/maxMint respect TVL, per-tx cap, tier

previewDeposit/previewMint include deposit fee (0 now)

maxWithdraw/maxRedeem reflect available liquidity

previewWithdraw/previewRedeem include withdrawal fee (0 now)

[VAULT/DEPOSIT] Buffer Policy

fills buffer to 12%, routes remainder to router (S1)

emits Deposit

[VAULT/WITHDRAW] Instant & Sync

instant withdraw served from buffer

partial buffer + sync unwind from S1 within maxSlippageBps

slippage breach → revert (policy) or queue engagement (policy switch)

[VAULT/FEE] Epoch & HWM

no fee mid-epoch

fee crystallization at 7d with high-water mark respected

feeRecipient receives 25% of realized gains

[VAULT/ADMIN] Config Updates

owner-only updates: buffer%, caps, fee bps, epoch, window

ConfigUpdated events

2) StrategyRouter.js

Goal: Single-strategy routing for MVP (S1 active), caps, aggregation.

Suites / Cases

[ROUTER/SETUP] Registration

S1 registered; S2/S3 stubs present

[ROUTER/AGG] Accounting

totalAssets() aggregates S1 (after accrual)

[ROUTER/DEPOSIT] Dispatch

depositToStrategy(S1, amount) respects cap

emits routing events

[ROUTER/WITHDRAW] Recall

withdrawFromStrategy(S1, amount, maxSlippageBps) (slippage noop for mock)

reverts on policy breach (simulate via config flag)

[ROUTER/SAFETY] Pauses & Allowlists

disallow calls when S1 paused

reject non-allowlisted venues (conceptual check – config flag)

3) StrategyMockS1.js

Goal: Virtual accrual model, report/harvest behavior, caps, pause.

Suites / Cases

[S1/DEPOSIT] Principal

deposit increases principal; totalAssets = principal at accumulator=1

[S1/ACCRUAL] Time

accrual over Δt increases totalAssets deterministically with apr_bps

[S1/REPORT] Harvest

report() realizes gain, resets accumulator to 1, updates principal

[S1/WITHDRAW] Liquidity

withdraw reduces principal; cannot exceed totalAssets

[S1/CAPS] Limits

deposits capped at cap

[S1/PAUSE] Safety

paused: deposits/withdraws revert; views ok

[S1/EVENTS] Observability

emits on deposit/withdraw/report/params

4) AsyncQueue.js

Goal: Pending→Claimable→Claimed lifecycle, SLA semantics, idempotence.

Suites / Cases

[QUEUE/CREATE] Enqueue

shortfall triggers Pending with correct amount & ts

effective balance reduced on entry

[QUEUE/SETTLE] Window

at 12:00 UTC settlement marks Claimable (keeper simulation)

partial settlement FIFO when liquidity insufficient

[QUEUE/CLAIM] Delivery

claim() transfers assets; multiple claims idempotent

emits WithdrawClaimable / WithdrawQueued

5) ConfigManager.js

Goal: Owner-only configuration, events, boundary checks.

Suites / Cases

[CFG/OWN] Ownership

only owner can set parameters

[CFG/SET] Updates

buffer%, maxSlippageBps, caps, fee bps, epoch, window, role addrs

bounds enforced (e.g., buffer 0–100%, bps ≤ 10_000)

[CFG/EVT] Events

ConfigUpdated emitted with old/new values

6) integration.Flow.spec.js

Goal: End-to-end flows across contracts (happy paths + key edges).

Scenarios

[FLOW/DEP→INV] user deposits → buffer target reached → remainder routed to S1

[FLOW/WITH/INSTANT] instant withdraw within buffer

[FLOW/WITH/SYNC] partial buffer + sync unwind from S1

[FLOW/WITH/QUEUE] overflow → queue → settlement → claim

[FLOW/HARVEST] epoch harvest: report → fee crystallization → buffer top-up

[FLOW/TIERS] tier constraints affect maxDeposit/maxMint (conceptual hook)

7) invariants.Properties.spec.js

Goal: Safety properties; no code fuzzing yet, just deterministic checks.

Properties

No share inflation: after arbitrary sequence, pps progression consistent

Withdraw ≤ totalAssets: never exceeds at call time

Monotonic accrual (S1): between withdraws/reports, totalAssets non-decreasing (apr ≥ 0)

Queue safety: reentrancy-guarded paths (conceptual check)

Pause policy: deposits halt; queued claims still possible (if that’s your policy)

🧭 Execution Order (what to run first)

config.ConfigManager.spec.js

strategy.MockS1.spec.js

router.StrategyRouter.spec.js

vault.Vault4626.spec.js

queue.AsyncQueue.spec.js

integration.Flow.spec.js

invariants.Properties.spec.js

This mirrors the implementation order and minimizes stubbing pain.