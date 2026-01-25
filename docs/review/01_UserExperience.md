# dBank - User Experience Guide

## Overview

The dBank DApp provides a seamless interface for users to earn yield on their USDC through automated yield strategies. This document describes the expected user flows and interactions.

---

## Supported Networks

| Network | Chain ID | Purpose |
|---------|----------|---------|
| Hardhat Local | 31337 (0x7a69) | Development/Testing |
| Sepolia | 11155111 (0xaa36a7) | Testnet deployment |

---

## User Flows

### 1. Initial Connection

```
┌──────────────────────────────────────────────────────────────┐
│  User arrives at DApp                                        │
│  ↓                                                           │
│  DApp detects MetaMask                                       │
│  ↓                                                           │
│  User clicks "Connect Wallet"                                │
│  ↓                                                           │
│  MetaMask popup → User approves connection                   │
│  ↓                                                           │
│  DApp displays:                                              │
│  • Connected address (truncated)                             │
│  • Current network                                           │
│  • USDC balance                                              │
│  • dbUSDC share balance                                      │
└──────────────────────────────────────────────────────────────┘
```

**UI Elements:**
- Network selector dropdown (Hardhat/Sepolia)
- Connect button → Shows truncated address when connected
- Balance display panel

---

### 2. Network Switching

```
User selects different network in DApp dropdown
        ↓
DApp calls wallet_switchEthereumChain
        ↓
    ┌───┴───┐
    │       │
   Yes     No (Network not in MetaMask)
    │       ↓
    │   DApp calls wallet_addEthereumChain
    │       ↓
    │   MetaMask prompts to add network
    │       ↓
    └───────┴───────┐
                    ↓
        MetaMask fires chainChanged event
                    ↓
        DApp reloads contracts for new network
                    ↓
        UI updates with new network data
```

**Expected Behavior:**
- Dropdown shows current network
- Switching triggers MetaMask confirmation
- All balances and data refresh automatically
- No page reload required

---

### 3. Deposit Flow

```
┌────────────────────────────────────────────────────────────────┐
│  DEPOSIT TAB                                                   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Your USDC Balance: 10,000.00                           │  │
│  │  Your dbUSDC Shares: 0.00                               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Deposit Amount: [________] USDC                        │  │
│  │  Max: 5,000.00 (per-tx cap)                             │  │
│  │                                                          │
│  │  You will receive: ~5,000.00 dbUSDC                     │  │
│  │  Current price per share: 1.0000                        │  │
│  │                                                          │
│  │  [    APPROVE    ]  [    DEPOSIT    ]                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Step-by-step:**

1. **Enter Amount**
   - User enters USDC amount to deposit
   - DApp validates against caps and balance
   - Shows preview of shares to receive

2. **Approve (if needed)**
   - First-time users must approve dBank to spend USDC
   - MetaMask popup for approval transaction
   - Button changes to "Approved" when complete

3. **Deposit**
   - User clicks "Deposit"
   - MetaMask popup for deposit transaction
   - Success: balances update, shares minted
   - Transaction hash displayed for verification

**Error Handling:**
| Error | Message | Resolution |
|-------|---------|------------|
| Insufficient balance | "Insufficient USDC balance" | Reduce amount |
| Exceeds per-tx cap | "Amount exceeds per-transaction limit" | Reduce to 5,000 |
| Exceeds TVL cap | "Vault TVL cap reached" | Wait for withdrawals |
| Paused | "Vault is currently paused" | Wait for unpause |

---

### 4. Withdraw Flow

```
┌────────────────────────────────────────────────────────────────┐
│  WITHDRAW TAB                                                  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Your dbUSDC Shares: 5,000.00                           │  │
│  │  Current Value: 5,250.00 USDC (pricePerShare: 1.05)     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Withdraw by: ( ) Assets  (•) Shares                    │  │
│  │                                                          │
│  │  Amount: [________] dbUSDC                              │  │
│  │  Max: 5,000.00                                          │  │
│  │                                                          │
│  │  You will receive: ~5,250.00 USDC                       │  │
│  │                                                          │
│  │  [    WITHDRAW    ]    or    [    REDEEM    ]           │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Two Methods:**

