# Architecture

**Analysis Date:** 2026-02-01

## Pattern Overview

**Overall:** Multi-tier decentralized finance (DeFi) application with layered architecture separating smart contracts, backend services, and frontend presentation.

**Key Characteristics:**
- ERC4626 Vault pattern for deposit/withdrawal mechanisms
- Strategy Router pattern for multi-strategy capital allocation
- Redux state management for frontend state consistency
- Microservices backend (backend and facilitator) with x402 payment protocol support
- Event-driven contract interactions via ethers.js

## Layers

**Smart Contract Layer (Blockchain):**
- Purpose: Core vault logic, asset management, strategy routing, and configuration
- Location: `contracts/`
- Contains: Solidity contracts (dBank, StrategyRouter, ConfigManager, MockS1, Token)
- Depends on: OpenZeppelin standards (ERC20, ERC4626 interfaces)
- Used by: Frontend and backend services via contract ABIs

**Frontend Application Layer:**
- Purpose: User interface for deposits, withdrawals, strategy allocation, and analytics
- Location: `src/`
- Contains: React components, Redux state management, wallet integration
- Depends on: ethers.js for contract interaction, Redux Toolkit for state
- Used by: End users, interacts with Web3Provider (MetaMask/wallet)

**State Management Layer (Redux):**
- Purpose: Centralized state for blockchain data, user interactions, and contract state
- Location: `src/store/`
- Contains: Reducers (provider, tokens, dBank, strategyRouter, mockS1, configManager, charts)
- Depends on: ethers.js contract instances
- Used by: React components via useSelector/useDispatch hooks

**Business Logic Layer:**
- Purpose: Blockchain interactions (reading state, building transactions, handling approvals)
- Location: `src/store/interactions.js`
- Contains: Functions like loadProvider, loadBank, depositFunds, withdrawFunds, allocateToStrategy
- Depends on: ethers.js providers, contract ABIs in `src/abis/`
- Used by: React components and store middleware

**Backend Service Layer:**
- Purpose: x402 payment processing for deposits (alternative to direct wallet transactions)
- Location: `backend/src/`
- Contains: Express server with deposit routes, payment and dBank services
- Depends on: @x402/express, @x402/evm, ethers.js
- Used by: Frontend when initiating x402 deposits

**Facilitator Service Layer:**
- Purpose: Payment verification and settlement for x402 protocol
- Location: `facilitator/src/`
- Contains: Express server with verify routes, settlement and payment verification services
- Depends on: @x402/core, @x402/evm, sqlite3 for transaction tracking
- Used by: Backend service for payment confirmation

**Configuration Layer:**
- Purpose: Network-specific contract addresses and environment setup
- Location: `src/config.json`, `.env`, `hardhat.config.js`
- Contains: Contract addresses per network (31337, 84532, 11155111), RPC endpoints
- Depends on: Environment variables
- Used by: Contract loading functions, network detection

## Data Flow

**User Deposit Flow (Direct):**

1. User connects wallet via Navigation component
2. loadProvider creates ethers Web3Provider from window.ethereum
3. loadNetwork detects current chain and confirms support
4. loadTokens, loadBank, loadStrategyRouter initialize contract instances
5. loadBalances reads user's token balance and vault shares
6. User enters deposit amount in Deposit component
7. depositFunds executes token.approve() then dBank.deposit()
8. Redux updates depositing state (isDepositing → isSuccess → reset)
9. loadDepositors refreshes vault state post-transaction

**User Deposit Flow (x402 Payment Protocol):**

1. User enables x402 mode in Deposit component
2. depositViaX402 sends deposit request to backend service
3. Backend creates x402 payment intent with price and treasury wallet
4. Frontend initiates x402 payment transaction
5. Facilitator verifies payment on settlement window
6. Facilitator confirms payment, triggers backend deposit completion
7. Backend calls dBank.deposit() with x402-verified funds
8. Frontend receives confirmation via transaction hash

**Strategy Allocation Flow:**

1. User navigates to Strategies component
2. loadStrategyRouter loads registered strategies and their caps
3. loadUserStrategyAllocations reads user's current allocations
4. loadChartData aggregates strategy returns for charts
5. User selects strategy and amount
6. allocateToStrategy executes token.approve() then strategyRouter.allocate()
7. StrategyRouter transfers capital to strategy contract
8. Redux updates strategyRouter state with new allocations
9. Charts re-render with updated user allocation values

**Withdrawal with Strategy Unallocation:**

