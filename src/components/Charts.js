import { useSelector, useDispatch } from 'react-redux';
import { ethers } from 'ethers';

import { useEffect } from 'react';

import Loading from './Loading';

import {
    loadStrategyReturns,
} from '../store/interactions';


const Charts = () => {
    const chainId = useSelector(state => state.provider.chainId);
    
    const provider = useSelector(state => state.provider.connection);
    
    const tokens = useSelector(state => state.tokens.contracts);
    const symbols = useSelector(state => state.tokens.symbols);
    
    const strategyRouter = useSelector(state => state.strategyRouter.contract);
    const dBankSymbol = useSelector(state => state.dBank.symbol);    
    const shares = useSelector(state => state.dBank.shares);
    const balances = useSelector(state => state.tokens.balances);
    const dBank = useSelector(state => state.dBank.contract);

    const dispatch = useDispatch();

    useEffect(() => {
        loadStrategyReturns(provider, strategyRouter, dispatch)

    }, [])

    return (
        <div>
            Charts
        </div>
    );
};

export default Charts;