import { createSlice } from '@reduxjs/toolkit'

export const configManager = createSlice({
    name: 'configManager',
    initialState: {
        contract: null,
        liquidityBufferBps: null,
        maxSlippageBps: null,
        tvlGlobalCap: null,
        perTxCap: null,
        performanceFeeBps: null,
        epochDuration: null,
        settlementWindowUTC: null,
        strategyCapS1: null,
        strategyCapS2: null,
        strategyCapS3: null,
        feeRecipient: null,
        primaryOracle: null,
        pauser: null,
        harvester: null,
        allocator: null,
        allowedVenues: [],
    },
    reducers: {
        setConfigManagerContract: (state, action) => {
            state.contract = action.payload;
        },
        setConfigManagerLiquidityBufferBps: (state, action) => {
            state.liquidityBufferBps = action.payload;
        },  
        setConfigManagerMaxSlippageBps: (state, action) => {
            state.maxSlippageBps = action.payload;
        },
        setConfigManagerTvlGlobalCap: (state, action) => {
            state.tvlGlobalCap = action.payload;
        },
        setConfigManagerPerTxCap: (state, action) => {
            state.perTxCap = action.payload;
        },
        setConfigManagerPerformanceFeeBps: (state, action) => {
            state.performanceFeeBps = action.payload;
        },
        setConfigManagerEpochDuration: (state, action) => {
            state.epochDuration = action.payload;
        },
        setConfigManagerSettlementWindowUTC: (state, action) => {
            state.settlementWindowUTC = action.payload;
        },
        setConfigManagerStrategyCapS1: (state, action) => {
            state.strategyCapS1 = action.payload;
        },
        setConfigManagerStrategyCapS2: (state, action) => {
            state.strategyCapS2 = action.payload;
        },
        setConfigManagerStrategyCapS3: (state, action) => {
            state.strategyCapS3 = action.payload;
        },
        setConfigManagerFeeRecipient: (state, action) => {
            state.feeRecipient = action.payload;
        },
        setConfigManagerPrimaryOracle: (state, action) => {
            state.primaryOracle = action.payload;
        },
        setConfigManagerPauser: (state, action) => {
            state.pauser = action.payload;
        },
        setConfigManagerHarvester: (state, action) => {
            state.harvester = action.payload;
        },
        setConfigManagerAllocator: (state, action) => {
            state.allocator = action.payload;
        },
        setConfigManagerAllowedVenues: (state, action) => {
            state.allowedVenues = action.payload;
        },
    }
})

export const { 
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
} = configManager.actions;

export default configManager.reducer;