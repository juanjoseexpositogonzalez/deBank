import { createSlice } from '@reduxjs/toolkit'

export const dBank = createSlice({
    name: 'dBank',
    initialState: {
        contract: null,
        symbol: null,
        assets: [],
        shares: [],
    },
    reducers: {
        setContract: (state, action) => {
            state.contract = action.payload;
        },
        setSymbol: (state, action) => {
            state.symbol = action.payload;
        },
        setAssets: (state, action) => {
            state.assets = action.payload;
        },
        sharesLoaded: (state, action) => {
            state.shares = action.payload;
        },
    }
})

export const { 
    setContract,
    setSymbol,
    setAssets,
    sharesLoaded,
} = dBank.actions;

export default dBank.reducer;
