import { configureStore } from "@reduxjs/toolkit";

import provider from './reducers/provider';
import tokens from './reducers/tokens';
import dBank from './reducers/dBank';
import strategyRouter from './reducers/strategyRouter';
import mockS1 from './reducers/mockS1';
import configManager from './reducers/configManager';
import charts from './reducers/charts';

export const store = configureStore({
  reducer: {
    provider,
    tokens,
    dBank,
    strategyRouter,
    mockS1,
    configManager,
    charts,
  },
  middleware: (getDefaultMiddleware) => 
    getDefaultMiddleware({
      serializableCheck: false,
  })
});
