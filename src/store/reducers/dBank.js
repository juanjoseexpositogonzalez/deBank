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
        withdrawing: {
            isWithdrawing: false,
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
        depositApproveSuccess: (state, action) => {
            // Approval done, keep depositing flag true to continue with deposit
            state.depositing.isDepositing = true;
            state.depositing.isSuccess = true;
            state.depositing.transactionHash = action.payload || null;
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
        withdrawRequest: (state, action) => {
            state.withdrawing.isWithdrawing = true;
            state.withdrawing.isSuccess = false;
            state.withdrawing.transactionHash = null;
        },
        withdrawApproveSuccess: (state, action) => {
            state.withdrawing.isWithdrawing = true;
            state.withdrawing.isSuccess = true;
            state.withdrawing.transactionHash = action.payload || null;
        },
        withdrawSuccess: (state, action) => {
            state.withdrawing.isWithdrawing = false;
            state.withdrawing.isSuccess = true;
            state.withdrawing.transactionHash = action.payload;
        },
        withdrawFail: (state, action) => {
            state.withdrawing.isWithdrawing = false;
            state.withdrawing.isSuccess = false;
            state.withdrawing.transactionHash = null;
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
    depositApproveSuccess,
    depositSuccess,
    depositFail,
    withdrawRequest,
    withdrawApproveSuccess,
    withdrawSuccess,
    withdrawFail,
} = dBank.actions;

export default dBank.reducer;
