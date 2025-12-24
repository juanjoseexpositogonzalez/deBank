import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Container } from 'react-bootstrap'
import { ethers } from 'ethers'

// Components
import Navigation from './Navigation';
import Tabs from './Tabs';
import Deposit from './Deposit';
import Withdraw from './Withdraw';
import Strategies from './Strategies';
import Charts from './Charts';

import { 
  loadAccount,
  loadProvider,
  loadNetwork,
  loadTokens,  
  loadBank,
  loadStrategyRouter,
  loadMockS1,
  loadConfigManager,
  loadBalances,
} from '../store/interactions'
import { setAccount } from '../store/reducers/provider'

// ABIs: Import your contract ABIs here
// import TOKEN_ABI from '../abis/Token.json'

// Config: Import your network config here
// import config from '../config.json';


function App() {

  const dispatch = useDispatch()

  useEffect(() => {
    // Named handlers for proper cleanup
    const handleChainChanged = async () => {
      try {
        // Small delay to let MetaMask RPC fully switch
        await new Promise(resolve => setTimeout(resolve, 100));

        const nextProvider = loadProvider(dispatch);
        
        // Wait for provider to detect the new network
        await nextProvider.ready;
        
        const nextChainId = await loadNetwork(nextProvider, dispatch);

        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          dispatch(setAccount(ethers.utils.getAddress(accounts[0])));
        }

        const nextTokens = await loadTokens(nextProvider, nextChainId, dispatch);
        const nextDBank = await loadBank(nextProvider, nextChainId, dispatch);
        await loadStrategyRouter(nextProvider, nextChainId, dispatch);
        await loadMockS1(nextProvider, nextChainId, dispatch);
        await loadConfigManager(nextProvider, nextChainId, dispatch);

        // Refresh balances/shares if we have an account
        if (accounts && accounts.length > 0 && nextDBank && nextTokens && nextTokens.length > 0) {
          const currentAccount = ethers.utils.getAddress(accounts[0]);
          await loadBalances(nextDBank, nextTokens, currentAccount, dispatch);
        }
      } catch (error) {
        console.error('Error handling chain change:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        alert(`⚠️ Network Switch Error\n\n${errorMessage}\n\nPlease switch to a supported network (Hardhat Local or Sepolia).`);
      }
    };

    const handleAccountsChanged = async () => {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        const newAccount = ethers.utils.getAddress(accounts[0]);
        dispatch(setAccount(newAccount));

        // Get fresh provider and contracts (avoid closure issues)
        try {
          const freshProvider = new ethers.providers.Web3Provider(window.ethereum, 'any');
          const { chainId } = await freshProvider.getNetwork();

          // Load fresh contract instances
          const freshTokens = await loadTokens(freshProvider, chainId, dispatch);
          const freshDBank = await loadBank(freshProvider, chainId, dispatch);

          // Now load balances with fresh contracts
          if (freshDBank && freshTokens && freshTokens.length > 0) {
            await loadBalances(freshDBank, freshTokens, newAccount, dispatch);
          }
        } catch (error) {
          console.error('Error loading balances after account change:', error);
        }
      } else {
        dispatch(setAccount(null));
      }
    };

    const loadBlockchainData = async () => {
      try {
        // Initiate provider
        const provider = loadProvider(dispatch);

        const chainId = await loadNetwork(provider, dispatch);

        // Try to get existing accounts without forcing a popup
        const existingAccounts = await window.ethereum.request({ method: 'eth_accounts' });
        let currentAccount = null;
        if (existingAccounts && existingAccounts.length > 0) {
          currentAccount = ethers.utils.getAddress(existingAccounts[0]);
          dispatch(setAccount(currentAccount));
        }

        // Register event listeners
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('accountsChanged', handleAccountsChanged);

        // Initialize contracts
        const tokensContracts = await loadTokens(provider, chainId, dispatch);
        const dBankContract = await loadBank(provider, chainId, dispatch);
        await loadStrategyRouter(provider, chainId, dispatch);
        await loadMockS1(provider, chainId, dispatch);
        await loadConfigManager(provider, chainId, dispatch);

        // Load balances/shares if account already connected
        if (currentAccount && tokensContracts && tokensContracts.length > 0 && dBankContract) {
          await loadBalances(dBankContract, tokensContracts, currentAccount, dispatch);
        }
      } catch (error) {
        console.error('Error loading blockchain data:', error);
        // Show user-friendly error message
        const errorMessage = error.message || 'Unknown error occurred';
        alert(`⚠️ Network Configuration Error\n\n${errorMessage}\n\nTroubleshooting:\n1. Make sure Hardhat node is running: npx hardhat node\n2. Switch MetaMask to Hardhat Local network\n3. Ensure contracts are deployed to localhost`);
      }
    };

    loadBlockchainData();

    // Cleanup: remove event listeners on unmount
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [dispatch]);

  return(
    <Container>
      <HashRouter>
        <Navigation />
        <hr />
        <Tabs />        
        <Routes>
          <Route exact path="/" element={<Deposit />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/charts" element={<Charts />} />
        </Routes>
      </HashRouter>
    </Container>
  );
}

export default App;
