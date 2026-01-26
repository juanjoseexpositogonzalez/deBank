import { ethers } from 'ethers'

import { 
    setAccount,
    setProvider,
    setNetwork,
    // provider
} from './reducers/provider';

import { 
    setContracts,
    setSymbols,
    balancesLoaded,
    // tokens,    
} from './reducers/tokens';

import {
    setContract,
    setSymbol,
    setAssets,
    sharesLoaded, 
    setTotalSupply,
    depositRequest,
    depositApproveSuccess,
    depositSuccess,
    depositFail,
    withdrawRequest,
    withdrawApproveSuccess,
    withdrawSuccess,
    withdrawFail,
} from './reducers/dBank';

import {
    setRouterContract,
    setAsset,
    setStrategies,
    setStrategyIds,
    setStrategyActive,
    setStrategyPaused,
    setTotalStrategies,
    setStrategyCap,
    setStrategyAllocated,
    setTotalAllocated,
    setUserStrategyAllocations,
    setUserTotalAllocated,
    setUserStrategyAllocationsValue,
    setUserTotalAllocatedValue,
} from './reducers/strategyRouter';

import {
    setMockS1Contract,
    setMockS1Principal,
    setMockS1Accumulator,
    setMockS1AprBps,
    setMockS1Cap,
    setMockS1Paused,
} from './reducers/mockS1';

import {
    setConfigManagerContract,
    setConfigManagerLiquidityBufferBps,
    setConfigManagerMaxSlippageBps,
    setConfigManagerTvlGlobalCap,
    setConfigManagerPerTxCap,
    setConfigManagerPerformanceFeeBps,
    setConfigManagerEpochDuration,
    setConfigManagerSettlementWindowUTC,
    setConfigManagerStrategyCapS1,
    setConfigManagerStrategyCapS2,
    setConfigManagerStrategyCapS3,
    setConfigManagerFeeRecipient,
    setConfigManagerPrimaryOracle,
    setConfigManagerPauser,
    setConfigManagerHarvester,
    setConfigManagerAllocator,
    setConfigManagerAllowedVenues,
} from './reducers/configManager';

import TOKEN_ABI_RAW from '../abis/Token.json'
import DBANK_ABI_RAW from '../abis/dBank.json'
import STRATEGY_ROUTER_ABI_RAW from '../abis/StrategyRouter.json'
import CONFIG_MANAGER_ABI_RAW from '../abis/ConfigManager.json'
import MOCK_S1_ABI_RAW from '../abis/MockS1.json'

import config from '../config.json'
import { getX402BackendUrl } from '../utils/x402Config'

// Normalize ABIs - handle both formats: direct array or Hardhat artifact with .abi property
const normalizeABI = (abi) => {
    if (Array.isArray(abi)) {
        return abi;
    }
    if (abi && abi.abi && Array.isArray(abi.abi)) {
        return abi.abi;
    }
    throw new Error('Invalid ABI format');
};

const TOKEN_ABI = normalizeABI(TOKEN_ABI_RAW);
const DBANK_ABI = normalizeABI(DBANK_ABI_RAW);
const STRATEGY_ROUTER_ABI = normalizeABI(STRATEGY_ROUTER_ABI_RAW);
const CONFIG_MANAGER_ABI = normalizeABI(CONFIG_MANAGER_ABI_RAW);
const MOCK_S1_ABI = normalizeABI(MOCK_S1_ABI_RAW);

const buildSelectorSet = (abi) => {
    try {
        const iface = new ethers.utils.Interface(abi);
        return new Set(Object.keys(iface.functions).map((fn) => iface.getSighash(fn)));
    } catch (error) {
        console.warn("Failed to build selector set:", error.message);
        return new Set();
    }
};

