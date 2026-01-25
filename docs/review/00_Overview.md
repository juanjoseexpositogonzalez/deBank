# dBank Protocol - Technical Overview

## Architecture Summary

dBank is a **yield-bearing vault protocol** following the ERC-4626 tokenized vault standard. Users deposit USDC and receive `dbUSDC` shares that appreciate in value as underlying strategies generate yield.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                    (React DApp + MetaMask)                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                          dBank Vault                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   Buffer    │  │  Share Token │  │   Fee Crystallization  │  │
│  │  (12% TVL)  │  │   (dbUSDC)   │  │   (Weekly Epochs)      │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      StrategyRouter                             │
│         Manages allocation to multiple yield strategies         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ MockS1   │    │ Strategy │    │ Strategy │
    │ (5% APR) │    │    S2    │    │    S3    │
    └──────────┘    └──────────┘    └──────────┘
```

## Contract Hierarchy

| Contract | Purpose | Dependencies |
|----------|---------|--------------|
| **Token.sol** | ERC-20 implementation (USDC) | None |
| **ConfigManager.sol** | Global protocol parameters | None |
| **MockS1.sol** | Yield strategy simulation | Token |
| **StrategyRouter.sol** | Strategy orchestration | Token, ConfigManager |
| **dBank.sol** | Core vault (ERC-4626) | Token, StrategyRouter, ConfigManager |

## Key Mechanisms

### 1. Share/Asset Ratio
- Initial deposits: 1 share = 1 asset (1:1)
- After yield: shares appreciate in value
- Formula: `pricePerShare = totalAssets / totalSupply`

### 2. Liquidity Buffer
- Maintains 12% of TVL in buffer for instant withdrawals
- Excess allocated to yield strategies
- Auto-replenished from strategies when depleted

### 3. Performance Fees
- 25% fee on profits above high-water mark
- Crystallized at weekly epoch boundaries
- Minted as shares to fee recipient

### 4. Safety Limits
- TVL cap: 100,000 USDC (configurable)
- Per-transaction cap: 5,000 USDC
- Slippage protection: 0.3% max

## Deployment Order

```bash
1. Deploy Token (USDC)
2. Deploy ConfigManager
3. Deploy StrategyRouter(token, configManager)
4. Deploy dBank(token, name, symbol, router, configManager)
5. Deploy MockS1(token)
6. Register strategy: strategyRouter.registerStrategy(1, mockS1, cap)
```

## File Structure

```
contracts/
├── Token.sol           # ERC-20 asset token
├── ConfigManager.sol   # Protocol parameters
├── dBank.sol           # Main vault contract
├── StrategyRouter.sol  # Strategy management
├── MockS1.sol          # Mock yield strategy
└── openzeppelin/       # Interface definitions
    ├── IERC4626.sol
    └── Math.sol

test/unit/
├── Token.js
├── ConfigManager.js
├── dBank.js
├── StrategyRouter.js
└── MockS1.js
```
