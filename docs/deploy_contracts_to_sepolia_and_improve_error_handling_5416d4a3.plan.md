---
name: Deploy Contracts to Sepolia and Improve Error Handling
overview: Improve error handling for undeployed contracts and provide steps to deploy contracts to Sepolia testnet. The app currently fails when switching to Sepolia because contract addresses are zero addresses in config.json.
todos: []
---

# Deploy Contracts to Sepolia

and Improve Error Handling

## Problems Identified

1. **Zero Address Validation**: When contracts have zero addresses in `config.json` (like Sepolia), the app tries to create contract instances which fail. Need better validation and user-friendly error messages.
2. **Network Configuration**: Hardhat config has a typo (`sepolis` instead of `sepolia`) and needs proper Sepolia network setup.
3. **Deployment Process**: Need clear steps to deploy contracts to Sepolia and update `config.json` with the deployed addresses.

## Solution

### 1. Improve Error Handling in interactions.js

- Add validation to check for zero addresses before creating contract instances
- Show user-friendly error messages when contracts aren't deployed on a network
- Allow the app to gracefully handle networks where contracts aren't deployed yet

### 2. Fix Hardhat Network Configuration

- Fix typo: `sepolis` → `sepolia` in `hardhat.config.js`
- Ensure proper Sepolia RPC URL configuration
- Verify environment variables are set up correctly

### 3. Create Deployment Guide

- Document steps to deploy to Sepolia
- Show how to update `config.json` after deployment
- Include prerequisites (API keys, testnet ETH, etc.)

## Files to Modify

1. **[src/store/interactions.js](src/store/interactions.js)**:

- Add zero address validation in `loadTokens`, `loadBank`, `loadStrategyRouter`, `loadMockS1`, `loadConfigManager`
- Improve error messages to indicate contracts aren't deployed

2. **[hardhat.config.js](hardhat.config.js)**:

- Fix typo: `sepolis` → `sepolia`
- Ensure proper network configuration

3. **[docs/DEPLOY.md](docs/DEPLOY.md)** (create or update):

- Add Sepolia deployment instructions
- Include prerequisites and environment setup

## Implementation Details

### Zero Address Validation

```javascript
// In loadTokens, loadBank, etc.
if (!config[chainId].token.address || 
    config[chainId].token.address === ethers.constants.AddressZero) {
  throw new Error(
    `Contracts are not deployed on this network (Chain ID: ${chainId}).\n` +
    `Please deploy contracts first or switch to a network where contracts are deployed.`
  );
}
```



### Network Configuration Fix

- Change `sepolis` to `sepolia` in hardhat.config.js
- Ensure RPC URL uses correct format

### Deployment Steps

1. Set up environment variables (ALCHEMY_API_KEY, PRIVATE_KEYS, ETHERSCAN_API_KEY)
2. Get Sepolia testnet ETH for the deployer account
3. Deploy contracts: `npx hardhat run scripts/deploy.js --network sepolia`