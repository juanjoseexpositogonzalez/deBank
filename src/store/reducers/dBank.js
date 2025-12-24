import { createSlice } from '@reduxjs/toolkit'

export const dBank = createSlice({
    name: 'dBank',
    initialState: {
        contract: null,
        symbol: null,
        assets: [],
        shares: [],
        totalSupply: 0,
        depositing: {
            isDepositing: false,
            isSuccess: false,
            transactionHash: null,
        },
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
        setTotalSupply: (state, action) => {
            state.totalSupply = action.payload;
        },
        depositRequest: (state, action) => {
            state.depositing.isDepositing = true;
            state.depositing.isSuccess = false;
            state.depositing.transactionHash = null;
        },
        depositSuccess: (state, action) => {
            state.depositing.isDepositing = false;
            state.depositing.isSuccess = true;
            state.depositing.transactionHash = action.payload;
        },
        depositFail: (state, action) => {
            state.depositing.isDepositing = false;
            state.depositing.isSuccess = false;
            state.depositing.transactionHash = null;
        },
    }
})

export const { 
    setContract,
    setSymbol,
    setAssets,
    sharesLoaded,
    setTotalSupply,
    depositRequest,
    depositSuccess,
    depositFail,
} = dBank.actions;

export default dBank.reducer;
