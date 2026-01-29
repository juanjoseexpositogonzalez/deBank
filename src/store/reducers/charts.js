import { createSlice } from '@reduxjs/toolkit';

const MAX_HISTORY_POINTS = 100;

export const charts = createSlice({
    name: 'charts',
    initialState: {
        // Histórico de price per share (efectivo, considerando yield de estrategias)
        pricePerShareHistory: [],      // Array de { x: timestamp, y: value }
        // Histórico del valor total de shares del usuario
        userSharesValueHistory: [],    // Array de { x: timestamp, y: value }
        // Valores actuales
        currentPricePerShare: "1",
        currentUserSharesValue: "0",
        // Timestamp del último bloque procesado
        lastBlockTimestamp: null,
        // Loading state
        isLoading: false,
    },
    reducers: {
        setChartsLoading: (state, action) => {
            state.isLoading = action.payload;
        },
        setPricePerShareHistory: (state, action) => {
            state.pricePerShareHistory = action.payload;
        },
        setUserSharesValueHistory: (state, action) => {
            state.userSharesValueHistory = action.payload;
        },
        addPricePerSharePoint: (state, action) => {
            const { x, y } = action.payload;
            // Evitar duplicados (mismo timestamp o muy cercano)
            const existingIdx = state.pricePerShareHistory.findIndex(
                p => Math.abs(p.x - x) < 1000
            );
            if (existingIdx >= 0) {
                // Actualizar punto existente
                state.pricePerShareHistory[existingIdx].y = y;
            } else {
                state.pricePerShareHistory.push({ x, y });
            }
            // Ordenar y limitar
            state.pricePerShareHistory.sort((a, b) => a.x - b.x);
            if (state.pricePerShareHistory.length > MAX_HISTORY_POINTS) {
                state.pricePerShareHistory = state.pricePerShareHistory.slice(-MAX_HISTORY_POINTS);
            }
        },
        addUserSharesValuePoint: (state, action) => {
            const { x, y } = action.payload;
            const existingIdx = state.userSharesValueHistory.findIndex(
                p => Math.abs(p.x - x) < 1000
            );
            if (existingIdx >= 0) {
                state.userSharesValueHistory[existingIdx].y = y;
            } else {
                state.userSharesValueHistory.push({ x, y });
            }
            state.userSharesValueHistory.sort((a, b) => a.x - b.x);
            if (state.userSharesValueHistory.length > MAX_HISTORY_POINTS) {
                state.userSharesValueHistory = state.userSharesValueHistory.slice(-MAX_HISTORY_POINTS);
            }
        },
        setCurrentPricePerShare: (state, action) => {
            state.currentPricePerShare = action.payload;
        },
        setCurrentUserSharesValue: (state, action) => {
            state.currentUserSharesValue = action.payload;
        },
        setLastBlockTimestamp: (state, action) => {
            state.lastBlockTimestamp = action.payload;
        },
        clearUserChartData: (state) => {
            state.userSharesValueHistory = [];
            state.currentUserSharesValue = "0";
        },
        clearAllChartData: (state) => {
            state.pricePerShareHistory = [];
            state.userSharesValueHistory = [];
            state.currentPricePerShare = "1";
            state.currentUserSharesValue = "0";
            state.lastBlockTimestamp = null;
        },
    }
});

export const {
    setChartsLoading,
    setPricePerShareHistory,
    setUserSharesValueHistory,
    addPricePerSharePoint,
    addUserSharesValuePoint,
    setCurrentPricePerShare,
    setCurrentUserSharesValue,
    setLastBlockTimestamp,
    clearUserChartData,
    clearAllChartData,
} = charts.actions;

export default charts.reducer;
