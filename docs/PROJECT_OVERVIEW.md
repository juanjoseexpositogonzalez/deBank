# dBank - Decentralized Bank Project Overview

## Table of Contents

1. [Introduction](#introduction)
2. [What is dBank?](#what-is-dbank)
3. [Problem Statement](#problem-statement)
4. [Solution](#solution)
5. [Key Features](#key-features)
6. [How It Works](#how-it-works)
7. [User Capabilities](#user-capabilities)
8. [Architecture Overview](#architecture-overview)
9. [Tier System](#tier-system)
10. [Strategies](#strategies)
11. [Benefits](#benefits)
12. [Current Status](#current-status)
13. [Future Roadmap](#future-roadmap)

---

## Introduction

**dBank** is a decentralized bank (DeFi vault) built on Ethereum that allows users to deposit stablecoins (USDC) and earn yield through automated strategies. Unlike traditional banks, dBank operates entirely on-chain, is transparent, non-custodial, and provides users with direct control over their funds.

### Vision

To create a **composable, secure, and efficient** DeFi vault that democratizes access to yield-generating strategies while maintaining institutional-grade risk management.

---

## What is dBank?

dBank is an **ERC-4626 compliant vault** that:

- **Accepts deposits** in USDC (ERC-20 stablecoin)
- **Mints shares** (ERC-20 tokens) representing ownership in the vault
- **Routes capital** to yield-generating strategies automatically
- **Generates returns** through smart staking, yield farming, and arbitrage
- **Manages risk** through tier-based access and strategy caps
- **Provides transparency** with all operations visible on-chain

### Real-World Analogy

Think of dBank as a **mutual fund** but:
- **Decentralized**: No central authority, runs on blockchain
- **Transparent**: All operations are on-chain and verifiable
- **Non-custodial**: You always control your funds
- **Automated**: Strategies run automatically without manual intervention
- **Composable**: Built on standards (ERC-4626) for maximum interoperability

---

## Problem Statement

### Current DeFi Challenges

1. **High Barriers to Entry**: Complex strategies require technical knowledge
2. **Capital Requirements**: Many protocols require large minimum deposits
3. **Gas Costs**: Multiple transactions needed for optimal yield
4. **Risk Management**: Users must manually monitor and rebalance positions
5. **Liquidity Fragmentation**: Capital spread across multiple protocols
6. **Lack of Transparency**: Difficult to verify strategy performance

### Traditional Banking Limitations

1. **Low Interest Rates**: Traditional savings accounts offer minimal returns
2. **Centralized Control**: Banks control your funds and can freeze accounts
3. **Geographic Restrictions**: Limited access based on location
4. **Lack of Transparency**: Opaque operations and fee structures
5. **Slow Settlement**: Traditional banking is slow and inefficient

---

## Solution

dBank solves these problems by:

1. **Unified Interface**: Single entry point for multiple yield strategies
2. **Automated Management**: Strategies run automatically via off-chain bots
3. **Risk-Based Access**: Tier system ensures appropriate risk exposure
4. **Gas Optimization**: Batch operations reduce transaction costs
5. **Transparency**: All operations are on-chain and auditable
6. **Composability**: Built on ERC-4626 standard for maximum interoperability

---

## Key Features

### 1. ERC-4626 Compliance

- **Standard Interface**: Compatible with all ERC-4626 tooling and integrations
- **Share-Based Accounting**: Transparent ownership tracking
- **Conversion Functions**: Easy conversion between assets and shares
- **Preview Functions**: See exact amounts before transactions

### 2. Liquidity Buffer

- **12% Buffer**: Maintains idle liquidity for instant withdrawals
- **Instant Withdrawals**: Small withdrawals served immediately from buffer
- **Async Withdrawals**: Large withdrawals queued and processed asynchronously
- **No Slippage**: Buffer ensures predictable withdrawal amounts

### 3. Tier-Based Access

- **Tier 1**: Access to low-risk strategies (Smart Staking/Lending)
- **Tier 2**: Access to Tier 1 + medium-risk strategies (Yield Farming)
- **Tier 3**: Access to all strategies including high-risk (Arbitrage)
- **Automatic Assignment**: Tier determined by deposit amount and lock period

### 4. Multiple Yield Strategies

- **Strategy 1 (S1)**: Smart Staking/Lending - Low risk, high liquidity
- **Strategy 2 (S2)**: Yield Farming - Medium risk, higher returns
- **Strategy 3 (S3)**: Arbitrage - High risk, highest potential returns

### 5. Performance Fees

- **High-Water Mark**: Fees only charged on new gains
- **Epoch-Based**: Fees crystallized every 7 days
- **Transparent**: All fee calculations visible on-chain
- **Competitive**: 25% performance fee (industry standard)

### 6. Safety Features

- **Pause Mechanism**: Emergency pause for all operations
- **Strategy Caps**: Maximum capital limits per strategy
- **Slippage Protection**: Maximum slippage limits on withdrawals
- **Access Control**: Multi-sig for critical operations

---

## How It Works

### Deposit Flow

```
1. User approves USDC to dBank vault
2. User calls deposit(amount) or mint(shares)
3. Vault mints shares to user (1:1 initially)
4. Vault maintains 12% buffer
5. Remaining capital routed to StrategyRouter
6. Router distributes to appropriate strategies based on tier
7. Strategies start generating yield immediately
```

### Withdrawal Flow

```
1. User calls withdraw(assets) or redeem(shares)
2. If amount <= buffer:
   → Instant withdrawal from buffer
3. If amount > buffer:
   → Partial from buffer + sync withdrawal from strategies
   → Or async withdrawal queued for settlement window
4. User receives USDC
5. Shares burned
```

### Yield Generation

```
1. Strategies generate yield (staking rewards, lending interest, arbitrage profits)
2. Yield accumulates in strategy contracts
3. Off-chain bots call report() periodically
4. Yield realized and added to principal
5. Price per share increases
6. Users' shares worth more USDC
```

---

## User Capabilities

### What Users Can Do

#### 1. **Deposit USDC**

Users can deposit any amount of USDC (subject to minimums and caps) and receive vault shares in return.

**Example**:
```solidity
// Deposit 1000 USDC
vault.deposit(1000e6, userAddress);
// Receives ~1000 shares (1:1 initially)
```

**Benefits**:
- Start earning yield immediately
- Shares represent ownership
- Can withdraw anytime (subject to liquidity)

#### 2. **Withdraw USDC**

Users can withdraw their USDC by burning shares. Withdrawals can be:
- **Instant**: Served from liquidity buffer (up to 12% of TVL)
- **Synchronous**: Partial buffer + immediate withdrawal from strategies
- **Asynchronous**: Queued for settlement window (for large amounts)

**Example**:
```solidity
// Withdraw 500 USDC
vault.withdraw(500e6, userAddress, userAddress);
// Shares burned, USDC transferred
```

**Benefits**:
- Flexible withdrawal options
- No lock-up period
- Predictable amounts (no slippage on instant withdrawals)

#### 3. **Track Performance**

Users can query:
- **Total Assets**: Total USDC managed by vault
- **Price Per Share**: Current value of 1 share in USDC
- **User Balance**: How many shares they own
- **Estimated Value**: `shares * pricePerShare`

**Example**:
```solidity
uint256 shares = vault.balanceOf(userAddress);
uint256 pricePerShare = vault.convertToAssets(1e18);
uint256 totalValue = shares * pricePerShare / 1e18;
```

**Benefits**:
- Real-time performance tracking
- Transparent calculations
- On-chain verification

#### 4. **Preview Transactions**

Before executing transactions, users can preview:
- **Shares to Receive**: `previewDeposit(assets)`
- **Assets to Receive**: `previewRedeem(shares)`
- **Maximum Deposits**: `maxDeposit(receiver)`
- **Maximum Withdrawals**: `maxWithdraw(owner)`

**Example**:
```solidity
uint256 sharesPreview = vault.previewDeposit(1000e6);
// See exactly how many shares you'll receive
```

**Benefits**:
- No surprises
- Better UX
- Gas estimation

#### 5. **Transfer Shares**

Shares are ERC-20 tokens, so users can:
- Transfer to other addresses
- Approve for spending
- Use in DeFi protocols (lending, AMMs, etc.)

**Example**:
```solidity
vault.transfer(recipient, shares);
// Transfer ownership
```

**Benefits**:
- Composable with other DeFi protocols
- Can be used as collateral
- Liquid representation of vault position

---

## Architecture Overview

### On-Chain Components

```
┌─────────────────┐
│   dBank Vault   │  ERC-4626 Vault
│   (Vault4626)   │  - Accepts deposits
│                 │  - Mints/burns shares
│                 │  - Manages buffer
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Strategy Router │  Capital Router
│ (StrategyRouter) │  - Routes to strategies
│                 │  - Aggregates assets
│                 │  - Manages caps
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ MockS1 │ │ MockS2 │ │ MockS3 │ │  ...   │
│ (Tier1)│ │ (Tier2)│ │ (Tier3)│ │        │
└────────┘ └────────┘ └────────┘ └────────┘
```

### Off-Chain Components

- **Strategy Orchestrator**: Bots that execute harvests, rebalances, and reports
- **Risk Monitor**: Monitors strategy health and triggers alerts
- **Keeper Network**: Executes time-based operations (settlement windows, fee crystallization)

### Data Flow

1. **User → Vault**: Deposits USDC, receives shares
2. **Vault → Router**: Routes capital to StrategyRouter
3. **Router → Strategies**: Distributes capital based on tier and caps
4. **Strategies → Yield**: Generate returns through various mechanisms
5. **Bots → Strategies**: Call `report()` to realize yield
6. **Yield → Vault**: Increases `totalAssets()` and `pricePerShare`
7. **User Benefits**: Shares worth more USDC

---

## Tier System

### Tier 1 - Basic Access

**Requirements**:
- Minimum deposit: TBD
- Access to: Strategy 1 (Smart Staking/Lending)

**Risk Profile**: Low
**Expected APY**: 3-5%
**Liquidity**: High

**Use Case**: Conservative users seeking stable returns with minimal risk.

### Tier 2 - Intermediate Access

**Requirements**:
- Minimum deposit: TBD
- Lock period: TBD
- Access to: Strategy 1 + Strategy 2 (Yield Farming)

**Risk Profile**: Medium
**Expected APY**: 5-10%
**Liquidity**: Medium

**Use Case**: Users comfortable with moderate risk for higher returns.

### Tier 3 - Premium Access

**Requirements**:
- Minimum deposit: TBD
- Lock period: TBD
- K-factor: TBD
- Access to: All strategies (including Arbitrage)

**Risk Profile**: High
**Expected APY**: 10-20%+
**Liquidity**: Variable

**Use Case**: Sophisticated users seeking maximum returns and willing to accept higher risk.

---

## Strategies

### Strategy 1: Smart Staking/Lending (MockS1)

**Type**: Virtual yield accumulator (for MVP)
**Risk**: Low
**Liquidity**: High
**Mechanism**: 
- Simulates lending USDC to blue-chip protocols
- Accumulates yield linearly over time
- APR configurable (e.g., 5% = 500 basis points)

**Features**:
- Virtual accrual (no real tokens moved)
- Deterministic yield calculation
- Cap-based limits
- Pause mechanism

### Strategy 2: Yield Farming (Future)

**Type**: Liquidity provision with reward harvesting
**Risk**: Medium
**Liquidity**: Medium
**Mechanism**:
- Provide liquidity to DEX pools (USDC-X)
- Stake LP tokens for additional rewards
- Harvest and compound rewards
- Convert all rewards to USDC

**Features**:
- Multi-protocol integration
- Automatic compounding
- Slippage protection
- Reward optimization

### Strategy 3: Arbitrage (Future)

**Type**: Cross-venue price arbitrage
**Risk**: High
**Liquidity**: Variable
**Mechanism**:
- Monitor price differences across DEXs/CEXs
- Execute arbitrage opportunities
- Convert profits to USDC
- Strict risk limits

**Features**:
- Real-time monitoring
- Fast execution
- Strict guardrails
- Maximum exposure limits

---

## Benefits

### For Users

1. **Passive Income**: Earn yield without active management
2. **Diversification**: Access to multiple strategies through single deposit
3. **Transparency**: All operations on-chain and verifiable
4. **Flexibility**: Withdraw anytime (subject to liquidity)
5. **Composability**: Shares can be used in other DeFi protocols
6. **Low Barriers**: No minimum technical knowledge required

### For Developers

1. **Standard Interface**: ERC-4626 compliance for easy integration
2. **Composable**: Works with existing DeFi infrastructure
3. **Extensible**: Easy to add new strategies
4. **Testable**: Comprehensive test suite
5. **Documented**: Extensive documentation and code comments

### For the Ecosystem

1. **Capital Efficiency**: Better utilization of idle capital
2. **Liquidity Aggregation**: Concentrates liquidity for better rates
3. **Innovation**: Enables new DeFi primitives
4. **Education**: Learning resource for DeFi development

---

## Current Status

### ✅ Completed

- **MockS1 Strategy**: Virtual yield accumulator with full test coverage
- **StrategyRouter**: Capital routing and aggregation system
- **Test Suite**: Comprehensive tests for all components
- **Documentation**: Technical documentation and flow diagrams

### 🚧 In Progress

- **Vault4626 (dBank)**: Main vault contract (checklist prepared)
- **ConfigManager**: Configuration management system
- **Integration Tests**: End-to-end flow testing

### 📋 Planned

- **Async Withdrawal Module**: EIP-7540 implementation
- **Tier Gate**: Tier assignment and access control
- **Real Strategies**: Integration with actual DeFi protocols
- **Frontend**: User interface for interactions
- **Monitoring**: Off-chain monitoring and alerting system

---

## Future Roadmap

### Phase 1: MVP (Current)

- ✅ Mock strategies for testing
- ✅ Basic vault functionality
- ✅ Strategy router
- 🚧 ERC-4626 compliance
- 📋 Basic tier system

### Phase 2: Production Ready

- Real strategy integrations
- Async withdrawals
- Advanced tier system
- Performance fee crystallization
- Multi-sig governance

### Phase 3: Advanced Features

- Multi-asset support (beyond USDC)
- Strategy auto-rebalancing
- Advanced risk management
- Cross-chain support
- DAO governance

### Phase 4: Scale

- Layer 2 deployment
- Gas optimization
- Batch operations
- Advanced analytics
- Mobile app

---

## Technical Stack

### Smart Contracts

- **Solidity**: ^0.8.19
- **Hardhat**: Development environment
- **OpenZeppelin**: Security standards and libraries
- **ERC-4626**: Vault standard implementation

### Testing

- **Chai**: Assertion library
- **Ethers.js**: Ethereum interaction
- **Hardhat Network**: Local blockchain for testing

### Documentation

- **Markdown**: All documentation in Markdown
- **Mermaid**: Flow diagrams and architecture diagrams
- **NatSpec**: Inline code documentation

---

## Getting Started

### For Users (Future)

1. Connect wallet (MetaMask, WalletConnect, etc.)
2. Approve USDC to dBank vault
3. Deposit USDC
4. Receive shares
5. Monitor performance
6. Withdraw when needed

### For Developers

1. Clone repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Review documentation in `docs/`
5. Deploy to testnet: `npx hardhat deploy`

---

## Security Considerations

### On-Chain Security

- **Access Control**: Multi-sig for critical operations
- **Pause Mechanism**: Emergency stop for all operations
- **Strategy Caps**: Maximum capital limits
- **Slippage Protection**: Maximum slippage on withdrawals
- **Reentrancy Guards**: Protection against reentrancy attacks

### Off-Chain Security

- **Key Management**: Secure key storage for bots
- **Monitoring**: Real-time monitoring and alerts
- **Audits**: Regular security audits
- **Bug Bounty**: Bug bounty program (planned)

---

## Resources

### Documentation

- [StrategyRouter Contract](./CONTRACT_StrategyRouter.md)
- [Low-Level Calls Annex](./ANNEX_LowLevelCalls.md)
- [MockS1 Flow Diagram](./FLOW_MockS1.md)
- [Implementation Checklists](./CHECKLIST_StrategyRouter.md)

### External Resources

- [ERC-4626 Specification](https://eips.ethereum.org/EIPS/eip-4626)
- [EIP-7540 (Async ERC-4626)](https://ethereum-magicians.org/t/eip-7540-asynchronous-erc-4626-tokenized-vaults/16153)
- [Yearn V3 Documentation](https://docs.yearn.fi/developers/v3/overview)

---

## Contributing

This is currently a learning project. Contributions and feedback are welcome!

### Areas for Contribution

- Strategy implementations
- Test coverage improvements
- Documentation enhancements
- Gas optimizations
- Security reviews

---

## License

MIT License - See LICENSE file for details

---

## Contact

**Project**: dBank - Decentralized Bank  
**Author**: Juan José Expósito González  
**Status**: MVP Development  
**Last Updated**: [Current Date]

---

**Note**: This is an MVP/learning project. Not for production use without proper audits and security reviews.

