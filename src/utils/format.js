/**
 * Shared formatting utilities for the dBank frontend
 */

/**
 * Format a number with a maximum number of decimal places
 * Removes trailing zeros for cleaner display
 * @param {string|number} value - The value to format
 * @param {number} maxDecimals - Maximum decimal places (default: 4)
 * @returns {string} Formatted number string
 */
export const formatWithMaxDecimals = (value, maxDecimals = 4) => {
    if (!value || value === "0" || parseFloat(value) === 0) return "0";
    const num = parseFloat(value);
    if (isNaN(num)) return "0";
    
    const str = num.toString();
    const [, decimals] = str.split('.');
    if (!decimals || decimals.length <= maxDecimals) {
        return num.toString();
    }
    
    // Limit to maxDecimals and remove trailing zeros
    return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
};

/**
 * Map of chain IDs to block explorer base URLs
 */
export const explorerMap = {
    1: 'https://etherscan.io/tx/',
    11155111: 'https://sepolia.etherscan.io/tx/',
    84532: 'https://sepolia.basescan.org/tx/',
    31337: '' // no public explorer for local
};

/**
 * Get the block explorer URL for a given chain ID
 * @param {number|string} chainId - The chain ID
 * @returns {string} The block explorer base URL
 */
export const getExplorerUrl = (chainId) => {
    return explorerMap[chainId] || '';
};

/**
 * Supported chain IDs for the dBank application
 */
export const SUPPORTED_CHAINS = [31337, 11155111, 84532];

/**
 * Check if a chain ID is supported
 * @param {number|string} chainId - The chain ID to check
 * @returns {boolean} True if the chain is supported
 */
export const isSupportedChain = (chainId) => {
    const id = typeof chainId === 'string' ? parseInt(chainId) : chainId;
    return SUPPORTED_CHAINS.includes(id);
};

/**
 * Get network name for a chain ID
 * @param {number|string} chainId - The chain ID
 * @returns {string} The network name
 */
/**
 * Truncate an Ethereum address for display
 * @param {string} address - Full Ethereum address
 * @returns {string} Truncated address (e.g. "0x1234...abcd")
 */
export const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const getNetworkName = (chainId) => {
    const names = {
        1: 'Ethereum Mainnet',
        31337: 'Hardhat Local',
        11155111: 'Sepolia Testnet',
        84532: 'Base Sepolia'
    };
    const id = typeof chainId === 'string' ? parseInt(chainId) : chainId;
    return names[id] || `Unknown Network (${chainId})`;
};
