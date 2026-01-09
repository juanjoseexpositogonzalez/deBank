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

import TOKEN_ABI from '../abis/Token.json'
import DBANK_ABI from '../abis/dBank.json'
import STRATEGY_ROUTER_ABI from '../abis/StrategyRouter.json'
import CONFIG_MANAGER_ABI from '../abis/ConfigManager.json'
import MOCK_S1_ABI from '../abis/MockS1.json'

import config from '../config.json'


export const loadProvider = (dispatch) => {
    // Use 'any' to allow seamless network switching without provider invalidation
    const provider = new ethers.providers.Web3Provider(window.ethereum, 'any')
    dispatch(setProvider(provider))

    return provider
}

export const loadNetwork = async (provider, dispatch) => {
    const { chainId } = await provider.getNetwork()            
    
    dispatch(setNetwork(chainId))
    return chainId
}

export const loadAccount = async (dispatch) => {    
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
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
        dispatch(depositFail(error.message));
        return false;
    }
}

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

        return true;
    } catch (error) {
        console.error("allocateToStrategy error:", error);
        return false;
    }
}

// ----------------------------------------------------------
// UN-ALLOCATE FROM STRATEGY (StrategyRouter.withdrawFromStrategy)
export const unallocateFromStrategy = async (provider, strategyRouter, tokens, account, amount, strategyId, dispatch, maxSlippageBps = 50) => {
    try {
        const signer = provider.getSigner();
        const amountInWei = ethers.utils.parseUnits(amount, 18);

        const routerWithSigner = strategyRouter.connect(signer);

        // Ensure router holds tokens to return; approval not required for withdrawFromStrategy
        const routerBalance = await tokens[0].balanceOf(strategyRouter.address);
        if (routerBalance.lt(amountInWei)) {
            console.warn('Router balance lower than requested un-allocation; call may revert.');
        }

        const tx = await routerWithSigner.withdrawFromStrategy(strategyId, amountInWei, maxSlippageBps);
        await tx.wait();

        await loadStrategyRouter(provider, (await provider.getNetwork()).chainId, dispatch);

        return true;
    } catch (error) {
        console.error("unallocateFromStrategy error:", error);
        return false;
    }
}
