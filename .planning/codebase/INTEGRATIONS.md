# External Integrations

**Analysis Date:** 2026-02-01

## APIs & External Services

**Ethereum RPC Providers:**
- Alchemy (Ethereum Sepolia)
  - SDK/Client: ethers.js 5.7.2
  - Auth: `ALCHEMY_API_KEY` env var
  - Usage: Network RPC for Sepolia testnet
  - Endpoint: `https://eth-sepolia.g.alchemy.com/v2/{ALCHEMY_API_KEY}`

- Base Sepolia RPC
  - SDK/Client: ethers.js 5.7.2
  - Auth: None (public endpoint)
  - Usage: Primary testnet RPC
  - Endpoint: `https://sepolia.base.org` (configurable via `BASE_SEPOLIA_RPC_URL`)

**x402 Payment Protocol:**
- x402 Core Framework
  - Packages: @x402/core, @x402/evm, @x402/express
  - Usage: Micropayment verification and settlement for deposits
  - Architecture: Facilitator pattern with resource server
  - Network: `eip155:84532` (Base Sepolia)

**Contract Verification:**
- Etherscan API
  - Client: Hardhat etherscan plugin
  - Auth: `ETHERSCAN_API_KEY` env var
  - Usage: Contract source code verification

- BaseScan API
  - Client: Hardhat with custom chain config
  - Auth: `BASESCAN_API_KEY` or fallback to `ETHERSCAN_API_KEY`
  - Endpoint: `https://api-sepolia.basescan.org/api`
  - Browser: `https://sepolia.basescan.org`

## Data Storage

**Databases:**
- SQLite 5.1.6
  - Connection: File-based (`DATABASE_PATH` env var, default: `./facilitator.db`)
  - Client: sqlite3 npm package
  - Location: `facilitator/src/utils/database.js`
  - Tables: `payments` (payment tracking and idempotency)
  - Schema: id (TEXT), payment_request (TEXT), tx_hash (TEXT), amount (TEXT), from_address (TEXT), to_address (TEXT), timestamp (INTEGER)
  - Indexes: tx_hash, timestamp

**File Storage:**
- Local filesystem only
  - Contract ABIs stored in `src/abis/` as JSON files
  - Configuration stored in `src/config.json`

**Caching:**
- Redux state (frontend in-memory)
- No external caching service

## Authentication & Identity

**Auth Provider:**
- Custom wallet-based authentication
  - Implementation: Ethers.js wallet signing
  - Backend: `backend/src/services/dbank.js` uses Treasury wallet for deposits
  - Treasury signer created from private key: `new ethers.Wallet(config.treasuryPrivateKey, provider)`
  - x402 Payment signing for payment verification

**Wallet Integration:**
- Frontend: MetaMask or Web3 provider injection expected
- Backend: Treasury wallet (configured via `TREASURY_PRIVATE_KEY`)
- Facilitator: EIP-3009 signature verification (`facilitator/src/utils/eip3009.js`)

## Monitoring & Observability

**Error Tracking:**
- Not detected - Basic error logging only

**Logs:**
- Custom logger module (`backend/src/utils/logger.js`, `facilitator/src/utils/logger.js`)
- Console output for development
- No centralized logging service detected

## CI/CD & Deployment

**Hosting:**
- Ethereum/Base testnet blockchain
- Backend: Self-hosted Node.js required
- Facilitator: Self-hosted Node.js required
- Frontend: Client-side React app (CRA static build)

**CI Pipeline:**
- Not detected - Manual deployment via hardhat scripts

**Deployment Scripts:**
- `scripts/deploy.js` - Local/Hardhat deployment
- `scripts/deploy-sepolia.js` - Ethereum Sepolia deployment
- `scripts/deploy-base-sepolia.js` - Base Sepolia deployment
- `scripts/seed.js` - Network initialization
- All use Hardhat runtime environment (hre)

## Environment Configuration

**Required env vars (Root):**
```
TOKEN_ADDRESS              # Deployed token address
DBANK_ADDRESS             # Deployed dBank vault
STRATEGY_ROUTER_ADDRESS   # Strategy router address
CONFIG_MANAGER_ADDRESS    # Config manager address
STRATEGY_MOCKS1_ADDRESS   # Mock strategy S1 address
ETHERSCAN_API_KEY         # For Etherscan verification
PRIVATE_KEYS              # Deployment signers (colon-separated)
ALCHEMY_API_KEY           # Alchemy RPC access
BASE_SEPOLIA_RPC_URL      # Base Sepolia RPC (optional, has default)
```

**Required env vars (Backend):**
```
PORT=4021
FACILITATOR_URL=http://localhost:4022
NETWORK=eip155:84532
TREASURY_WALLET=0x...
TREASURY_PRIVATE_KEY=0x...
DBANK_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MIN_DEPOSIT_USD=1.00
MAX_DEPOSIT_USD=10000.00
```

**Required env vars (Facilitator):**
```
FACILITATOR_PORT=4022
NETWORK=eip155:84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
DATABASE_PATH=./facilitator.db
MAX_PAYMENT_AGE_SECONDS=300
```

**Secrets location:**
- `.env` files (local development)
- Environment variables at deployment

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- x402 payment callbacks from facilitator to backend
- Settlement notifications (internal service-to-service)

## Smart Contract Interactions

**Primary Contracts:**
- Token (ERC-20 mock)
  - Address: Network-specific (see `src/config.json`)
  - Used for: Vault asset (USDC)

- dBank (ERC-4626 Vault)
  - Location: `contracts/dBank.sol`
  - ABI: `src/abis/dBank.json`
  - Methods called: deposit(assets, receiver), withdraw(shares, receiver, owner), approve()
  - Used by: `src/store/interactions.js`, `backend/src/services/dbank.js`

- StrategyRouter
  - Location: `contracts/StrategyRouter.sol`
  - ABI: `src/abis/StrategyRouter.json`
  - Used for: Allocating deposits to yield strategies

- ConfigManager
  - Location: `contracts/ConfigManager.sol`
  - ABI: `src/abis/ConfigManager.json`
  - Used for: Global vault configuration (caps, fees, settings)

- MockS1 (Test Strategy)
  - Location: `contracts/MockS1.sol`
  - ABI: `src/abis/MockS1.json`
  - Used for: Testing yield strategy behavior

## Payment Flow Integration

**x402 Payment Pipeline:**
1. Frontend initiates deposit through x402 backend (`backend/src/routes/deposit.js`)
2. x402 payment verification via facilitator (`facilitator/src/services/paymentVerifier.js`)
3. Payment signature verified using EIP-3009 (`facilitator/src/utils/eip3009.js`)
4. Treasury wallet executes dBank deposit transaction
5. Payment recorded in SQLite for idempotency (`facilitator/src/utils/database.js`)
6. Settlement service processes balance updates (`facilitator/src/services/settlement.js`)

---

*Integration audit: 2026-02-01*
