import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Container } from 'react-bootstrap'
import { ethers } from 'ethers'

// Components
import Navigation from './Navigation';
// import Loading from './Loading';

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
  const account = useSelector(state => state.provider.account)
  const tokens = useSelector(state => state.tokens.contracts)
  const dBank = useSelector(state => state.dBank.contract)

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

        // Refresh balances/shares if we still have an account
        const currentAccount = (accounts && accounts.length > 0)
          ? ethers.utils.getAddress(accounts[0])
          : account;
        if (currentAccount && nextDBank && nextTokens && nextTokens.length > 0) {
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
        dispatch(setAccount(ethers.utils.getAddress(accounts[0])));
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
        if (existingAccounts && existingAccounts.length > 0) {
          const account = ethers.utils.getAddress(existingAccounts[0]);
          dispatch(setAccount(account));
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
        if (account && tokensContracts && tokensContracts.length > 0 && dBankContract) {
          await loadBalances(dBankContract, tokensContracts, account, dispatch);
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
      <Navigation  />

      <h1 className='my-4 text-center'>React Hardhat Template</h1>
      <>
      <p className='text-center'><strong>Your ETH Balance:</strong> 0 ETH</p>
      <p className='text-center'>Edit App.js to add your code here.</p>
      </>
    </Container>
  )
}

export default App;