| Method | Input | Output | Use Case |
|--------|-------|--------|----------|
| **Withdraw** | USDC amount | Burns calculated shares | "I want exactly 1000 USDC" |
| **Redeem** | Share amount | Returns calculated USDC | "I want to exit 50% of my position" |

**Withdrawal Sources:**
1. **Buffer (instant)**: If amount ≤ buffer, served immediately
2. **Strategies (may have slippage)**: If amount > buffer, pulls from strategies

---

### 5. Strategies View (Admin/Info)

```
┌────────────────────────────────────────────────────────────────┐
│  STRATEGIES TAB                                                │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Vault Metrics                                          │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  Total Assets:     100,000.00 USDC                      │  │
│  │  Total Supply:      95,238.10 dbUSDC                    │  │
│  │  Price per Share:       1.05                            │  │
│  │  Buffer:            12,000.00 USDC (12%)                │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Strategy Allocations                                   │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  MockS1 (Active)                                        │  │
│  │  • Principal: 80,000.00 USDC                            │  │
│  │  • Total Assets: 88,000.00 USDC (includes yield)        │  │
│  │  • APR: 5%                                              │  │
│  │  • Cap: 100,000.00 USDC                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 6. Charts/Analytics

```
┌────────────────────────────────────────────────────────────────┐
│  CHARTS TAB                                                    │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Price per Share History                                │  │
│  │                                                          │
│  │  1.10 ─┐                                      ┌──        │  │
│  │  1.05 ─┤                           ┌─────────┘           │  │
│  │  1.00 ─┼───────────────────────────┘                     │  │
│  │        └─────┴─────┴─────┴─────┴─────┴─────┴─────        │  │
│  │          Week 1   2     3     4     5     6     7        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Your Position Value Over Time                          │  │
│  │  [Chart showing USDC value of user's shares]            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## State Management (Redux)

```
store/
├── provider/
│   ├── connection      # Ethers provider
│   ├── chainId         # Current network
│   └── account         # Connected address
│
├── tokens/
│   ├── contracts       # Token contract instances
│   └── balances        # User USDC balance
│
├── dBank/
│   ├── contract        # dBank contract instance
│   ├── shares          # User dbUSDC balance
│   ├── totalAssets     # Vault TVL
│   ├── totalSupply     # Total shares
│   └── pricePerShare   # Current share price
│
├── strategyRouter/
│   ├── contract        # Router contract instance
│   └── strategies      # Strategy info array
│
└── configManager/
    ├── contract        # ConfigManager instance
    └── params          # Current config values
```

---

## Error States & Messages

### Connection Errors
| Scenario | User Message | Action |
|----------|--------------|--------|
| No MetaMask | "Please install MetaMask" | Link to MetaMask |
| Wrong network | "Please switch to Hardhat/Sepolia" | Network selector |
| Not connected | "Connect your wallet to continue" | Connect button |

### Transaction Errors
| Error Code | Message | Cause |
|------------|---------|-------|
| `dBank__Paused` | "Vault is paused" | Admin paused vault |
| `dBank__CapExceeded` | "Amount exceeds limit" | TVL or per-tx cap |
| `dBank__InsufficientLiquidity` | "Insufficient liquidity" | Not enough in buffer+strategies |
| `dBank__InsufficientShares` | "Insufficient shares" | Trying to withdraw more than owned |

---

## Responsive Considerations

- **Desktop**: Full layout with charts and detailed metrics
- **Mobile**: Simplified tabs, larger touch targets
- **Loading states**: Skeleton screens while fetching blockchain data
- **Transaction pending**: Spinner + "Waiting for confirmation"

---

## Security UX

1. **Approval Pattern**: Always show user what they're approving
2. **Transaction Preview**: Show expected outcome before signing
3. **Network Verification**: Warn if on unexpected network
4. **Amount Validation**: Client-side validation before contract calls