const applyProviderCallFilter = (provider, chainId) => {
    if (!provider || provider._callFilterApplied) return;
    if (!config || !config[chainId]) return;

    const addresses = config[chainId];
    const addressToSelectors = new Map();

    const addSelectors = (address, abi) => {
        if (!address) return;
        const selectorSet = buildSelectorSet(abi);
        if (selectorSet.size > 0) {
            addressToSelectors.set(address.toLowerCase(), selectorSet);
        }
    };

    addSelectors(addresses.token?.address, TOKEN_ABI);
    addSelectors(addresses.dbank?.address, DBANK_ABI);
    addSelectors(addresses.strategyRouter?.address, STRATEGY_ROUTER_ABI);
    addSelectors(addresses.configManager?.address, CONFIG_MANAGER_ABI);
    addSelectors(addresses.mockS1?.address, MOCK_S1_ABI);

    const originalCall = provider.call.bind(provider);
    provider.call = async (tx, blockTag) => {
        try {
            const to = tx?.to ? tx.to.toLowerCase() : null;
            const data = tx?.data;
            if (to && data && data.length >= 10 && addressToSelectors.has(to)) {
                const selector = data.slice(0, 10);
                const allowed = addressToSelectors.get(to);
                if (!allowed.has(selector)) {
                    // Skip unsupported reads to avoid noisy reverts
                    return "0x";
                }
            }
        } catch (error) {
            // Fall through to original call
        }
        return originalCall(tx, blockTag);
    };

    provider._callFilterApplied = true;
};


export const loadProvider = (dispatch) => {
    // Use 'any' to allow seamless network switching without provider invalidation
    const provider = new ethers.providers.Web3Provider(window.ethereum, 'any')
    dispatch(setProvider(provider))

    return provider
}

export const loadNetwork = async (provider, dispatch) => {
    const { chainId } = await provider.getNetwork()            
    
    dispatch(setNetwork(chainId))
    applyProviderCallFilter(provider, chainId)
    return chainId
}

export const loadAccount = async (dispatch) => {
    // Check if MetaMask or other wallet is installed
    if (!window.ethereum) {
        throw new Error('MetaMask or other Ethereum wallet is not installed. Please install MetaMask to connect.');
    }
    
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    
    if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet.');
    }
    
    const account = ethers.utils.getAddress(accounts[0])
    dispatch(setAccount(account))

    return account
}

// ----------------------------------------------------------
// LOAD CONTRACTS
export const loadTokens = async (provider, chainId, dispatch) => {
    // Validate chainId exists in config
    if (!config[chainId]) {
        throw new Error(`Chain ID ${chainId} is not configured. Please connect to a supported network.`);
    }
    
    if (!config[chainId].token || !config[chainId].token.address) {
        throw new Error(`Token address not configured for chain ID ${chainId}`);
    }
    
    // Check for zero address (contracts not deployed)
    const tokenAddress = config[chainId].token.address;
    if (tokenAddress === ethers.constants.AddressZero || 
        tokenAddress === '0x0000000000000000000000000000000000000000') {
        const networkNames = {
            '31337': 'Hardhat Local',
            '11155111': 'Sepolia Testnet'
        };
        const networkName = networkNames[chainId] || `Chain ID ${chainId}`;
        throw new Error(
            `Contracts are not deployed on ${networkName}.\n\n` +
            `Please deploy contracts first or switch to a network where contracts are deployed.\n` +
            `To deploy: npx hardhat run scripts/deploy.js --network sepolia`
        );
    }
    
    const usdc = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)

    dispatch(setContracts([usdc]));   
    dispatch(setSymbols([await usdc.symbol()]));    

    return [usdc]
}

