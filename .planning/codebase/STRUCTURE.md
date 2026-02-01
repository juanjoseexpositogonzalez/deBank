# Codebase Structure

**Analysis Date:** 2026-02-01

## Directory Layout

```
dBank/
├── contracts/                  # Solidity smart contracts (0.8.19)
│   ├── dBank.sol              # ERC4626 vault implementation
│   ├── StrategyRouter.sol      # Multi-strategy routing and allocation
│   ├── ConfigManager.sol       # Centralized configuration for all contracts
│   ├── MockS1.sol             # Mock yield-generating strategy #1
│   ├── Token.sol              # ERC20 token (USDC mock for testing)
│   └── openzeppelin/          # OpenZeppelin interface imports
├── src/                       # React frontend application
│   ├── components/            # React UI components
│   │   ├── App.js            # Root component, blockchain init, routing
│   │   ├── Navigation.js      # Navbar with wallet connection, chain selector
│   │   ├── Tabs.js           # Tab navigation between Deposit/Withdraw/Strategies/Charts
│   │   ├── Deposit.js        # Deposit form, balance display, x402 integration
│   │   ├── Withdraw.js       # Withdrawal form, strategy unallocation
│   │   ├── Strategies.js     # Strategy list, allocation UI, allocation history
│   │   ├── Charts.js         # Price per share, user vault value charts
│   │   ├── Alert.js          # Transaction status/error alert component
│   │   └── Loading.js        # Spinner component
│   ├── store/                 # Redux state management
│   │   ├── store.js          # Redux store configuration with all reducers
│   │   ├── interactions.js   # Thunk functions for contract interactions
│   │   └── reducers/          # Redux slices (createSlice)
│   │       ├── provider.js   # Wallet, network, chainId state
│   │       ├── tokens.js     # Token contracts and user balances
│   │       ├── dBank.js      # Vault contract, shares, deposit/withdraw status
│   │       ├── strategyRouter.js # Strategies, allocations, caps
│   │       ├── mockS1.js     # MockS1 strategy-specific state
│   │       ├── configManager.js # Configuration values (fees, caps, etc)
│   │       └── charts.js     # Chart data points for analytics
│   ├── hooks/                 # Custom React hooks
│   │   └── useDebounce.js    # Debouncing utility for input changes
│   ├── utils/                 # Utility functions
│   │   ├── format.js         # Number formatting, chain name, address truncation
│   │   └── x402Config.js     # x402 configuration and backend URL detection
│   ├── abis/                  # Contract ABIs (JSON)
│   │   ├── Token.json
│   │   ├── dBank.json
│   │   ├── StrategyRouter.json
│   │   ├── ConfigManager.json
│   │   └── MockS1.json
│   ├── assets/                # Static assets (images, logos)
│   ├── config.json           # Network configuration (contract addresses per chainId)
│   ├── index.js              # React entry point, Redux Provider setup
│   ├── index.css             # Global styles
│   └── reportWebVitals.js    # Performance metrics
├── backend/                   # x402 Payment Backend Service
│   ├── src/
│   │   ├── server.js         # Express app, health check, x402 middleware setup
│   │   ├── config.js         # Environment config (port, network, facilitator URL)
│   │   ├── routes/
│   │   │   └── deposit.js    # POST /api/x402/deposit endpoint
│   │   ├── services/
│   │   │   ├── dbank.js      # dBank contract interaction service
│   │   │   └── payment.js    # Payment processing service
│   │   └── utils/
│   │       ├── logger.js     # Logging utility
│   │       └── validation.js # Input validation for payment requests
│   └── package.json
├── facilitator/               # x402 Payment Facilitator Service
│   ├── src/
│   │   ├── server.js         # Express app, health check
│   │   ├── config.js         # Environment config
│   │   ├── routes/
│   │   │   └── verify.js     # POST /verify/transaction endpoint
│   │   ├── services/
│   │   │   ├── settlement.js # Settlement logic after payment
│   │   │   └── paymentVerifier.js # Payment verification against blockchain
│   │   └── utils/
│   │       ├── database.js   # SQLite database for transaction tracking
│   │       ├── eip3009.js    # EIP-3009 signature validation for transfers
│   │       └── logger.js     # Logging utility
│   └── package.json
├── test/                      # Test suite (Hardhat + Chai + Jest)
│   ├── unit/                  # Unit tests for contracts
│   │   ├── dBank.js          # dBank contract tests
│   │   ├── StrategyRouter.js # StrategyRouter tests
│   │   ├── ConfigManager.js  # ConfigManager tests
│   │   ├── MockS1.js         # MockS1 tests
│   │   ├── Token.js          # Token tests
│   │   ├── Facilitator.js    # Facilitator service tests
│   │   └── Backend.js        # Backend service tests
│   ├── integration/           # Integration tests (end-to-end flows)
│   │   ├── Flow.js           # Basic deposit and withdrawal flow
│   │   ├── WithdrawAfterAllocation.js # Withdraw with active allocations
│   │   ├── WithdrawCap.js    # Withdrawal cap boundary testing
│   │   ├── WithdrawWithAllocations.js # Complex withdrawal scenarios
│   │   ├── X402Flow.js       # x402 payment integration flow
│   │   └── X402EndToEnd.js   # Full x402 user flow
│   ├── helpers/
│   │   └── x402Helpers.js    # Test utilities for x402 scenarios
│   └── README_X402.md
├── scripts/                   # Deployment and utility scripts
│   ├── deploy.js             # Main deployment to localhost (Hardhat)
│   ├── deploy-sepolia.js     # Deployment to Sepolia testnet
│   ├── deploy-base-sepolia.js # Deployment to Base Sepolia
│   ├── seed.js               # Sample data setup (token transfers, approvals)
│   ├── advanceTime.js        # Time advancement for testing epochs
│   ├── syncAbis.js           # Copy contract ABIs from artifacts to src/abis
│   ├── check-*.js            # Diagnostic scripts (check balances, strategy state, etc)
│   └── start-x402.sh         # Shell script to start backend + facilitator services
├── docs/                      # Documentation and technical notes
│   ├── PROJECT_OVERVIEW.md
│   ├── TECHNICAL_DOCUMENTATION_dBank.md
│   ├── STRATEGIES.md          # Strategy documentation
│   ├── TESTING_STRATEGY.md    # Testing approach
│   ├── X402_OVERVIEW.md      # x402 payment protocol overview
│   ├── X402_IMPLEMENTATION_GUIDE.md
│   ├── X402_TESTING_GUIDE.md
│   ├── DEPLOY.md             # Deployment instructions
│   ├── SEED.md               # Seed data documentation
│   ├── CONTRACT_*.md         # Individual contract documentation
│   └── CodeReview/           # Code review notes and issues
├── artifacts/                 # Compiled contract artifacts (generated by Hardhat)
├── build/                    # React build output (generated)
├── coverage/                 # Test coverage reports (generated)
├── .env                      # Environment variables (secrets, RPC keys)
├── .env.example              # Example environment template
├── package.json              # Root-level dependencies (React, ethers, Redux)
├── hardhat.config.js         # Hardhat configuration (networks, solc version)
├── README.md                 # Project overview
└── .planning/codebase/       # GSD analysis documents (this directory)
    ├── ARCHITECTURE.md
    └── STRUCTURE.md
```

