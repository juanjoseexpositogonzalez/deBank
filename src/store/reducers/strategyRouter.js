import { createSlice } from '@reduxjs/toolkit'

export const strategyRouter = createSlice({
    name: 'strategyRouter',
    initialState: {
        contract: null,
        asset: null,
        strategies: [],
        strategyIds: [],
        strategyActive: [],
        strategyPaused: [],
        totalStrategies: 0,
        strategyCap: [],
        strategyAllocated: [],
        totalAllocated: 0,
    },
    reducers: {
        setRouterContract: (state, action) => {
            state.contract = action.payload;
        },
        setAsset: (state, action) => {
            state.asset = action.payload;
        },
        setStrategies: (state, action) => {
            state.strategies = action.payload;
        },
        setStrategyIds: (state, action) => {
            state.strategyIds = action.payload;
        },
        setStrategyActive: (state, action) => {
            state.strategyActive = action.payload;
        },
        setStrategyPaused: (state, action) => {
            state.strategyPaused = action.payload;
        },
        setTotalStrategies: (state, action) => {
            state.totalStrategies = action.payload;
        },
        setStrategyCap: (state, action) => {
            state.strategyCap = action.payload;
        },
        setStrategyAllocated: (state, action) => {
            state.strategyAllocated = action.payload;
        },
        setTotalAllocated: (state, action) => {
            state.totalAllocated = action.payload;
        },
    }
})

export const { 
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
} = strategyRouter.actions;

export default strategyRouter.reducer;