export const loadBank = async (provider, chainId, dispatch) => {
    if (!config[chainId] || !config[chainId].dbank || !config[chainId].dbank.address) {
        throw new Error(`dBank address not configured for chain ID ${chainId}`);
    }
    
    // Check for zero address (contracts not deployed)
    const dbankAddress = config[chainId].dbank.address;
    if (dbankAddress === ethers.constants.AddressZero || 
        dbankAddress === '0x0000000000000000000000000000000000000000') {
        const networkNames = {
            '31337': 'Hardhat Local',
            '11155111': 'Sepolia Testnet'
        };
        const networkName = networkNames[chainId] || `Chain ID ${chainId}`;
        throw new Error(`dBank contract is not deployed on ${networkName}`);
    }
    
    const dBank = new ethers.Contract(dbankAddress, DBANK_ABI, provider)

    dispatch(setContract(dBank));
    dispatch(setSymbol(await dBank.symbol()));  
    
    return dBank
}

export const loadStrategyRouter = async (provider, chainId, dispatch) => {
    if (!config[chainId] || !config[chainId].strategyRouter || !config[chainId].strategyRouter.address) {
        throw new Error(`StrategyRouter address not configured for chain ID ${chainId}`);
    }
    
    // Check for zero address (contracts not deployed)
    const routerAddress = config[chainId].strategyRouter.address;
    if (routerAddress === ethers.constants.AddressZero || 
        routerAddress === '0x0000000000000000000000000000000000000000') {
        const networkNames = {
            '31337': 'Hardhat Local',
            '11155111': 'Sepolia Testnet'
        };
        const networkName = networkNames[chainId] || `Chain ID ${chainId}`;
        throw new Error(`StrategyRouter contract is not deployed on ${networkName}`);
    }
    
    const strategyRouter = new ethers.Contract(routerAddress, STRATEGY_ROUTER_ABI, provider)

    dispatch(setRouterContract(strategyRouter)); 
    dispatch(setAsset(await strategyRouter.asset()));
    
    // Get total strategies count (BigNumber -> number for iteration)
    const totalStrategiesBN = await strategyRouter.totalStrategies();
    const totalStrategies = totalStrategiesBN.toNumber();
    dispatch(setTotalStrategies(totalStrategies));
    
    // Get total allocated
    const totalAllocated = await strategyRouter.getTotalAllocated();
    dispatch(setTotalAllocated(totalAllocated));
    
    // Initialize arrays for strategy data
    const strategies = [];
    const strategyIds = [];
    const strategyActive = [];
    const strategyPaused = [];
    const strategyCap = [];
    const strategyAllocated = [];
    
    // Iterate through possible strategy IDs (1 to 10, or until we find all registered)
    // We check up to MAX_STRATEGIES (10) or until we've found totalStrategies registered
    const MAX_STRATEGIES = 10;
    let foundStrategies = 0;
    
    for (let i = 1; i <= MAX_STRATEGIES && foundStrategies < totalStrategies; i++) {
        try {
            // Check if strategy is registered (address != 0x0)
            const strategyAddress = await strategyRouter.strategies(i);
            
            if (strategyAddress !== ethers.constants.AddressZero) {
                foundStrategies++;
                
                // Get strategy data
                const [address, active, cap, allocated] = await strategyRouter.getStrategy(i);
                
                strategies.push({
                    id: i,
                    address: address,
                    active: active,
                    cap: cap,
                    allocated: allocated
                });
                
                strategyIds.push(i);
                strategyActive.push(active);
                strategyCap.push(cap);
                strategyAllocated.push(allocated);
                
                // Check if strategy is paused (call the strategy contract directly)
                try {
                    const MockS1 = new ethers.Contract(address, MOCK_S1_ABI, provider);
                    const paused = await MockS1.paused();
                    strategyPaused.push(paused);
                } catch (error) {
                    // If we can't call paused(), default to false
                    strategyPaused.push(false);
                }
            }
        } catch (error) {
            // If strategy doesn't exist or error, continue to next
            console.warn(`Error loading strategy ${i}:`, error.message);
        }
    }
    
    // Dispatch all the collected data
    dispatch(setStrategies(strategies));
    dispatch(setStrategyIds(strategyIds));
    dispatch(setStrategyActive(strategyActive));
    dispatch(setStrategyPaused(strategyPaused));
    dispatch(setStrategyCap(strategyCap));
    dispatch(setStrategyAllocated(strategyAllocated));
}