## Directory Purposes

**contracts/**
- Purpose: Core smart contract logic for DeFi vault system
- Contains: Solidity contract files (.sol)
- Key files: `dBank.sol` (main vault), `StrategyRouter.sol` (capital allocation)

**src/**
- Purpose: React frontend application code
- Contains: React components, Redux state, utilities, contract ABIs
- Key files: `index.js` (app entry), `components/App.js` (root component), `store/store.js` (state setup)

**src/components/**
- Purpose: Reusable React UI components
- Contains: Form components (Deposit, Withdraw), UI components (Navigation, Tabs, Charts)
- Pattern: Each component uses Redux hooks to read state and dispatch actions

**src/store/**
- Purpose: Centralized state management using Redux Toolkit
- Contains: Redux store config, action creators (reducers), and async thunks (interactions)
- Key file: `interactions.js` contains all contract interaction logic

**src/store/reducers/**
- Purpose: Individual Redux slices for domain-specific state
- Contains: One slice per contract/concern (provider, dBank, strategyRouter, etc)
- Pattern: Use createSlice from Redux Toolkit for minimal boilerplate

**backend/src/**
- Purpose: x402 payment gateway backend service
- Contains: Express routes for deposit payments, services for dBank integration
- Execution: `npm start` runs on port 4021 (default)

**facilitator/src/**
- Purpose: x402 payment verification and settlement
- Contains: Express routes for payment verification, SQLite database for tracking
- Execution: `npm start` runs on port 4022 (default)

**test/**
- Purpose: Comprehensive test coverage for contracts and services
- Contains: Unit tests (individual contracts), integration tests (user flows)
- Framework: Hardhat/Chai for contracts, Jest for backend services

**scripts/**
- Purpose: Deployment automation and diagnostic utilities
- Contains: Hardhat scripts for contract deployment, seed data, time manipulation
- Key files: `deploy.js` (main deployment), `seed.js` (test data), `syncAbis.js` (ABI copying)

**docs/**
- Purpose: Technical documentation and architecture notes
- Contains: Markdown documents on contracts, deployment, testing, x402 integration

## Key File Locations

**Entry Points:**
- `src/index.js`: React app entry point, mounts App component to DOM with Redux Provider
- `src/components/App.js`: Root component, orchestrates blockchain initialization, routes
- `backend/src/server.js`: Express backend server, x402 payment endpoints
- `facilitator/src/server.js`: Express facilitator server, payment verification endpoints

**Configuration:**
- `src/config.json`: Network-specific contract addresses (indexed by chainId: 31337, 84532, 11155111)
- `.env`: Environment variables (RPC URLs, private keys, API keys)
- `hardhat.config.js`: Hardhat configuration (networks, solc compiler, etherscan keys)

**Core Logic:**
- `contracts/dBank.sol`: ERC4626 vault implementation, deposit/withdraw, fee handling
- `src/store/interactions.js`: All blockchain interaction functions (load*, deposit*, withdraw*, allocate*)
- `src/store/reducers/dBank.js`: Vault-related Redux state (contract, shares, assets, tx status)
- `backend/src/services/dbank.js`: Backend service layer for vault operations
- `backend/src/routes/deposit.js`: HTTP endpoints for deposit requests

**Testing:**
- `test/unit/dBank.js`: Unit tests for vault contract
- `test/integration/Flow.js`: Basic deposit-withdraw flow test
- `test/integration/WithdrawAfterAllocation.js`: Complex allocation withdrawal test

**Utilities:**
- `src/utils/format.js`: Number formatting, chain detection, address truncation
- `src/utils/x402Config.js`: x402 backend URL detection and configuration
- `src/hooks/useDebounce.js`: Debouncing for input form changes
- `facilitator/src/utils/database.js`: SQLite database operations for payment tracking

## Naming Conventions

**Files:**
- React components: PascalCase, `.js` extension (e.g., `Deposit.js`, `App.js`)
- Utility files: camelCase, `.js` extension (e.g., `format.js`, `x402Config.js`)
- Contract files: camelCase, `.sol` extension (e.g., `dBank.sol`, `StrategyRouter.sol`)
- Test files: Same name as source with `.test.js` or directory-based (e.g., `test/unit/dBank.js`)
- Configuration: `config.js` or `config.json` (no prefix)

**Directories:**
- React components: PascalCase at root level (e.g., `components/`, `store/`)
- Feature-based subdirectories: camelCase (e.g., `reducers/`, `services/`, `routes/`)
- Test organization: By layer (unit/, integration/) and domain (dBank.js, StrategyRouter.js)

**Variables & Functions:**
- Exported Redux action creators: camelCase (e.g., `setAccount`, `depositSuccess`, `withdrawFail`)
- Exported thunk functions: camelCase, prefixed with action (e.g., `loadProvider`, `depositFunds`, `allocateToStrategy`)
- State object keys: camelCase (e.g., `isDepositing`, `totalAssets`, `userStrategyAllocations`)
- Constants: UPPER_SNAKE_CASE (e.g., `SCALE`, `MAX_BPS`, `SUPPORTED_CHAINS`)

## Where to Add New Code

**New Feature (e.g., new user action):**
- Primary code: `src/store/interactions.js` (add async function for blockchain call)
- Redux state: `src/store/reducers/{domain}.js` (add action creator for state change)
- Component: `src/components/{Feature}.js` (add form/UI)
- Contract: `contracts/{Contract}.sol` (add function if needed)
- Tests: `test/integration/{Feature}.js` (add integration test)

**New Component/Module:**
- Implementation: `src/components/{ComponentName}.js` (if UI) or `src/utils/{moduleName}.js` (if utility)
- Redux integration: Add selectors in `src/store/reducers/{domain}.js` if state is needed
- Tests: `test/unit/{ComponentName}.test.js` if complex logic, otherwise use integration tests

**Utilities:**
- Shared helpers: `src/utils/{helperName}.js` (e.g., `format.js`, `x402Config.js`)
- Custom hooks: `src/hooks/{hookName}.js` (e.g., `useDebounce.js`)
- Backend utilities: `backend/src/utils/{helperName}.js` (validation, logger, etc)

**Contracts:**
- New contract: `contracts/{ContractName}.sol`
- Deployment script: `scripts/deploy-{network}.js` for network-specific deployment
- Test: `test/unit/{ContractName}.js` for unit tests, `test/integration/{flow}.js` for flows

**Tests:**
- Unit: `test/unit/{ContractName}.js` for individual contract functions
- Integration: `test/integration/{FlowName}.js` for multi-step user journeys
- Helpers: `test/helpers/{helper}.js` for test utilities

## Special Directories

**artifacts/**
- Purpose: Compiled contract build artifacts and ABI files (from Hardhat compiler)
- Generated: Yes (by `npx hardhat compile`)
- Committed: No (ignored in .gitignore)
- Usage: ABIs copied to `src/abis/` by `scripts/syncAbis.js`

**build/**
- Purpose: Production React build output
- Generated: Yes (by `npm run build`)
- Committed: No (ignored in .gitignore)
- Usage: Served by web server in production

**coverage/**
- Purpose: Test coverage reports and metrics
- Generated: Yes (by test runner with coverage flag)
- Committed: No (ignored in .gitignore)
- Usage: Review in `coverage/index.html` for coverage analysis

**cache/**
- Purpose: Solidity compiler cache for faster compilation
- Generated: Yes (by Hardhat compiler)
- Committed: No (ignored in .gitignore)

**src/abis/**
- Purpose: Contract ABIs for frontend ethers.js integration
- Generated: Yes (from `scripts/syncAbis.js` which copies from artifacts)
- Committed: Yes (for reliable frontend builds without recompiling)
- Usage: Imported in `src/store/interactions.js` to instantiate ethers.Contract objects

---

*Structure analysis: 2026-02-01*
