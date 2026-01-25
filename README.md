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
npx hardhat run scripts/seed.js --network localhost   # o sepolia
```

## 🌐 Frontend

```bash
npm run start
# Abre http://localhost:3000 y selecciona la red (Hardhat o Sepolia)
```

## 🧩 ABIs y sincronización
- Tras cambios en contratos, sincroniza los ABIs del frontend:
  - `npm run sync-abis`
- Si vas a usar el front con red local: `npm run frontend:start` (deploy + seed + start).

## 💧 Nota sobre un-allocate
- El `un-allocate` requiere liquidez en el `StrategyRouter`. Si el rendimiento es virtual (MockS1), el router debe tener balance suficiente para devolver la parte de yield.

## 💳 Integración x402 (En desarrollo)

dBank soporta aportes vía protocolo x402 de Coinbase para pagos on-chain automáticos.

### Componentes

- **Facilitador** (`facilitator/`): Servicio propio para verificación y liquidación de pagos
- **Backend x402** (`backend/`): API protegida por x402 para depósitos
- **Red**: Base Sepolia (84532) con USDC EIP-3009

### Documentación

- `docs/X402_OVERVIEW.md`: Introducción al protocolo x402
- `docs/X402_ARCHITECTURE.md`: Arquitectura y flujo del sistema
- `facilitator/README.md`: Guía del facilitador
- `backend/README.md`: Guía del backend

### Estado

✅ Configuración Base Sepolia  
✅ Facilitador propio implementado  
✅ Backend x402 implementado  
✅ Frontend integration completa  
✅ Tests unitarios y de integración implementados  

### Documentación de Testing

- `docs/X402_TESTING_GUIDE.md`: Guía completa para probar x402 en la DApp
- `test/README_X402.md`: Documentación de tests x402
- `test/unit/Facilitator.js`: Tests unitarios del facilitador
- `test/unit/Backend.js`: Tests unitarios del backend
- `test/integration/X402Flow.js`: Tests de integración del flujo x402
- `test/integration/X402EndToEnd.js`: Tests end-to-end (requiere servicios corriendo)

### Próximos pasos para probar

1. Instalar dependencias: `npm install` en raíz, `facilitator/` y `backend/`
2. Configurar variables de entorno (ver `.env.example` en cada directorio)
3. Desplegar contratos en Base Sepolia: `npx hardhat run scripts/deploy.js --network baseSepolia`
4. Iniciar servicios: `./scripts/start-x402.sh` (o manualmente)
5. Conectar wallet a Base Sepolia y probar depósito x402 desde la DApp

Ver `docs/X402_TESTING_GUIDE.md` para instrucciones detalladas.

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