// ----------------------------------------------------------
// LOAD USER STRATEGY ALLOCATIONS
export const loadUserStrategyAllocations = async (strategyRouter, account, dispatch) => {
    if (!strategyRouter || !account) {
        dispatch(setUserStrategyAllocations([]));
        dispatch(setUserTotalAllocated("0"));
        dispatch(setUserStrategyAllocationsValue([]));
        dispatch(setUserTotalAllocatedValue("0"));
        return;
    }

    try {
        // Get total allocated by user
        const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
        const userTotalAllocated = ethers.utils.formatUnits(userTotalAllocatedBN, 18);
        dispatch(setUserTotalAllocated(userTotalAllocated));

        // Get allocations per strategy
        const userAllocations = [];
        const userAllocationsValue = [];
        let userTotalAllocatedValueBN = ethers.BigNumber.from(0);
        const totalStrategiesBN = await strategyRouter.totalStrategies();
        const totalStrategies = totalStrategiesBN.toNumber();
        
        for (let i = 1; i <= totalStrategies; i++) {
            try {
                const allocationBN = await strategyRouter.getUserStrategyAllocation(account, i);
                const allocation = ethers.utils.formatUnits(allocationBN, 18);
                userAllocations.push(allocation);

                // Compute current value of allocation based on strategy totalAssets
                let allocationValueBN = ethers.BigNumber.from(0);
                if (allocationBN.gt(0)) {
                    const [strategyAddress, , , strategyAllocatedBN] = await strategyRouter.getStrategy(i);
                    if (strategyAddress && strategyAddress !== ethers.constants.AddressZero && strategyAllocatedBN.gt(0)) {
                        try {
                            const strategy = new ethers.Contract(
                                strategyAddress,
                                ["function totalAssets() view returns (uint256)"],
                                strategyRouter.provider
                            );
                            const strategyTotalAssetsBN = await strategy.totalAssets();
                            allocationValueBN = allocationBN.mul(strategyTotalAssetsBN).div(strategyAllocatedBN);
                        } catch (error) {
                            allocationValueBN = allocationBN;
                        }
                    } else {
                        allocationValueBN = allocationBN;
                    }
                }

                userAllocationsValue.push(ethers.utils.formatUnits(allocationValueBN, 18));
                userTotalAllocatedValueBN = userTotalAllocatedValueBN.add(allocationValueBN);
            } catch (error) {
                userAllocations.push("0");
                userAllocationsValue.push("0");
            }
        }
        
        dispatch(setUserStrategyAllocations(userAllocations));
        dispatch(setUserStrategyAllocationsValue(userAllocationsValue));
        dispatch(setUserTotalAllocatedValue(ethers.utils.formatUnits(userTotalAllocatedValueBN, 18)));
    } catch (error) {
        console.error("Error loading user strategy allocations:", error);
        dispatch(setUserStrategyAllocations([]));
        dispatch(setUserTotalAllocated("0"));
        dispatch(setUserStrategyAllocationsValue([]));
        dispatch(setUserTotalAllocatedValue("0"));
    }
}

export const loadMockS1 = async (provider, chainId, dispatch) => {
    if (!config[chainId] || !config[chainId].mockS1 || !config[chainId].mockS1.address) {
        throw new Error(`MockS1 address not configured for chain ID ${chainId}`);
    }
    
    // Check for zero address (contracts not deployed)
    const mockS1Address = config[chainId].mockS1.address;
    if (mockS1Address === ethers.constants.AddressZero || 
        mockS1Address === '0x0000000000000000000000000000000000000000') {
        const networkNames = {
            '31337': 'Hardhat Local',
            '11155111': 'Sepolia Testnet'
        };
        const networkName = networkNames[chainId] || `Chain ID ${chainId}`;
        throw new Error(`MockS1 contract is not deployed on ${networkName}`);
    }
    
    const mockS1 = new ethers.Contract(mockS1Address, MOCK_S1_ABI, provider)

    dispatch(setMockS1Contract(mockS1));
    dispatch(setMockS1Principal(await mockS1.principal())); 
    dispatch(setMockS1Accumulator(await mockS1.accumulator()));
    dispatch(setMockS1AprBps(await mockS1.aprBps()));
    dispatch(setMockS1Cap(await mockS1.cap()));
    dispatch(setMockS1Paused(await mockS1.paused()));
    
    return mockS1
}

