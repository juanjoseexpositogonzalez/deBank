# dBank - Decentralized Bank

A decentralized bank (DeFi vault) built on Ethereum that allows users to deposit stablecoins (USDC) and earn yield through automated strategies.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Compile contracts
npx hardhat compile

# Run tests with coverage
npm run coverage
```

## 📚 Documentation

- **[Project Overview](./docs/PROJECT_OVERVIEW.md)** - Complete project introduction, features, and user guide
- **[StrategyRouter Contract](./docs/CONTRACT_StrategyRouter.md)** - Detailed contract documentation
- **[ConfigManager Contract](./docs/CONTRACT_ConfigManager.md)** - Configuration management system documentation
- **[Low-Level Calls Annex](./docs/ANNEX_LowLevelCalls.md)** - Technical deep dive on low-level calls
- **[MockS1 Flow Diagram](./docs/FLOW_MockS1.md)** - Visual flow diagrams for MockS1 strategy
- **[Testing Strategy](./docs/TESTING_STRATEGY.md)** - Testing approach and patterns
- **[Implementation Checklists](./docs/CHECKLIST_StrategyRouter.md)** - Development checklists

## 🏗️ Architecture

```
dBank Vault (ERC-4626)
    ↓
StrategyRouter ← ConfigManager
    ↓
Strategies (MockS1, MockS2, MockS3)
```

**Components**:
- **dBank Vault**: Main user-facing contract (ERC-4626)
- **StrategyRouter**: Routes capital to strategies
- **ConfigManager**: Centralized configuration management
- **Strategies**: Yield-generating contracts (MockS1, MockS2, MockS3)

## ✨ Features

- **ERC-4626 Compliant**: Standard vault interface for maximum composability
- **Tier-Based Access**: Risk-based strategy access (Tier 1, 2, 3)
- **Multiple Strategies**: Smart staking, yield farming, arbitrage
- **Liquidity Buffer**: 12% buffer for instant withdrawals
- **Performance Fees**: High-water mark based fee system
- **Transparent**: All operations on-chain and verifiable

## 📦 Contracts

- **Vault4626** (dBank): Main vault contract (in progress)
- **StrategyRouter**: Capital routing and aggregation
- **MockS1**: Virtual yield accumulator strategy
- **ConfigManager**: Centralized configuration management for all system parameters

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test test/unit/MockS1.js
npm test test/unit/StrategyRouter.js
 
# Integration flow (deposit → allocate → time travel → un-allocate → withdraw)
npm test test/integration/Flow.js

# Generate coverage report
npm run coverage
```

## 🔧 Development

```bash
# Start local node
npx hardhat node

# Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Verify contracts
npx hardhat verify --network <network> <contract-address>

# Seed data (balances/caps) using config.json addresses for the target chain
npx hardhat run scripts/seed.js --network localhost   # or sepolia
```

## 🌐 Frontend

```bash
npm run start
# Opens http://localhost:3000 - select the network (Hardhat or Sepolia)
```

## 🧩 ABIs and Synchronization
- After contract changes, synchronize frontend ABIs:
  - `npm run sync-abis`
- To use the frontend with local network: `npm run frontend:start` (deploy + seed + start).

## 💧 Note on un-allocate
- `un-allocate` requires liquidity in `StrategyRouter`. If yield is virtual (MockS1), the router must have sufficient balance to return the yield portion.

## 💳 x402 Integration

dBank supports deposits via Coinbase's x402 protocol for automatic on-chain payments.

### Components

- **Facilitator** (`facilitator/`): Self-hosted service for payment verification and settlement
- **x402 Backend** (`backend/`): x402-protected API for deposits
- **Network**: Base Sepolia (84532) with EIP-3009 USDC

### Documentation

- `docs/X402_OVERVIEW.md`: Introduction to x402 protocol
- `docs/X402_ARCHITECTURE.md`: Architecture and system flow
- `facilitator/README.md`: Facilitator guide
- `backend/README.md`: Backend guide

### Status

✅ Base Sepolia configuration  
✅ Self-hosted facilitator implemented  
✅ x402 backend implemented  
✅ Frontend integration complete  
✅ Unit and integration tests implemented  

### Testing Documentation

- `docs/X402_TESTING_GUIDE.md`: Complete guide to test x402 in the DApp
- `test/README_X402.md`: x402 tests documentation
- `test/unit/Facilitator.js`: Facilitator unit tests
- `test/unit/Backend.js`: Backend unit tests
- `test/integration/X402Flow.js`: x402 flow integration tests
- `test/integration/X402EndToEnd.js`: End-to-end tests (requires running services)

### Next Steps to Test

1. Install dependencies: `npm install` in root, `facilitator/` and `backend/`
2. Configure environment variables (see `.env.example` in each directory)
3. Deploy contracts on Base Sepolia: `npx hardhat run scripts/deploy.js --network baseSepolia`
4. Start services: `./scripts/start-x402.sh` (or manually)
5. Connect wallet to Base Sepolia and test x402 deposit from the DApp

See `docs/X402_TESTING_GUIDE.md` for detailed instructions.

## 🧭 Seeding and Network Configuration
- Network addresses in `src/config.json` (31337 Hardhat, 11155111 Sepolia).
- The `scripts/seed.js` script reads addresses from `config.json` (or environment variables with the same keys: `token`, `dbank`, `strategyRouter`, `configManager`, `mockS1`).
- Amounts/caps in Sepolia are reduced by default; adjust caps if you need larger deposits (see `docs/SEED.md`).

## 📖 Learn More

See [PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md) for:
- What dBank is and how it works
- User capabilities and use cases
- Architecture details
- Tier system explanation
- Strategy descriptions

## ⚠️ Disclaimer

This is an **MVP/learning project**. Not for production use without proper audits and security reviews.

## 📄 License

MIT License

---

**Status**: MVP Development  
**Author**: Juan José Expósito González
