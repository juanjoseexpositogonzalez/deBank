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
npx hardhat run scripts/seed.js --network localhost   # o sepolia
```

## 🌐 Frontend

```bash
npm run start
# Abre http://localhost:3000 y selecciona la red (Hardhat o Sepolia)
```

## 🧭 Seeding y configuración de redes
- Direcciones por red en `src/config.json` (31337 Hardhat, 11155111 Sepolia).
- El script `scripts/seed.js` toma direcciones de `config.json` (o variables de entorno con las mismas keys `token`, `dbank`, `strategyRouter`, `configManager`, `mockS1`).
- Montos/caps en Sepolia son reducidos por defecto; ajusta caps si necesitas depósitos mayores (ver `docs/SEED.md`).

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