export const loadConfigManager = async (provider, chainId, dispatch) => {
    if (!config[chainId] || !config[chainId].configManager || !config[chainId].configManager.address) {
        throw new Error(`ConfigManager address not configured for chain ID ${chainId}`);
    }
    
    // Check for zero address (contracts not deployed)
    const configManagerAddress = config[chainId].configManager.address;
    if (configManagerAddress === ethers.constants.AddressZero || 
        configManagerAddress === '0x0000000000000000000000000000000000000000') {
        const networkNames = {
            '31337': 'Hardhat Local',
            '11155111': 'Sepolia Testnet'
        };
        const networkName = networkNames[chainId] || `Chain ID ${chainId}`;
        throw new Error(`ConfigManager contract is not deployed on ${networkName}`);
    }
    
    const configManager = new ethers.Contract(configManagerAddress, CONFIG_MANAGER_ABI, provider)

    dispatch(setConfigManagerContract(configManager));
    dispatch(setConfigManagerLiquidityBufferBps(await configManager.liquidityBufferBps()));
    dispatch(setConfigManagerMaxSlippageBps(await configManager.maxSlippageBps()));
    dispatch(setConfigManagerTvlGlobalCap(await configManager.tvlGlobalCap()));
    dispatch(setConfigManagerPerTxCap(await configManager.perTxCap()));
    dispatch(setConfigManagerPerformanceFeeBps(await configManager.performanceFeeBps()));
    dispatch(setConfigManagerEpochDuration(await configManager.epochDuration()));
    dispatch(setConfigManagerSettlementWindowUTC(await configManager.settlementWindowUTC()));
    dispatch(setConfigManagerStrategyCapS1(await configManager.strategyCapS1()));
    dispatch(setConfigManagerStrategyCapS2(await configManager.strategyCapS2()));
    dispatch(setConfigManagerStrategyCapS3(await configManager.strategyCapS3()));
    dispatch(setConfigManagerFeeRecipient(await configManager.feeRecipient()));
    dispatch(setConfigManagerPrimaryOracle(await configManager.primaryOracle()));
    dispatch(setConfigManagerPauser(await configManager.pauser()));
    dispatch(setConfigManagerHarvester(await configManager.harvester()));
    dispatch(setConfigManagerAllocator(await configManager.allocator()));
    
    // Initialize allowedVenues as empty array
    // Note: Loading the array requires iterating through indices which can cause RPC errors
    // If needed, this can be loaded on-demand when the UI requires it
    dispatch(setConfigManagerAllowedVenues([]));
    
    return configManager
}

