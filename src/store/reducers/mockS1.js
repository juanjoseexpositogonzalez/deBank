import { createSlice } from '@reduxjs/toolkit'

export const mockS1 = createSlice({
    name: 'mockS1',
    initialState: {
        contract: null,
        principal: null,
        accumulator: null,
        aprBps: null,
        cap: null,
        paused: false,
    },
    reducers: {
        setMockS1Contract: (state, action) => {
            state.contract = action.payload;
        },
        setMockS1Principal: (state, action) => {
            state.symbol = action.payload;
        },  
        setMockS1Accumulator: (state, action) => {
            state.accumulator = action.payload;
        },
        setMockS1AprBps: (state, action) => {
            state.aprBps = action.payload;
        },
        setMockS1Cap: (state, action) => {
            state.cap = action.payload;
        },
        setMockS1Paused: (state, action) => {
            state.paused = action.payload;
        },
    }
})

export const { 
    setMockS1Contract,
    setMockS1Principal,
    setMockS1Accumulator,
    setMockS1AprBps,
    setMockS1Cap,
    setMockS1Paused,
} = mockS1.actions;

export default mockS1.reducer;
