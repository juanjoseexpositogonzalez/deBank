# Technology Stack

**Analysis Date:** 2026-02-01

## Languages

**Primary:**
- Solidity 0.8.19 - Smart contract development
- JavaScript (Node.js) - Backend services and deployment scripts
- JavaScript (React 18) - Frontend web application

**Secondary:**
- JSON - Configuration and ABI definitions

## Runtime

**Environment:**
- Node.js (implied by package.json and scripts)

**Package Manager:**
- npm
- Lockfile: Not detected (using package.json)

## Frameworks

**Core:**
- React 18.2.0 - Frontend UI framework
- Express 4.18.2 - Backend HTTP server (in `backend/` and `facilitator/`)

**Smart Contract Development:**
- Hardhat 2.28.3 - Smart contract compilation, testing, deployment
- @nomicfoundation/hardhat-toolbox 2.0.2 - Essential Hardhat plugins (ethers, Etherscan)

**State Management:**
- Redux Toolkit 1.8.4 - Frontend state management
- React-Redux 8.0.2 - Redux integration
- Redux-Thunk 2.4.1 - Async Redux middleware

**UI Component Libraries:**
- React-Bootstrap 2.4.0 - Bootstrap UI components
- Bootstrap 5.2.0 - CSS framework
- ApexCharts (via react-apexcharts 1.4.0) - Chart visualization
- React-Blockies 1.4.1 - Ethereum address avatars

**Testing:**
- Jest 29.5.0 - Unit/integration test runner
- Supertest 6.3.3 - HTTP assertion library
- React Testing Library 13.3.0 - React component testing
- React Testing Library Jest-DOM 5.16.4 - DOM matchers

**Build/Dev:**
- React-Scripts 5.0.1 - CRA build tooling
- Nodemon 2.0.20 - Development auto-reload
- TypeScript 4.9.5 - Type safety (overridden version)

## Key Dependencies

**Critical:**
- ethers.js 5.7.2 - Ethereum client library (RPC interaction, contract calls, signing)
- viem 1.0.0 - Alternative Ethereum client library (lightweight EVM abstraction)
- dotenv 16.0.0 - Environment variable management (used in all modules)

**Web3/Blockchain:**
- @x402/core 2.0.0 - x402 payment protocol core (payment verification)
- @x402/evm 2.0.0 - x402 EVM-specific implementation (ExactEvmScheme for Base network)
- @x402/express 2.0.0 - x402 Express middleware (payment processing)
- @x402/fetch 2.0.0 - x402 HTTP client utilities

**Infrastructure:**
- sqlite3 5.1.6 - Local database (payment recording in facilitator)
- cors 2.8.5 - CORS middleware for Express
- axios 1.13.2 - HTTP client for external requests
- lodash 4.17.21 - Utility functions
- reselect 4.1.6 - Redux selector memoization
- react-router-dom 6.3.0 - Client-side routing
- react-router-bootstrap 0.26.2 - Bootstrap router integration

## Configuration

**Environment:**
- `.env.example` in root - Main environment template
- `.env.example` in `backend/` - Backend service configuration
- `.env.example` in `facilitator/` - Facilitator service configuration
- `hardhat.config.js` - Hardhat network and etherscan configuration
- `src/config.json` - Contract addresses by network (31337, 84532, 11155111)

**Key configs required:**
- `ALCHEMY_API_KEY` - Alchemy RPC access (Ethereum Sepolia)
- `BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC endpoint (default: https://sepolia.base.org)
- `PRIVATE_KEYS` - Deployment signer private keys (colon-separated)
- `ETHERSCAN_API_KEY` - Etherscan contract verification
- `BASESCAN_API_KEY` - BaseScan contract verification

**Backend Service Config:**
- `PORT` (4021) - Backend service port
- `NETWORK` (eip155:84532) - x402 network identifier
- `FACILITATOR_URL` - x402 facilitator endpoint
- `DBANK_ADDRESS` - Deployed dBank vault address
- `TREASURY_WALLET` - Treasury account for deposits
- `TREASURY_PRIVATE_KEY` - Treasury signing key

**Facilitator Service Config:**
- `FACILITATOR_PORT` (4022) - Facilitator service port
- `USDC_ADDRESS` - USDC token address
- `DATABASE_PATH` (./facilitator.db) - SQLite database file
- `MAX_PAYMENT_AGE_SECONDS` (300) - Payment expiration window

**Build:**
- `tsconfig.json` - TypeScript configuration (overridden to 4.9.5)
- ESLint configuration in package.json (extends react-app)

## Platform Requirements

**Development:**
- Node.js with npm
- Hardhat (installed locally)
- Text editor/IDE supporting React and Solidity

**Production:**
- Ethereum/Base testnet RPC endpoint
- SQLite database (file-based, no external DB required)
- Node.js runtime for backend and facilitator services
- x402 facilitator running on network

**Networks Supported:**
- Local Hardhat network (31337) - Development/testing
- Ethereum Sepolia (11155111) - Testnet
- Base Sepolia (84532) - L2 testnet (primary testnet)

---

*Stack analysis: 2026-02-01*