// ----------------------------------------------------------
// LOAD BALANCES AND SHAPES
export const loadBalances = async(dBank, tokens, account, dispatch) => {
    const usdcBalance = await tokens[0].balanceOf(account)
    dispatch(balancesLoaded([
        ethers.utils.formatUnits(usdcBalance.toString(), 'ether')
    ]))

    const totalAssets = await dBank.totalAssets()
    const totalSupply = await dBank.totalSupply()
    const shares = await dBank.balanceOf(account)
    dispatch(setAssets(ethers.utils.formatUnits(totalAssets.toString(), 'ether')))
    dispatch(setTotalSupply(ethers.utils.formatUnits(totalSupply.toString(), 'ether')))
    dispatch(sharesLoaded(ethers.utils.formatUnits(shares.toString(), 'ether')))

    return { usdcBalance, shares, totalAssets, totalSupply }
}
// ----------------------------------------------------------
// DEPOSIT FUNDS
export const depositFunds = async (provider, dBank, tokens, account, usdcAmount, dispatch) => {
    try {
        dispatch(depositRequest());

        const signer = provider.getSigner();
        const amountInWei = ethers.utils.parseUnits(usdcAmount, 18);

        // Get token contract with sigher (for write operations)
        const tokenWithSigner = tokens[0].connect(signer);
        const dBankWIthSigner = dBank.connect(signer);

        // Step 1. Check current allowance
        const currentAllowance = await tokens[0].allowance(account, dBank.address);

        // Step 2: If allowance insufficient, request approval
        if (currentAllowance.lt(amountInWei)) {
            const approveTx = await tokenWithSigner.approve(dBank.address, amountInWei);
            await approveTx.wait(); // Wait for confirmation
            dispatch(depositApproveSuccess(approveTx.hash));
        } else {
            // No approval needed, mark phase as ready to deposit
            dispatch(depositApproveSuccess(null));
        }

        // Step 3. Execute deposit (keep isDepositing true)
        const depositTx = await dBankWIthSigner.deposit(amountInWei, account);
        await depositTx.wait(); // Wait for confirmation

        dispatch(depositSuccess(depositTx.hash));
        
        // Step 4. Refresh balances
        await loadBalances(dBank, tokens, account, dispatch);

        return true;

    } catch (error) {
        // Extract more detailed error message
        let errorMessage = error.message || 'Unknown error';
        
        // Try to extract revert reason from error
        if (error.reason) {
            errorMessage = error.reason;
        } else if (error.data) {
            // Try to decode error data
            try {
                const iface = new ethers.utils.Interface([
                    "error dBank__CapExceeded(uint256 requested, uint256 available)",
                    "error dBank__InsufficientLiquidity(uint256 requested, uint256 available)",
                    "error dBank__InvalidAmount()",
                    "error dBank__Paused()",
                    "error dBank__InvalidReceiver()"
                ]);
                const decoded = iface.parseError(error.data);
                if (decoded) {
                    if (decoded.name === 'dBank__CapExceeded') {
                        const requested = ethers.utils.formatUnits(decoded.args[0], 18);
                        const available = ethers.utils.formatUnits(decoded.args[1], 18);
                        errorMessage = `Deposit cap exceeded. Requested: ${requested} tokens, Available: ${available} tokens`;
                    } else if (decoded.name === 'dBank__InsufficientLiquidity') {
                        errorMessage = 'Insufficient liquidity in vault';
                    } else if (decoded.name === 'dBank__InvalidAmount') {
                        errorMessage = 'Invalid deposit amount';
                    } else if (decoded.name === 'dBank__Paused') {
                        errorMessage = 'Vault is paused';
                    } else {
                        errorMessage = decoded.name;
                    }
                }
            } catch (decodeError) {
                // If decoding fails, use original message
                console.error('Error decoding revert:', decodeError);
            }
        }
        
        console.error('Deposit error:', error);
        dispatch(depositFail(errorMessage));
        return false;
    }
}

