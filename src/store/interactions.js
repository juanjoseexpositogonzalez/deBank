import { ethers } from 'ethers'

import { 
    setAccount,
    setProvider,
    setNetwork
} from './reducers/provider';

import { 
    setContracts,
    setSymbols,
    balancesLoaded,    
} from './reducers/tokens';

import {
    setContract,
    setSymbol,
    setAssets,
    sharesLoaded, 
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
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    dispatch(setProvider(provider))

    return provider

}

export const loadNetwork = async (provider, dispatch) => {
    const { chainId }= await provider.getNetwork()
    dispatch(setNetwork(chainId.toString()))

    return chainId.toString()

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
    const usdc = new ethers.Contract(config[chainId].token.address, TOKEN_ABI, provider)

    dispatch(setContracts([usdc]));   
    dispatch(setSymbols([await usdc.symbol()]));    
}

export const loadBank = async (provider, chainId, dispatch) => {
    const dBank = new ethers.Contract(config[chainId].dbank.address, DBANK_ABI, provider)

    dispatch(setContract(dBank));
    dispatch(setSymbol(await dBank.symbol()));  
    
    return dBank
}

export const loadStrategyRouter = async (provider, chainId, dispatch) => {
    const strategyRouter = new ethers.Contract(config[chainId].strategyRouter.address, STRATEGY_ROUTER_ABI, provider)

    dispatch(setRouterContract(strategyRouter)); 
    dispatch(setAsset(await strategyRouter.asset()));
    
    // Get total strategies count
    const totalStrategies = await strategyRouter.totalStrategies();
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
    const mockS1 = new ethers.Contract(config[chainId].mockS1.address, MOCK_S1_ABI, provider)

    dispatch(setMockS1Contract(mockS1));
    dispatch(setMockS1Principal(await mockS1.principal())); 
    dispatch(setMockS1Accumulator(await mockS1.accumulator()));
    dispatch(setMockS1AprBps(await mockS1.aprBps()));
    dispatch(setMockS1Cap(await mockS1.cap()));
    dispatch(setMockS1Paused(await mockS1.paused()));
    
    return mockS1
}

export const loadConfigManager = async (provider, chainId, dispatch) => {
    const configManager = new ethers.Contract(config[chainId].configManager.address, CONFIG_MANAGER_ABI, provider)

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
export const loadBalances = async(tokens, account, dispatch) => {
    const usdcBalance = await tokens[0].balanceOf(account)
    dispatch(balancesLoaded([usdcBalance]))

    return usdcBalance 
}

