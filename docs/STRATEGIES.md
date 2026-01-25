# Strategies UI Specification

Component goal: allow a user to allocate previously deposited shares across available strategies, respecting per-strategy caps/percentages, and showing current totals and per-strategy allocations.

## UX / Layout
- Component type: Card (match style of Deposit/Withdraw cards).
- Sections:
  - Header: “Strategies” (or “Allocate Strategies”).
  - Totals row:
    - Total shares held by user.
    - Total shares currently allocated (sum of per-strategy allocations).
    - Unallocated shares (total – allocated).
  - Allocation controls (repeatable rows):
    - Strategy selector (dropdown): list of strategies available to the user (id + label).
    - Input for shares to allocate to that strategy.
    - Display of strategy constraints:
      - Cap (absolute or per-tx, as exposed by the router/config).
      - Current allocated vs cap (and % used).
    - Optional: percentage helper (e.g., 10% / 25% / 50% / 100% of unallocated shares).
  - Action row:
    - Button: “Allocate” (disabled if no strategy selected or amount invalid).
    - Optional: “Clear” to reset inputs.
  - Feedback:
    - Pending / Success / Error alerts (reuse existing Alert component with explorer link).

## Data inputs required
- User-level:
  - totalUserShares (from dBank `balanceOf(user)` or cached Redux state).
  - userAllocations per strategy (from StrategyRouter or cached state).
  - unallocatedShares = totalUserShares – sum(userAllocations).
- Strategy-level (per strategy):
  - id (e.g., 1, 2, 3…)
  - address
  - cap (and/or perTxCap if applicable)
  - currently allocated (from router)
  - active/paused flags (disable selection if paused/inactive)
  - optional: name/label

## Behaviors / Rules
- The entered allocation for a strategy must not exceed:
  - User’s unallocated shares.
  - Strategy cap minus current allocated.
  - Any per-tx cap if enforced at the UI level.
- Total of new allocations cannot exceed unallocated shares.
- If a strategy is paused/inactive, disable it in the dropdown or show a warning.
- Validation errors should block the “Allocate” action and show inline messages.
- On submit:
  - Call the allocation interaction (e.g., router method) with signer.
  - Show “Approving…” / “Allocating…” states similar to Deposit/Withdraw.
  - On success, refresh balances and per-strategy allocations in Redux.

## UI Elements (suggested)
- Dropdown: Strategy selector (id + name). Disabled entries for paused.
- Numeric input: Shares to allocate.
- Helper text: “Cap: X shares; Allocated: Y; Remaining: R; % Used: U%”.
- Totals badge: “Total shares: T | Allocated: A | Unallocated: U”.
- Buttons: “Allocate” (primary), optional “Clear”.
- Alerts: Pending (info), Success (success), Error (danger) with tx hash link (explorer).

## State / Redux needs (reference)
- From `strategyRouter` slice: strategies, caps, allocated, active/paused.
- From `dBank` slice: shares (user balance), totalSupply if needed for ratios.
- From provider: chainId (for explorer link).

## Edge cases
- Unallocated shares == 0: disable inputs and button; show message “No unallocated shares”.
- Strategy remaining cap == 0: disable that strategy.
- Mixed decimals: shares use 18 decimals; ensure consistent formatting/parsing.
- Network switch: reload strategies and allocations; clear form.

## Styling
- Reuse card width, padding, typography consistent with Deposit/Withdraw.
- Keep dropdown and inputs in a responsive row; stack on narrow screens.
- Use muted text for caps/usage info; underline/blue for clickable links.

## Explorer links
- Reuse existing Alert behavior: pass `explorerBaseUrl` + `transactionHash` to make the hash clickable.
