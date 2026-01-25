# x402 DApp Implementation Guide

## Complete Integration for Hardhat + React + Redux Stack

### Table of Contents

1. [Project Structure](#project-structure)
2. [Smart Contract Integration](#smart-contract-integration)
3. [Backend API Implementation](#backend-api-implementation)
4. [Frontend React-Redux Integration](#frontend-react-redux-integration)
5. [Custom Facilitator Development](#custom-facilitator-development)
6. [Onramp Service Implementation](#onramp-service-implementation)
7. [Testing Strategy](#testing-strategy)
8. [Production Deployment](#production-deployment)
9. [Monitoring and Analytics](#monitoring-and-analytics)
10. [Advanced Features](#advanced-features)

---

## Project Structure

### Recommended Directory Layout

```
your-dapp/
├── packages/
│   ├── contracts/                 # Hardhat project
│   │   ├── contracts/
│   │   │   ├── VaultX402.sol     # Your vault with x402 integration
│   │   │   ├── X402Facilitator.sol # Custom facilitator contract
│   │   │   └── interfaces/
│   │   ├── scripts/
│   │   ├── test/
│   │   └── hardhat.config.js
│   │
│   ├── backend/                   # Express API server
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── x402.js       # x402 payment endpoints
│   │   │   │   ├── vault.js      # Vault operations
│   │   │   │   └── onramp.js     # Fiat onramp service
│   │   │   ├── middleware/
│   │   │   │   ├── x402Payment.js
│   │   │   │   └── auth.js
│   │   │   ├── services/
│   │   │   │   ├── facilitator.js
│   │   │   │   ├── onramp.js     # Fiat-to-crypto bridge
│   │   │   │   └── vault.js
│   │   │   └── server.js
│   │   ├── package.json
│   │   └── .env
│   │
│   ├── frontend/                  # React application
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── wallet/
│   │   │   │   ├── vault/
│   │   │   │   ├── payments/
│   │   │   │   └── onramp/       # Fiat payment interface
│   │   │   ├── store/            # Redux store
│   │   │   │   ├── slices/
│   │   │   │   │   ├── wallet.js
│   │   │   │   │   ├── vault.js
│   │   │   │   │   ├── x402.js
│   │   │   │   │   └── onramp.js
│   │   │   │   └── index.js
│   │   │   ├── utils/
│   │   │   │   ├── x402Client.js
│   │   │   │   ├── contracts.js
│   │   │   │   └── onrampClient.js
│   │   │   └── App.js
│   │   └── package.json
│   │
│   └── facilitator/               # Custom facilitator service
│       ├── src/
│       │   ├── facilitator.js
│       │   ├── onrampBridge.js   # Fiat-crypto bridge
│       │   └── config.js
│       └── package.json
│
├── package.json                   # Workspace configuration
└── README.md
```

---

## Smart Contract Integration

### Vault with x402 Integration

```solidity
// contracts/VaultX402.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VaultX402 is ReentrancyGuard, Ownable {
    IERC20 public immutable usdc;
    
    struct UserDeposit {
        uint256 principal;
        uint256 yieldBalance;
        uint256 totalDeposited;
        uint256 lastUpdate;
    }
    
    struct X402Config {
        uint256 monthlyLimit;     // Monthly spending limit for x402 services
        uint256 usedThisMonth;    // Amount used this month
        uint256 lastReset;        // Last time monthly counter was reset
        bool enabled;             // Is x402 spending enabled
        address[] authorizedServices; // Approved services
    }
    
    mapping(address => UserDeposit) public deposits;
    mapping(address => X402Config) public x402Configs;
    mapping(address => bool) public facilitators; // Authorized facilitators
    
    // Strategy contracts for yield generation
    mapping(uint256 => address) public strategies;
    uint256 public strategyCount;
    
    event DepositMade(address indexed user, uint256 amount);
    event X402SpendingEnabled(address indexed user, uint256 monthlyLimit);
    event X402Payment(address indexed user, address indexed service, uint256 amount);
    event YieldDistributed(address indexed user, uint256 amount);
    
    modifier onlyFacilitator() {
        require(facilitators[msg.sender], "Not authorized facilitator");
        _;
    }
    
    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }
    
    // =================
    // Deposit Functions
    // =================
    
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        UserDeposit storage userDeposit = deposits[msg.sender];
        userDeposit.principal += amount;
        userDeposit.totalDeposited += amount;
        userDeposit.lastUpdate = block.timestamp;
        
        // Invest in yield strategies
        _investInStrategies(amount);
        
        emit DepositMade(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external nonReentrant {
        UserDeposit storage userDeposit = deposits[msg.sender];
        require(amount <= userDeposit.principal, "Insufficient principal");
        
        userDeposit.principal -= amount;
        
        // Withdraw from strategies if needed
        _withdrawFromStrategies(amount);
        
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
    }
    
    // ==================
    // x402 Integration
    // ==================
    
    function enableX402Spending(
        uint256 monthlyLimit,
        address[] calldata authorizedServices
    ) external {
        x402Configs[msg.sender] = X402Config({
            monthlyLimit: monthlyLimit,
            usedThisMonth: 0,
            lastReset: block.timestamp,
            enabled: true,
            authorizedServices: authorizedServices
        });
        
        emit X402SpendingEnabled(msg.sender, monthlyLimit);
    }
    
    function spendYieldForX402(
        address user,
        address service,
        uint256 amount
    ) external onlyFacilitator returns (bool) {
        X402Config storage config = x402Configs[user];
        require(config.enabled, "x402 spending not enabled");
        
        // Reset monthly counter if needed
        if (block.timestamp >= config.lastReset + 30 days) {
            config.usedThisMonth = 0;
            config.lastReset = block.timestamp;
        }
        
        require(config.usedThisMonth + amount <= config.monthlyLimit, "Monthly limit exceeded");
        
        // Check if service is authorized
        bool serviceAuthorized = false;
        for (uint i = 0; i < config.authorizedServices.length; i++) {
            if (config.authorizedServices[i] == service) {
                serviceAuthorized = true;
                break;
            }
        }
        require(serviceAuthorized, "Service not authorized");
        
        UserDeposit storage userDeposit = deposits[user];
        require(userDeposit.yieldBalance >= amount, "Insufficient yield");
        
        // Update balances
        userDeposit.yieldBalance -= amount;
        config.usedThisMonth += amount;
        
        // Transfer USDC to facilitator
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        
        emit X402Payment(user, service, amount);
        return true;
    }
    
    // ===================
    // Yield Management
    // ===================
    
    function updateYield(address user) external {
        uint256 newYield = _calculateYield(user);
        if (newYield > 0) {
            deposits[user].yieldBalance += newYield;
            deposits[user].lastUpdate = block.timestamp;
            emit YieldDistributed(user, newYield);
        }
    }
    
    function _calculateYield(address user) internal view returns (uint256) {
        UserDeposit storage userDeposit = deposits[user];
        uint256 timeElapsed = block.timestamp - userDeposit.lastUpdate;
        
        // Simple 5% APY calculation (in production, use actual strategy returns)
        uint256 annualYield = (userDeposit.principal * 5) / 100;
        uint256 yieldEarned = (annualYield * timeElapsed) / 365 days;
        
        return yieldEarned;
    }
    
    function _investInStrategies(uint256 amount) internal {
        // Implement your actual yield strategies here
        // For now, just keep USDC in contract
    }
    
    function _withdrawFromStrategies(uint256 amount) internal {
        // Implement withdrawal from yield strategies
    }
    
    // ===================
    // Admin Functions
    // ===================
    
    function addFacilitator(address facilitator) external onlyOwner {
        facilitators[facilitator] = true;
    }
    
    function removeFacilitator(address facilitator) external onlyOwner {
        facilitators[facilitator] = false;
    }
    
    function addStrategy(address strategy) external onlyOwner {
        strategies[strategyCount] = strategy;
        strategyCount++;
    }
}
```

### Custom Facilitator Contract

```solidity
// contracts/X402Facilitator.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IVaultX402.sol";

contract X402Facilitator {
    IVaultX402 public vault;
    mapping(bytes32 => bool) public processedPayments;
    
    event PaymentProcessed(
        address indexed user,
        address indexed service,
        uint256 amount,
        bytes32 indexed paymentHash
    );
    
    constructor(address _vault) {
        vault = IVaultX402(_vault);
    }
    
    function processX402Payment(
        address user,
        address service,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external returns (bool) {
        bytes32 paymentHash = keccak256(abi.encodePacked(
            user, service, amount, nonce
        ));
        
        require(!processedPayments[paymentHash], "Payment already processed");
        
        // Verify signature (implement EIP-712 verification)
        require(_verifySignature(user, service, amount, nonce, signature), "Invalid signature");
        
        // Process payment through vault
        bool success = vault.spendYieldForX402(user, service, amount);
        require(success, "Payment failed");
        
        processedPayments[paymentHash] = true;
        
        emit PaymentProcessed(user, service, amount, paymentHash);
        return true;
    }
    
    function _verifySignature(
        address user,
        address service,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) internal pure returns (bool) {
        // Implement EIP-712 signature verification
        // This is a simplified version
        return true; // TODO: Implement actual verification
    }
}
```

---

## Backend API Implementation

### Express Server with x402 Middleware

```javascript
// backend/src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { paymentMiddleware } from '@x402/express';
import { vaultRoutes } from './routes/vault.js';
import { onrampRoutes } from './routes/onramp.js';
import { x402Routes } from './routes/x402.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// x402 payment middleware for protected endpoints
app.use('/api/premium', paymentMiddleware({
  "GET /ai-analysis": {
    accepts: [{
      network: "eip155:8453",
      asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bdd3e3d",
      amount: "10000000", // $0.10
      scheme: "exact"
    }],
    description: "AI-powered analysis service"
  },
  "POST /rag-query": {
    accepts: [{
      network: "eip155:8453", 
      asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bdd3e3d",
      amount: "5000000", // $0.05
      scheme: "exact"
    }],
    description: "RAG document query"
  },
  "POST /heavy-computation": {
    accepts: [{
      network: "eip155:8453",
      asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bdd3e3d",
      amount: "100000000", // $1.00 max
      scheme: "upto"
    }],
    description: "Heavy computational task"
  }
}, {
  facilitator: { url: process.env.CUSTOM_FACILITATOR_URL || "https://x402.cdp.coinbase.com" }
}));

// Routes
app.use('/api/vault', vaultRoutes);
app.use('/api/onramp', onrampRoutes);
app.use('/api/x402', x402Routes);

// Protected endpoints
app.get('/api/premium/ai-analysis', (req, res) => {
  // Your AI analysis logic
  res.json({ 
    analysis: "AI analysis results...",
    timestamp: Date.now(),
    cost: 0.10
  });
});

app.post('/api/premium/rag-query', async (req, res) => {
  const { query, documentId } = req.body;
  
  // Your RAG logic here
  const results = await performRAGQuery(query, documentId);
  
  res.json({
    query,
    results,
    documentId,
    cost: 0.05
  });
});

app.post('/api/premium/heavy-computation', async (req, res) => {
  const { task, parameters } = req.body;
  
  // Start heavy computation
  const jobId = generateJobId();
  
  // Return job ID immediately (for deferred payment)
  res.json({
    jobId,
    status: 'processing',
    estimatedCost: 1.00,
    estimatedTime: '5-10 minutes'
  });
  
  // Process in background
  processHeavyComputation(jobId, task, parameters);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

### Vault API Routes

```javascript
// backend/src/routes/vault.js
import express from 'express';
import { vaultService } from '../services/vault.js';

const router = express.Router();

// Get user vault information
router.get('/info/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const vaultInfo = await vaultService.getUserInfo(address);
    res.json(vaultInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable x402 spending
router.post('/enable-x402', async (req, res) => {
  try {
    const { userAddress, monthlyLimit, authorizedServices } = req.body;
    
    const result = await vaultService.enableX402Spending(
      userAddress,
      monthlyLimit,
      authorizedServices
    );
    
    res.json({ success: true, txHash: result.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get x402 spending status
router.get('/x402-status/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const status = await vaultService.getX402Status(address);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update yield for user
router.post('/update-yield', async (req, res) => {
  try {
    const { userAddress } = req.body;
    const result = await vaultService.updateYield(userAddress);
    res.json({ success: true, newYield: result.newYield });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as vaultRoutes };
```

---

## Frontend React-Redux Integration

### Redux Store Setup

```javascript
// frontend/src/store/index.js
import { configureStore } from '@reduxjs/toolkit';
import walletSlice from './slices/wallet';
import vaultSlice from './slices/vault';
import x402Slice from './slices/x402';
import onrampSlice from './slices/onramp';

export const store = configureStore({
  reducer: {
    wallet: walletSlice,
    vault: vaultSlice,
    x402: x402Slice,
    onramp: onrampSlice
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['wallet/connect/fulfilled'],
        ignoredPaths: ['wallet.provider']
      }
    })
});
```

### Wallet Redux Slice

```javascript
// frontend/src/store/slices/wallet.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';

// Async thunk for wallet connection
export const connectWallet = createAsyncThunk(
  'wallet/connect',
  async () => {
    if (!window.ethereum) {
      throw new Error('No wallet detected');
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    const walletClient = createWalletClient({
      chain: base,
      transport: custom(window.ethereum)
    });

    const addresses = await walletClient.getAddresses();
    
    return {
      client: walletClient,
      address: addresses[0],
      isConnected: true
    };
  }
);

const walletSlice = createSlice({
  name: 'wallet',
  initialState: {
    client: null,
    address: null,
    isConnected: false,
    loading: false,
    error: null
  },
  reducers: {
    disconnect: (state) => {
      state.client = null;
      state.address = null;
      state.isConnected = false;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(connectWallet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(connectWallet.fulfilled, (state, action) => {
        state.loading = false;
        state.client = action.payload.client;
        state.address = action.payload.address;
        state.isConnected = action.payload.isConnected;
      })
      .addCase(connectWallet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  }
});

export const { disconnect, clearError } = walletSlice.actions;
export default walletSlice.reducer;
```

### x402 Redux Slice

```javascript
// frontend/src/store/slices/x402.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createX402Client } from '../../utils/x402Client';

// Async thunk for making x402 payments
export const makeX402Payment = createAsyncThunk(
  'x402/makePayment',
  async ({ endpoint, data }, { getState }) => {
    const { wallet } = getState();
    
    if (!wallet.isConnected) {
      throw new Error('Wallet not connected');
    }

    const payingFetch = createX402Client(wallet.client);
    
    const response = await payingFetch(endpoint, {
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      throw new Error(`Payment failed: ${response.statusText}`);
    }

    return await response.json();
  }
);

const x402Slice = createSlice({
  name: 'x402',
  initialState: {
    payments: [],
    loading: false,
    error: null,
    totalSpent: 0
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    resetPayments: (state) => {
      state.payments = [];
      state.totalSpent = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(makeX402Payment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(makeX402Payment.fulfilled, (state, action) => {
        state.loading = false;
        state.payments.push({
          id: Date.now(),
          endpoint: action.meta.arg.endpoint,
          cost: action.payload.cost || 0,
          result: action.payload,
          timestamp: Date.now()
        });
        state.totalSpent += action.payload.cost || 0;
      })
      .addCase(makeX402Payment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  }
});

export const { clearError, resetPayments } = x402Slice.actions;
export default x402Slice.reducer;
```

### x402 Client Utility

```javascript
// frontend/src/utils/x402Client.js
import { x402Fetch } from '@x402/fetch';

export const createX402Client = (walletClient) => {
  return x402Fetch(fetch, {
    walletClient: walletClient,
    network: 'eip155:8453', // Base mainnet
    onPaymentRequired: (requirements) => {
      console.log('Payment required:', requirements);
      // Optional: Show payment confirmation UI
    },
    onPaymentSuccess: (receipt) => {
      console.log('Payment successful:', receipt);
      // Optional: Show success notification
    },
    onPaymentError: (error) => {
      console.error('Payment failed:', error);
      // Optional: Show error notification
    }
  });
};

export const estimateX402Cost = async (endpoint) => {
  try {
    // Make a HEAD request to get payment requirements without triggering payment
    const response = await fetch(endpoint, { method: 'HEAD' });
    
    if (response.status === 402) {
      const requirements = JSON.parse(response.headers.get('X-Payment-Requirements'));
      return parseFloat(requirements.accepts[0].amount) / 1000000; // Convert to dollars
    }
    
    return 0; // Free endpoint
  } catch (error) {
    console.error('Error estimating cost:', error);
    return null;
  }
};
```

### React Components

```jsx
// frontend/src/components/payments/X402PaymentButton.jsx
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { makeX402Payment } from '../../store/slices/x402';
import { estimateX402Cost } from '../../utils/x402Client';

const X402PaymentButton = ({ endpoint, data, children, onSuccess }) => {
  const dispatch = useDispatch();
  const { loading } = useSelector(state => state.x402);
  const [estimatedCost, setEstimatedCost] = useState(null);

  React.useEffect(() => {
    estimateX402Cost(endpoint).then(setEstimatedCost);
  }, [endpoint]);

  const handlePayment = async () => {
    try {
      const result = await dispatch(makeX402Payment({ endpoint, data })).unwrap();
      if (onSuccess) onSuccess(result);
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
    >
      {loading ? (
        'Processing Payment...'
      ) : (
        <>
          {children}
          {estimatedCost && (
            <span className="ml-2 text-sm opacity-75">
              (${estimatedCost.toFixed(2)})
            </span>
          )}
        </>
      )}
    </button>
  );
};

export default X402PaymentButton;
```

```jsx
// frontend/src/components/vault/VaultDashboard.jsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { enableX402Spending, getVaultInfo } from '../../store/slices/vault';

const VaultDashboard = () => {
  const dispatch = useDispatch();
  const { wallet } = useSelector(state => state.wallet);
  const { vaultInfo, x402Config } = useSelector(state => state.vault);

  React.useEffect(() => {
    if (wallet.address) {
      dispatch(getVaultInfo(wallet.address));
    }
  }, [wallet.address, dispatch]);

  const handleEnableX402 = () => {
    dispatch(enableX402Spending({
      monthlyLimit: '50000000', // $50
      authorizedServices: [
        process.env.REACT_APP_API_BASE_URL + '/api/premium/ai-analysis',
        process.env.REACT_APP_API_BASE_URL + '/api/premium/rag-query'
      ]
    }));
  };

  if (!vaultInfo) return <div>Loading vault info...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Vault Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Principal Balance */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700">Principal Balance</h3>
          <p className="text-3xl font-bold text-green-600">
            ${(vaultInfo.principal / 1000000).toFixed(2)}
          </p>
        </div>

        {/* Yield Balance */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700">Available Yield</h3>
          <p className="text-3xl font-bold text-blue-600">
            ${(vaultInfo.yieldBalance / 1000000).toFixed(2)}
          </p>
        </div>

        {/* x402 Status */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700">x402 Auto-Pay</h3>
          {x402Config.enabled ? (
            <div>
              <p className="text-green-600 font-medium">✓ Enabled</p>
              <p className="text-sm text-gray-600">
                ${((x402Config.monthlyLimit - x402Config.usedThisMonth) / 1000000).toFixed(2)} remaining this month
              </p>
            </div>
          ) : (
            <div>
              <p className="text-red-600 font-medium">✗ Disabled</p>
              <button
                onClick={handleEnableX402}
                className="mt-2 bg-blue-500 text-white px-4 py-2 rounded text-sm"
              >
                Enable Auto-Pay
              </button>
            </div>
          )}
        </div>
      </div>

      {/* x402 Services */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Premium Services</h2>
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold">AI Analysis Service</h3>
            <p className="text-gray-600 mb-4">Get AI-powered insights and analysis</p>
            <X402PaymentButton
              endpoint="/api/premium/ai-analysis"
              onSuccess={(result) => console.log('Analysis result:', result)}
            >
              Run AI Analysis
            </X402PaymentButton>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold">RAG Document Query</h3>
            <p className="text-gray-600 mb-4">Query your document knowledge base</p>
            <X402PaymentButton
              endpoint="/api/premium/rag-query"
              data={{ query: "What is the main topic?", documentId: "doc1" }}
              onSuccess={(result) => console.log('RAG result:', result)}
            >
              Query Documents
            </X402PaymentButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultDashboard;
```

---

## Custom Facilitator Development

### Facilitator Server

```javascript
// facilitator/src/facilitator.js
import express from 'express';
import cors from 'cors';
import { verifyPayment, settlePayment } from '@x402/core';
import { EVMSigner } from '@x402/evm';
import { onrampBridge } from './onrampBridge.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Store for tracking payments
const paymentStore = new Map();

// Verify payment signature and requirements
app.post('/verify', async (req, res) => {
  try {
    const { payment, signature } = req.body;
    
    console.log('Verifying payment:', payment);
    
    // Use x402 core utilities for verification
    const result = await verifyPayment(payment, signature, {
      network: payment.network
    });
    
    if (result.valid) {
      // Store payment for settlement
      const paymentId = generatePaymentId(payment);
      paymentStore.set(paymentId, { payment, signature, verified: true });
    }
    
    res.json({ 
      valid: result.valid,
      paymentId: result.valid ? generatePaymentId(payment) : null
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(400).json({ 
      valid: false, 
      error: error.message 
    });
  }
});

// Settle payment on blockchain
app.post('/settle', async (req, res) => {
  try {
    const { payment, paymentId } = req.body;
    
    const storedPayment = paymentStore.get(paymentId);
    if (!storedPayment || !storedPayment.verified) {
      throw new Error('Payment not found or not verified');
    }
    
    // Check if this is a vault payment
    if (payment.metadata?.useVault) {
      // Use vault's spendYieldForX402 function
      const txHash = await settleVaultPayment(payment);
      res.json({ settled: true, transactionHash: txHash });
    } 
    // Check if this is an onramp payment
    else if (payment.metadata?.useOnramp) {
      // Process through fiat onramp
      const result = await onrampBridge.processPayment(payment);
      res.json({ settled: true, onrampTransactionId: result.id });
    }
    // Standard crypto payment
    else {
      const signer = new EVMSigner(process.env.FACILITATOR_PRIVATE_KEY);
      const result = await settlePayment(payment, signer);
      res.json({ settled: true, transactionHash: result.transactionHash });
    }
    
    // Clean up
    paymentStore.delete(paymentId);
    
  } catch (error) {
    console.error('Settlement error:', error);
    res.status(500).json({ 
      settled: false, 
      error: error.message 
    });
  }
});

// Get supported networks and assets
app.get('/supported', (req, res) => {
  res.json({
    networks: [
      "eip155:8453", // Base mainnet
      "eip155:84532", // Base Sepolia (testnet)
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" // Solana mainnet
    ],
    assets: [
      "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bdd3e3d", // USDC on Base
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl-token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC on Solana
    ],
    schemes: ["exact", "upto", "deferred"],
    features: ["vault_payments", "onramp_payments", "session_based"]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// Vault-specific settlement
async function settleVaultPayment(payment) {
  // Connect to your vault contract
  const vaultContract = new ethers.Contract(
    process.env.VAULT_CONTRACT_ADDRESS,
    VAULT_ABI,
    new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, provider)
  );
  
  const tx = await vaultContract.spendYieldForX402(
    payment.user,
    payment.service,
    payment.amount
  );
  
  await tx.wait();
  return tx.hash;
}

function generatePaymentId(payment) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'uint256'],
      [payment.recipient, payment.amount, payment.deadline, payment.nonce]
    )
  );
}

app.listen(PORT, () => {
  console.log(`🔧 Custom facilitator running on port ${PORT}`);
});
```

---

## Onramp Service Implementation

### Concept: Fiat-to-x402 Bridge

The onramp service allows users without crypto to access x402 services by paying with fiat (credit/debit cards). The service handles fiat collection and internally converts to USDC for x402 settlement.

```mermaid
graph LR
    A[User with Credit Card] --> B[Onramp Service]
    B --> C[Stripe/PayPal Payment]
    B --> D[Fiat to USDC Conversion]
    D --> E[x402 Service]
    E --> F[Deliver Content/Service]
    
    style A fill:#e8f5e8
    style B fill:#fff3e0
    style C fill:#f3e5f5
    style E fill:#e1f5fe
```

### Onramp Service Architecture

```javascript
// facilitator/src/onrampBridge.js
import Stripe from 'stripe';
import axios from 'axios';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class OnrampBridge {
  constructor() {
    this.exchangeRates = new Map();
    this.updateExchangeRates();
    
    // Update rates every 5 minutes
    setInterval(() => this.updateExchangeRates(), 5 * 60 * 1000);
  }
  
  async updateExchangeRates() {
    try {
      // Get USD to USDC rate (usually 1:1, but may have small spread)
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd');
      this.exchangeRates.set('USD_USDC', response.data['usd-coin'].usd);
    } catch (error) {
      console.error('Failed to update exchange rates:', error);
    }
  }
  
  async createPaymentIntent(amount, currency = 'USD', metadata = {}) {
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: {
        service: metadata.service,
        user_id: metadata.userId,
        x402_amount: metadata.x402Amount,
        ...metadata
      }
    });
    
    return paymentIntent;
  }
  
  async processPayment(payment) {
    try {
      // Calculate fiat amount needed
      const usdcAmount = parseFloat(payment.amount) / 1000000; // Convert from USDC units
      const exchangeRate = this.exchangeRates.get('USD_USDC') || 1;
      const fiatAmount = usdcAmount / exchangeRate;
      
      // Add small fee (2.9% + $0.30 like Stripe)
      const totalFiatAmount = fiatAmount + (fiatAmount * 0.029) + 0.30;
      
      // Create Stripe payment intent
      const paymentIntent = await this.createPaymentIntent(totalFiatAmount, 'USD', {
        service: payment.service,
        userId: payment.user,
        x402Amount: payment.amount
      });
      
      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: totalFiatAmount,
        status: 'requires_payment_method'
      };
    } catch (error) {
      throw new Error(`Onramp payment failed: ${error.message}`);
    }
  }
  
  async confirmPayment(paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Payment successful - now we need to settle the x402 payment
      const x402Amount = paymentIntent.metadata.x402_amount;
      const service = paymentIntent.metadata.service;
      
      // Buy USDC with the fiat and settle x402 payment
      await this.settleX402Payment(x402Amount, service);
      
      return {
        success: true,
        x402Settled: true,
        amount: x402Amount
      };
    }
    
    return { success: false, status: paymentIntent.status };
  }
  
  async settleX402Payment(amount, service) {
    // This would involve:
    // 1. Buy USDC with collected fiat
    // 2. Transfer USDC to service provider
    // 3. Mark x402 payment as settled
    console.log(`Settling x402 payment: ${amount} USDC to ${service}`);
  }
}

export const onrampBridge = new OnrampBridge();
```

### Onramp API Routes

```javascript
// backend/src/routes/onramp.js
import express from 'express';
import { onrampBridge } from '../services/onramp.js';

const router = express.Router();

// Create payment intent for fiat payment
router.post('/create-payment', async (req, res) => {
  try {
    const { x402Service, x402Amount, userId } = req.body;
    
    // Calculate fiat equivalent
    const paymentIntent = await onrampBridge.processPayment({
      amount: x402Amount,
      service: x402Service,
      user: userId
    });
    
    res.json(paymentIntent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm fiat payment and settle x402
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    const result = await onrampBridge.confirmPayment(paymentIntentId);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get supported fiat currencies
router.get('/supported-currencies', (req, res) => {
  res.json({
    currencies: ['USD', 'EUR', 'GBP'],
    paymentMethods: ['card', 'bank_transfer', 'apple_pay', 'google_pay'],
    fees: {
      card: { percentage: 2.9, fixed: 0.30 },
      bank_transfer: { percentage: 0.8, fixed: 0 }
    }
  });
});

export { router as onrampRoutes };
```

### Onramp Frontend Component

```jsx
// frontend/src/components/onramp/OnrampPayment.jsx
import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const OnrampCheckoutForm = ({ x402Service, x402Amount, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) return;
    
    setLoading(true);
    setError(null);

    try {
      // Create payment intent on backend
      const response = await fetch('/api/onramp/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Service,
          x402Amount,
          userId: 'user123' // Get from auth context
        })
      });
      
      const { clientSecret, amount } = await response.json();
      
      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)
        }
      });

      if (error) {
        setError(error.message);
      } else if (paymentIntent.status === 'succeeded') {
        // Confirm with backend to settle x402 payment
        const confirmResponse = await fetch('/api/onramp/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id })
        });
        
        const result = await confirmResponse.json();
        
        if (result.success && result.x402Settled) {
          onSuccess(result);
        }
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <CardElement 
          options={{
            style: {
              base: { fontSize: '16px' }
            }
          }}
        />
      </div>
      
      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}
      
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-blue-500 text-white py-2 px-4 rounded disabled:opacity-50"
      >
        {loading ? 'Processing...' : `Pay $${(x402Amount / 1000000 * 1.03).toFixed(2)}`}
      </button>
      
      <p className="text-xs text-gray-600 text-center">
        Secure payment powered by Stripe. Your crypto wallet is not required.
      </p>
    </form>
  );
};

const OnrampPayment = ({ x402Service, x402Amount, onSuccess, onCancel }) => {
  return (
    <Elements stripe={stripePromise}>
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Pay with Credit Card</h3>
        <p className="text-gray-600 mb-4">
          No crypto wallet needed. Pay with your credit card and we'll handle the conversion.
        </p>
        
        <OnrampCheckoutForm
          x402Service={x402Service}
          x402Amount={x402Amount}
          onSuccess={onSuccess}
        />
        
        <button
          onClick={onCancel}
          className="w-full mt-4 text-gray-500 hover:text-gray-700"
        >
          Use crypto wallet instead
        </button>
      </div>
    </Elements>
  );
};

export default OnrampPayment;
```

### Enhanced Payment Button with Onramp Option

```jsx
// frontend/src/components/payments/UniversalPaymentButton.jsx
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import X402PaymentButton from './X402PaymentButton';
import OnrampPayment from '../onramp/OnrampPayment';

const UniversalPaymentButton = ({ endpoint, data, children, onSuccess }) => {
  const { isConnected } = useSelector(state => state.wallet);
  const [showOnramp, setShowOnramp] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(null);

  React.useEffect(() => {
    estimateX402Cost(endpoint).then(setEstimatedCost);
  }, [endpoint]);

  if (showOnramp) {
    return (
      <OnrampPayment
        x402Service={endpoint}
        x402Amount={estimatedCost * 1000000} // Convert to USDC units
        onSuccess={(result) => {
          setShowOnramp(false);
          if (onSuccess) onSuccess(result);
        }}
        onCancel={() => setShowOnramp(false)}
      />
    );
  }

  return (
    <div className="space-y-2">
      {isConnected ? (
        <X402PaymentButton
          endpoint={endpoint}
          data={data}
          onSuccess={onSuccess}
        >
          {children}
        </X402PaymentButton>
      ) : (
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => setShowOnramp(true)}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Pay with Credit Card
            {estimatedCost && (
              <span className="ml-2 text-sm opacity-75">
                (${(estimatedCost * 1.03).toFixed(2)})
              </span>
            )}
          </button>
          
          <button
            onClick={() => {/* Show wallet connection */}}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Connect Crypto Wallet
          </button>
        </div>
      )}
    </div>
  );
};

export default UniversalPaymentButton;
```

---

## Testing Strategy

### Unit Tests

```javascript
// backend/test/x402.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createX402Client } from '../src/utils/x402Client.js';

describe('x402 Integration', () => {
  let mockWalletClient;
  
  beforeEach(() => {
    mockWalletClient = {
      signMessage: vi.fn(),
      getAccount: vi.fn().mockReturnValue('0x123...'),
    };
  });

  it('should create payment client successfully', () => {
    const payingFetch = createX402Client(mockWalletClient);
    expect(payingFetch).toBeDefined();
    expect(typeof payingFetch).toBe('function');
  });

  it('should handle 402 payment required response', async () => {
    // Mock 402 response
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 402,
        json: () => Promise.resolve({
          accepts: [{
            network: "eip155:8453",
            amount: "1000000",
            scheme: "exact"
          }]
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ success: true })
      });

    const payingFetch = createX402Client(mockWalletClient);
    const result = await payingFetch('/api/premium/test');
    
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
```

### Integration Tests

```javascript
// backend/test/integration/vault.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { deployContract, setupTestEnvironment } from '../helpers/setup.js';

describe('Vault x402 Integration', () => {
  let vault, facilitator, user, provider;

  beforeAll(async () => {
    ({ vault, facilitator, user, provider } = await setupTestEnvironment());
  });

  it('should allow user to deposit and enable x402 spending', async () => {
    const depositAmount = ethers.utils.parseUnits('100', 6); // 100 USDC
    const monthlyLimit = ethers.utils.parseUnits('10', 6);   // $10/month

    // Deposit USDC
    await vault.connect(user).deposit(depositAmount);
    
    // Enable x402 spending
    await vault.connect(user).enableX402Spending(
      monthlyLimit,
      ['0x123...'] // authorized services
    );

    const config = await vault.x402Configs(user.address);
    expect(config.enabled).toBe(true);
    expect(config.monthlyLimit).toBe(monthlyLimit.toString());
  });

  it('should process x402 payment from yield', async () => {
    const paymentAmount = ethers.utils.parseUnits('0.05', 6); // $0.05

    // Update yield first
    await vault.updateYield(user.address);
    
    // Process x402 payment
    const tx = await facilitator.processX402Payment(
      user.address,
      '0x123...', // service address
      paymentAmount,
      Date.now(), // nonce
      '0x...' // signature
    );

    expect(tx).toBeDefined();
  });
});
```

### End-to-End Tests

```javascript
// frontend/cypress/e2e/x402-flow.cy.js
describe('x402 Payment Flow', () => {
  beforeEach(() => {
    cy.visit('/dashboard');
    cy.connectWallet(); // Custom command
  });

  it('should complete full x402 payment flow', () => {
    // Enable x402 spending
    cy.get('[data-testid=enable-x402]').click();
    cy.get('[data-testid=monthly-limit]').type('50');
    cy.get('[data-testid=confirm-enable]').click();
    
    // Wait for transaction
    cy.get('[data-testid=tx-success]').should('be.visible');
    
    // Make x402 payment
    cy.get('[data-testid=ai-analysis-button]').click();
    
    // Confirm payment in wallet (mocked)
    cy.get('[data-testid=confirm-payment]').click();
    
    // Verify result received
    cy.get('[data-testid=analysis-result]').should('contain', 'Analysis complete');
  });

  it('should use onramp for users without crypto', () => {
    cy.disconnectWallet(); // Custom command
    
    // Click service button
    cy.get('[data-testid=ai-analysis-button]').click();
    
    // Choose credit card option
    cy.get('[data-testid=pay-with-card]').click();
    
    // Fill credit card details
    cy.get('[data-testid=card-element]').within(() => {
      cy.fillCardDetails('4242424242424242', '12/34', '123');
    });
    
    // Submit payment
    cy.get('[data-testid=submit-payment]').click();
    
    // Verify service delivered
    cy.get('[data-testid=analysis-result]').should('be.visible');
  });
});
```

---

## Production Deployment

### Docker Configuration

```dockerfile
# Dockerfile for backend
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - FACILITATOR_PRIVATE_KEY=${FACILITATOR_PRIVATE_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
    depends_on:
      - postgres
      - redis

  facilitator:
    build: ./facilitator
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - FACILITATOR_PRIVATE_KEY=${FACILITATOR_PRIVATE_KEY}
      - VAULT_CONTRACT_ADDRESS=${VAULT_CONTRACT_ADDRESS}

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=https://api.yourdapp.com
      - REACT_APP_FACILITATOR_URL=https://facilitator.yourdapp.com

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: x402_dapp
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Environment Configuration

```bash
# .env.production
NODE_ENV=production

# Blockchain
FACILITATOR_PRIVATE_KEY=0x...
VAULT_CONTRACT_ADDRESS=0x...
BASE_RPC_URL=https://mainnet.base.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# x402
CUSTOM_FACILITATOR_URL=https://facilitator.yourdapp.com
BACKUP_FACILITATOR_URL=https://x402.cdp.coinbase.com

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/x402_dapp
REDIS_URL=redis://redis:6379

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Monitoring
SENTRY_DSN=https://...
DATADOG_API_KEY=...

# Security
JWT_SECRET=...
CORS_ORIGIN=https://yourdapp.com
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run contract tests
        run: |
          cd packages/contracts
          npx hardhat test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy contracts
        run: |
          cd packages/contracts
          npx hardhat deploy --network base
      
      - name: Build and deploy backend
        run: |
          docker build -t yourdapp/backend ./backend
          docker push yourdapp/backend:latest
      
      - name: Deploy to production
        run: |
          kubectl apply -f k8s/
          kubectl rollout restart deployment/backend
```

---

## Monitoring and Analytics

### Analytics Dashboard

```javascript
// backend/src/services/analytics.js
import { EventEmitter } from 'events';

class X402Analytics extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      totalTransactions: 0,
      totalVolume: 0,
      averageTransactionSize: 0,
      successRate: 0,
      responseTime: []
    };
  }
  
  recordPayment(payment) {
    this.metrics.totalTransactions++;
    this.metrics.totalVolume += parseFloat(payment.amount) / 1000000;
    
    this.calculateAverages();
    this.emit('payment_recorded', payment);
  }
  
  recordResponseTime(endpoint, time) {
    this.metrics.responseTime.push({ endpoint, time, timestamp: Date.now() });
    
    // Keep only last 1000 entries
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime.shift();
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      averageResponseTime: this.getAverageResponseTime()
    };
  }
  
  getAverageResponseTime() {
    if (this.metrics.responseTime.length === 0) return 0;
    
    const total = this.metrics.responseTime.reduce((sum, entry) => sum + entry.time, 0);
    return total / this.metrics.responseTime.length;
  }
  
  calculateAverages() {
    this.metrics.averageTransactionSize = this.metrics.totalVolume / this.metrics.totalTransactions;
  }
}

export const analytics = new X402Analytics();
```

### Real-time Dashboard

```jsx
// frontend/src/components/admin/AnalyticsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AnalyticsDashboard = () => {
  const [metrics, setMetrics] = useState({});
  const [realtimeData, setRealtimeData] = useState([]);

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const ws = new WebSocket('ws://localhost:3001/analytics');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'metrics_update') {
        setMetrics(data.metrics);
      } else if (data.type === 'payment_recorded') {
        setRealtimeData(prev => [...prev.slice(-50), {
          timestamp: Date.now(),
          amount: data.amount / 1000000,
          endpoint: data.endpoint
        }]);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">x402 Analytics Dashboard</h1>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Total Volume</h3>
          <p className="text-3xl font-bold text-green-600">
            ${metrics.totalVolume?.toFixed(2) || '0.00'}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Transactions</h3>
          <p className="text-3xl font-bold text-blue-600">
            {metrics.totalTransactions || 0}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Avg Transaction</h3>
          <p className="text-3xl font-bold text-purple-600">
            ${metrics.averageTransactionSize?.toFixed(2) || '0.00'}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Avg Response Time</h3>
          <p className="text-3xl font-bold text-orange-600">
            {metrics.averageResponseTime?.toFixed(0) || 0}ms
          </p>
        </div>
      </div>

      {/* Real-time Transaction Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Real-time Transactions</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={realtimeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleTimeString()}
              formatter={(value) => [`$${value.toFixed(2)}`, 'Amount']}
            />
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
```

---

## Advanced Features

### Session-based Payments

```javascript
// Advanced x402 client with session management
export const createSessionX402Client = (walletClient, sessionConfig = {}) => {
  const { maxSessionAmount = '10000000', sessionDuration = 3600 } = sessionConfig; // $10, 1 hour
  
  let sessionToken = null;
  let sessionExpiry = 0;
  let sessionSpent = 0;

  const createSession = async () => {
    const sessionData = {
      maxAmount: maxSessionAmount,
      duration: sessionDuration,
      timestamp: Date.now()
    };
    
    // Sign session creation message
    sessionToken = await walletClient.signMessage({
      message: JSON.stringify(sessionData)
    });
    
    sessionExpiry = Date.now() + (sessionDuration * 1000);
    sessionSpent = 0;
    
    return sessionToken;
  };

  const isSessionValid = (amount) => {
    return sessionToken && 
           Date.now() < sessionExpiry && 
           (sessionSpent + parseInt(amount)) <= parseInt(maxSessionAmount);
  };

  return x402Fetch(fetch, {
    walletClient,
    beforePayment: async (payment) => {
      if (!isSessionValid(payment.amount)) {
        await createSession();
      }
      
      // Add session token to payment
      payment.sessionToken = sessionToken;
      return payment;
    },
    afterPayment: (payment, response) => {
      if (response.ok) {
        sessionSpent += parseInt(payment.amount);
      }
    }
  });
};
```

### Batch Payments

```javascript
// Batch multiple x402 payments into single transaction
export const createBatchX402Client = (walletClient) => {
  const pendingPayments = [];
  const BATCH_SIZE = 10;
  const BATCH_TIMEOUT = 5000; // 5 seconds

  let batchTimer = null;

  const processBatch = async () => {
    if (pendingPayments.length === 0) return;
    
    const batch = pendingPayments.splice(0, BATCH_SIZE);
    const totalAmount = batch.reduce((sum, p) => sum + parseInt(p.amount), 0);
    
    try {
      // Create single payment for batch
      const batchPayment = {
        network: batch[0].network,
        asset: batch[0].asset,
        amount: totalAmount.toString(),
        recipients: batch.map(p => ({ address: p.recipient, amount: p.amount })),
        scheme: 'batch'
      };
      
      const signature = await walletClient.signMessage({
        message: JSON.stringify(batchPayment)
      });
      
      // Submit batch to facilitator
      const response = await fetch('/facilitator/settle-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: batchPayment, signature })
      });
      
      if (response.ok) {
        // Resolve all pending promises
        batch.forEach(payment => payment.resolve());
      } else {
        batch.forEach(payment => payment.reject(new Error('Batch failed')));
      }
    } catch (error) {
      batch.forEach(payment => payment.reject(error));
    }
  };

  return x402Fetch(fetch, {
    walletClient,
    paymentMode: 'batch',
    beforePayment: (payment) => {
      return new Promise((resolve, reject) => {
        pendingPayments.push({ ...payment, resolve, reject });
        
        // Start batch timer
        if (batchTimer) clearTimeout(batchTimer);
        batchTimer = setTimeout(processBatch, BATCH_TIMEOUT);
        
        // Process immediately if batch is full
        if (pendingPayments.length >= BATCH_SIZE) {
          clearTimeout(batchTimer);
          processBatch();
        }
      });
    }
  });
};
```

### Cross-chain Payments

```javascript
// Cross-chain x402 payments
export const createCrossChainX402Client = (walletClients) => {
  // walletClients is an object: { base: baseWalletClient, solana: solanaWalletClient }
  
  const selectOptimalChain = async (payment) => {
    const networks = Object.keys(walletClients);
    const costs = await Promise.all(
      networks.map(async (network) => {
        const gasCost = await estimateGasCost(network, payment);
        const exchangeRate = await getExchangeRate(network);
        return { network, totalCost: gasCost * exchangeRate };
      })
    );
    
    return costs.reduce((min, current) => 
      current.totalCost < min.totalCost ? current : min
    );
  };

  return x402Fetch(fetch, {
    beforePayment: async (payment) => {
      const optimalChain = await selectOptimalChain(payment);
      
      // Update payment to use optimal chain
      payment.network = getNetworkId(optimalChain.network);
      payment.walletClient = walletClients[optimalChain.network];
      
      return payment;
    }
  });
};
```

---

## Implementation Summary

This comprehensive guide provides everything needed to integrate x402 into your Hardhat + React + Redux DApp:

### Key Innovations Covered:

1. **Vault Integration**: Users fund services using yield instead of principal
2. **Custom Facilitator**: Full control over payment processing
3. **Onramp Service**: Fiat-to-crypto bridge for mainstream adoption
4. **Session Payments**: Reduced friction for frequent micropayments
5. **Cross-chain Support**: Optimal chain selection for cost efficiency

### Implementation Phases:

1. **Phase 1**: Basic x402 integration with Coinbase facilitator
2. **Phase 2**: Custom facilitator and vault integration  
3. **Phase 3**: Onramp service for fiat payments
4. **Phase 4**: Advanced features (sessions, batching, cross-chain)

### Production Considerations:

- Full test coverage (unit, integration, e2e)
- Docker containerization and Kubernetes deployment
- Real-time monitoring and analytics
- Security best practices and audit readiness

This implementation transforms your DApp into a **universal payment gateway** that accepts both crypto and fiat, making blockchain services accessible to everyone while maintaining the benefits of decentralized settlement.

---

*Implementation guide for x402 protocol in DApp architecture. Created: December 2025*