// ----------------------------------------------------------
// DEPOSIT VIA X402
export const depositViaX402 = async (provider, account, amount, dispatch, chainId) => {
    try {
        dispatch(depositRequest());

        // Verificar que estamos en Base Sepolia (84532)
        const chainIdNum = typeof chainId === 'string' ? parseInt(chainId) : chainId;
        if (chainIdNum !== 84532) {
            throw new Error('x402 deposits are only available on Base Sepolia (chainId: 84532). Please switch networks.');
        }

        // Obtener configuración x402 usando helper
        const backendUrl = getX402BackendUrl(chainId);
        if (!backendUrl) {
            throw new Error('x402 backend URL not configured for this network. Please check config.json and ensure x402.backendUrl is set for Base Sepolia.');
        }

        // Importar cliente x402 dinámicamente (puede no estar disponible aún)
        let x402Client, wrapFetchWithPayment, registerExactEvmScheme;
        try {
            const x402Fetch = await import('@x402/fetch');
            const x402Evm = await import('@x402/evm/exact/client');
            x402Client = x402Fetch.x402Client;
            wrapFetchWithPayment = x402Fetch.wrapFetchWithPayment;
            registerExactEvmScheme = x402Evm.registerExactEvmScheme;
        } catch (importError) {
            console.error('x402 import error:', importError);
            throw new Error('x402 packages not installed. Run: npm install @x402/fetch @x402/evm viem');
        }

        // Obtener signer del usuario
        const signer = await provider.getSigner();
        
        // Crear cuenta viem desde el signer de ethers
        // @x402/evm requiere un signer compatible con viem
        let viemAccount;
        try {
            const { privateKeyToAccount } = await import('viem/accounts');
            
            // Intentar obtener private key del signer
            // Nota: Esto solo funciona con algunos tipos de providers (ej: JsonRpcProvider con private key)
            // Para MetaMask y otros wallets, el usuario debe firmar manualmente
            let privateKey;
            
            // Método 1: Si el signer tiene getPrivateKey
            if (signer.getPrivateKey) {
                try {
                    privateKey = await signer.getPrivateKey();
                } catch (e) {
                    console.warn('getPrivateKey not available:', e.message);
                }
            }
            
            // Método 2: Si el provider tiene acceso a la private key
            if (!privateKey && provider.connection && provider.connection.url) {
                // Para desarrollo local con Hardhat, la private key puede estar en el provider
                // Esto es solo para testing
            }
            
            if (!privateKey) {
                // Para producción con MetaMask u otros wallets, necesitamos usar un enfoque diferente
                // Por ahora, lanzamos un error informativo
                throw new Error(
                    'x402 requires direct wallet access. ' +
                    'Please ensure your wallet is connected and supports EIP-3009 signing. ' +
                    'For development, use a local Hardhat account.'
                );
            }
            
            viemAccount = privateKeyToAccount(privateKey);
        } catch (accountError) {
            console.error('Failed to create viem account:', accountError);
            throw new Error(
                `Failed to create x402 signer: ${accountError.message}. ` +
                'Make sure your wallet supports EIP-3009 signing or use a development account.'
            );
        }

        // Crear x402 client y registrar esquema EVM
        const client = new x402Client();
        registerExactEvmScheme(client, {
            signer: viemAccount,
        });

        // Wrap fetch con manejo de pagos
        const fetchWithPayment = wrapFetchWithPayment(fetch, client);

        // Generar requestId único para idempotencia
        const requestId = `deposit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Hacer request al backend x402
        console.log('Making x402 deposit request to:', backendUrl);
        
        const response = await fetchWithPayment(`${backendUrl}/api/x402/deposit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amount.toString(),
                userAddress: account,
                requestId,
            }),
        });

        if (!response.ok) {
            // Si es 402, el cliente x402 debería haber manejado el pago automáticamente
            // Si aún falla, puede ser un error del servidor
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            
            // Si es 402, el cliente debería haber manejado el pago
            if (response.status === 402) {
                throw new Error('Payment required but x402 client failed to process payment. Please check your wallet connection.');
            }
            
            throw new Error(errorData.error || `Deposit failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Deposit failed');
        }

        // Dispatch success action
        dispatch(depositSuccess(result.txHash));
        
        console.log('x402 deposit successful:', result);

        return { 
            ok: true, 
            txHash: result.txHash, 
            shares: result.shares 
        };
    } catch (error) {
        console.error('depositViaX402 error:', error);
        dispatch(depositFail(error.message));
        return { 
            ok: false, 
            error: error.message 
        };
    }
};

// ----------------------------------------------------------
// WITHDRAW FUNDS
export const withdrawFunds = async (provider, dBank, tokens, account, usdcAmount, dispatch) => {
    try {
        dispatch(withdrawRequest());

        const signer = provider.getSigner();
        const amountInWei = ethers.utils.parseUnits(usdcAmount, 18);

        const dBankWithSigner = dBank.connect(signer);

        // Optional phase marker to mirror deposit UX
        dispatch(withdrawApproveSuccess(null));

        const withdrawTx = await dBankWithSigner.withdraw(amountInWei, account, account);
        await withdrawTx.wait();

        dispatch(withdrawSuccess(withdrawTx.hash));

        await loadBalances(dBank, tokens, account, dispatch);

        return true;
    } catch (error) {
        dispatch(withdrawFail(error.message));
        return false;
    }
}

// ----------------------------------------------------------
// ALLOCATE TO STRATEGY (StrategyRouter.depositToStrategy)
export const allocateToStrategy = async (provider, strategyRouter, tokens, account, amount, strategyId, dispatch) => {
    try {
        const signer = provider.getSigner();
        const amountInWei = ethers.utils.parseUnits(amount, 18);

        const tokenWithSigner = tokens[0].connect(signer);
        const routerWithSigner = strategyRouter.connect(signer);

        // Check allowance to router
        const currentAllowance = await tokens[0].allowance(account, strategyRouter.address);
        if (currentAllowance.lt(amountInWei)) {
            const approveTx = await tokenWithSigner.approve(strategyRouter.address, amountInWei);
            await approveTx.wait();
        }

        // Deposit to strategy
        const tx = await routerWithSigner.depositToStrategy(strategyId, amountInWei);
        await tx.wait();

        // Refresh strategy state
        await loadStrategyRouter(provider, (await provider.getNetwork()).chainId, dispatch);

        // Reload user allocations
        await loadUserStrategyAllocations(strategyRouter, account, dispatch);

        return { ok: true, hash: tx.hash };
    } catch (error) {
        console.error("allocateToStrategy error:", error);
        return { ok: false, hash: null, error: error.message };
    }
}

// ----------------------------------------------------------
// UN-ALLOCATE FROM STRATEGY (StrategyRouter.withdrawFromStrategy)
export const unallocateFromStrategy = async (provider, strategyRouter, tokens, account, amount, strategyId, dispatch, maxSlippageBps = 50) => {
    try {
        const signer = provider.getSigner();
        let amountInWei = ethers.utils.parseUnits(amount, 18);

        const routerWithSigner = strategyRouter.connect(signer);

        // Ensure router holds tokens to return; approval not required for withdrawFromStrategy
        const routerBalance = await tokens[0].balanceOf(strategyRouter.address);
        if (routerBalance.lt(amountInWei)) {
            console.warn('Router balance lower than requested un-allocation; capping to available balance.');
            amountInWei = routerBalance;
        }

        if (amountInWei.isZero()) {
            return { ok: false, hash: null, error: 'Router has no liquidity for un-allocation.' };
        }

        const tx = await routerWithSigner.withdrawFromStrategy(strategyId, amountInWei, maxSlippageBps);
        await tx.wait();

        await loadStrategyRouter(provider, (await provider.getNetwork()).chainId, dispatch);

        // Reload user allocations
        await loadUserStrategyAllocations(strategyRouter, account, dispatch);

        return { ok: true, hash: tx.hash };
    } catch (error) {
        console.error("unallocateFromStrategy error:", error);
        return { ok: false, hash: null, error: error.message };
    }
}
// ----------------------------------------------------------
// LOAD STRATEGY RETURNS
export const loadStrategyReturns = async (provider, strategyRouter, dispatch) => {
    try {
        await strategyRouter.getStrategyReturns();
        // dispatch(setStrategyReturns(returns));
    } catch (error) {
        console.error("loadStrategyReturns error:", error);
    }
}