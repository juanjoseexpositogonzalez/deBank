---
name: Fix Network Selector Synchronization
overview: Fix the bidirectional synchronization between the network selector dropdown and MetaMask. The issues include incorrect chainId format conversion, missing error handling for network switching, and the selector not reflecting MetaMask's current network correctly.
todos: []
---

# Fix Network Selector

Synchronization

## Problems Identified

1. **ChainId Format Mismatch**: In `Navigation.js` line 59, `chainId` is a string from Redux store (e.g., `"31337"`), but the code tries to call `.toString(16)` on it, which won't work correctly. The select options use hexadecimal format (`0x7A69`, `0xAA36A7`) but the value comparison is incorrect.
2. **Missing Error Handling**: The `networkHandler` function doesn't handle cases where:

- The network doesn't exist in MetaMask (should use `wallet_addEthereumChain`)
- User rejects the network switch
- Network switch fails for other reasons

3. **Incomplete Synchronization**: When MetaMask changes networks, the page reloads but the selector value calculation is wrong, so it may not show the correct network initially.
4. **Network Configuration**: Only Hardhat Local (31337) is in `config.json`, but the selector shows Sepolia option which isn't configured.

## Solution

### 1. Fix ChainId Conversion in Navigation.js

- Convert chainId string to number before converting to hex
- Fix the `value` prop to correctly match MetaMask's chainId format
- Ensure the selector shows the current network from MetaMask

### 2. Improve networkHandler Function

- Add error handling for `wallet_switchEthereumChain`
- If network doesn't exist (error code 4902), use `wallet_addEthereumChain` to add it
- Handle user rejection gracefully
- Add network configuration data for adding networks to MetaMask

### 3. Update config.json

- Add Sepolia network configuration (if contracts are deployed there)
- Or remove Sepolia option if not needed
- Structure networks properly for easy addition of more networks

### 4. Ensure Proper Synchronization

- The `chainChanged` listener in `App.js` already reloads the page, which is good
- Make sure the selector value is calculated correctly on initial load
- Add a helper function to convert between decimal and hex chainId formats

## Files to Modify

1. **[src/components/Navigation.js](src/components/Navigation.js)**:

- Fix chainId conversion in select value (line 59)
- Improve `networkHandler` with error handling and network addition
- Add network configuration constants for MetaMask

2. **[src/config.json](src/config.json)**:

- Add Sepolia configuration (or remove Sepolia option if not needed)
- Consider adding a networks metadata structure

3. **[src/store/interactions.js](src/store/interactions.js)** (optional):

- May need helper function for chainId format conversion

## Implementation Details

### Network Handler Improvements

```javascript
const networkHandler = async (e) => {
  const targetChainId = e.target.value; // hex format like "0x7A69"
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }]
    });
    // chainChanged event will trigger page reload
  } catch (error) {
    if (error.code === 4902) {
      // Network doesn't exist, add it
      // Use wallet_addEthereumChain with network details
    } else if (error.code === 4001) {
      // User rejected
      console.log('User rejected network switch');
    }
  }
}
```



### ChainId Conversion Fix

```javascript
// Convert decimal string chainId to hex for MetaMask
const chainIdToHex = (chainIdStr) => {
  return `0x${parseInt(chainIdStr).toString(16)}`;
};

// In select value:
value={chainId ? chainIdToHex(chainId) : '0'}


```