1. User enters amount in Withdraw component
2. withdrawFunds checks if user has allocations in strategies
3. unallocateFromStrategy executes strategyRouter.unallocate() for each strategy
4. Retrieved capital returned to dBank liquidity buffer
5. withdrawFunds then executes dBank.withdraw() with user's requested amount
6. Redux updates withdrawing state and refreshes depositors list

**State Management:**

- Redux store holds canonical state for all blockchain data
- Each component selects only needed state via useSelector
- Thunk-like functions (interactions.js exports) dispatch actions after contract reads
- Contract events are not subscribed to; state refreshed on user actions or chain change
- MetaMask chainChanged and accountsChanged events trigger full state reload

## Key Abstractions

**Contract Instance Pattern:**
- Purpose: Abstract ethers.Contract objects with ABI, address, and signer
- Examples: `Token`, `dBank`, `StrategyRouter`, `MockS1`, `ConfigManager`
- Pattern: Loaded once per network, stored in Redux, passed to interaction functions

**Strategy Entity:**
- Purpose: Represent individual yield-generating strategies
- Examples: MockS1 (strategy ID 1), MockS2/MockS3 (placeholders)
- Pattern: Registered in StrategyRouter with ID, cap, and pause state

**Vault Share Pattern:**
- Purpose: Represent user ownership in vault (similar to LP tokens)
- Pattern: ERC20-compatible shares minted on deposit, burned on withdrawal
- Calculation: shares = (assets * totalSupply) / totalAssets

**Price Per Share:**
- Purpose: Calculate conversion between assets (USDC) and shares
- Pattern: totalAssets / totalSupply
- Usage: Displays user vault value, validates withdrawal amounts

## Entry Points

**Frontend Entry Point:**
- Location: `src/index.js`
- Triggers: React app startup
- Responsibilities: Mounts React app with Redux Provider, initializes root DOM

**App Component Entry Point:**
- Location: `src/components/App.js`
- Triggers: React component mount
- Responsibilities: Orchestrates loadBlockchainData, registers MetaMask listeners, routes to tabs

**Blockchain Initialization:**
- Location: `src/store/interactions.js` - loadBlockchainData sequence
- Triggers: App component mount
- Responsibilities: Sets up provider, loads network, initializes contracts, loads balances

**Transaction Initiation:**
- Location: Various component handlers (onClickDeposit, onClickWithdraw, onClickAllocate)
- Triggers: User form submission
- Responsibilities: Validates input, calls interaction functions, monitors state for status

**Backend Entry Point:**
- Location: `backend/src/server.js`
- Triggers: npm start
- Responsibilities: Starts Express server, mounts x402 deposit route

**Facilitator Entry Point:**
- Location: `facilitator/src/server.js`
- Triggers: npm start
- Responsibilities: Initializes SQLite database, starts Express server, mounts verify routes

## Error Handling

**Strategy:** Multi-level error capture with user-friendly alerts

**Patterns:**

- **Smart Contract Errors:** Custom error types (dBank__CapExceeded, dBank__InsufficientLiquidity) caught in try-catch, mapped to Alert component messages
- **Network Errors:** loadBlockchainData wraps in try-catch, shows alert with troubleshooting steps (check Hardhat, check network, check deployment)
- **Chain Change Errors:** handleChainChanged in App.js catches and alerts user with error message
- **Account Change Errors:** handleAccountsChanged catches errors during balance reload, logs to console
- **Validation Errors:** Deposit/Withdraw components validate amount > 0, alert if invalid
- **Slippage Errors:** Withdrawal flow checks slippage vs maxSlippageBps, rejects if exceeded
- **Transaction Failures:** Redux tracks depositFail/withdrawFail states, displays error hash with explorer link

## Cross-Cutting Concerns

**Logging:**
- Frontend: console.error in try-catch blocks, limited observability
- Backend: `backend/src/utils/logger.js` for server events
- Facilitator: `facilitator/src/utils/logger.js` for payment verification events

**Validation:**
- Frontend: Client-side input validation (non-zero amounts, number parsing)
- Smart Contracts: Require statements and custom errors (zero address, cap exceeded, paused)
- Backend: `backend/src/utils/validation.js` for payment request validation

**Authentication:**
- Frontend: MetaMask-based wallet authentication (no user accounts)
- Contracts: Owner-only functions use modifier onlyOwner()
- Backend: x402 payment protocol validates signed transactions (scope limited)

---

*Architecture analysis: 2026-02-01*
