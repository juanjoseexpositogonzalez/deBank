import { useSelector, useDispatch } from 'react-redux';
import Navbar from 'react-bootstrap/Navbar';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Blockies from 'react-blockies';

import logo from '../assets/logo.png';

import { loadAccount, loadBalances } from '../store/interactions';

import config from '../config.json';


const Navigation = () => {
  const chainId = useSelector(state => state.provider.chainId);
  const account = useSelector(state => state.provider.account);
  const tokens = useSelector(state => state.tokens.contracts);
  const dBank = useSelector(state => state.dBank.contract);
  
  const dispatch = useDispatch();  

  const connectHandler = async () => {
    try {
      const account = await loadAccount(dispatch);
      if (account && tokens.length > 0 && dBank) {
        await loadBalances(dBank, tokens, account, dispatch);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert(error.message || 'Failed to connect wallet. Please make sure MetaMask is installed and unlocked.');
    }
  }

  const networkHandler = async (e) => {
    const targetChainId = e.target.value;
    
    try {      
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }]
      });      
    } catch (error) {
      // Error 4902: Chain not added to MetaMask
      if (error.code === 4902) {
        try {
          // Network configurations for adding to MetaMask
          const networkConfigs = {
            '0x7a69': {
              chainId: '0x7a69',
              chainName: 'Hardhat Local',
              rpcUrls: ['http://127.0.0.1:8545'],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
            },
            '0xaa36a7': {
              chainId: '0xaa36a7',
              chainName: 'Sepolia',
              rpcUrls: ['https://rpc.sepolia.org'],
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.etherscan.io']
            },
            '0x14a34': {
              chainId: '0x14a34',
              chainName: 'Base Sepolia',
              rpcUrls: [
                'https://base-sepolia.g.alchemy.com/v2/demo',
                'https://sepolia.base.org',
                'https://base-sepolia-rpc.publicnode.com'
              ],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.basescan.org']
            }
          };

          if (networkConfigs[targetChainId]) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [networkConfigs[targetChainId]]
            });
          }
        } catch (error) {
          console.error('Failed to add network:', error.code, error.message)          
        }
      } else {
        console.error('Failed to switch network:', error.code, error.message  );
      }
    }
  }

 
  return (
    <Navbar className='my-3'>
      <img
        alt="logo"
        src={logo}
        width="50"
        height="60"
        className="d-inline-block align-top mx-3"
      />
      <Navbar.Brand href="#">dBank</Navbar.Brand>
      
      <Navbar.Toggle aria-controls="nav" />
      <Navbar.Collapse id="nav"className="justify-content-end">

        <div className="d-flex justify-content-end mt-3">
          
          <Form.Select
            aria-label="Network Selector"
            value={chainId && config[chainId] ? `0x${chainId.toString(16)}` : '0'}
            onChange={networkHandler}
            style={{ maxWidth: '200px', marginRight: '20px'}}
          >
            <option value="0" disabled>Select Network</option>
            <option value="0x7a69">Hardhat Local</option>            
            <option value="0xaa36a7">Sepolia</option>
            <option value="0x14a34">Base Sepolia</option>    
          </Form.Select>  
      
          {account ? (
            <Navbar.Text className="d-flex align-items-center">
              {account.slice(0, 5) + '...' + account.slice(-4)}
              <Blockies 
                seed={account}
                size={8}
                scale={3}
                color="#2187D0"
                bgColor="#F1F2F9"
                spotColor="#767F92"
                className="identicon mx-2"
              />
            </Navbar.Text>
          ) : (
            <Button onClick={connectHandler}>Connect</Button>
          )}

        </div>
        
  </Navbar.Collapse>
</Navbar>
);
};

export default Navigation;

