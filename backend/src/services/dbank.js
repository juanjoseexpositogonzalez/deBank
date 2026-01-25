const { ethers } = require('ethers');
const config = require('../config');
const path = require('path');
const fs = require('fs');

let provider;
let dBankContract;
let treasurySigner;

// Cargar ABI desde el proyecto principal
const dBankABIPath = path.join(__dirname, '../../../src/abis/dBank.json');
let dBankABI;

try {
  dBankABI = JSON.parse(fs.readFileSync(dBankABIPath, 'utf8'));
} catch (error) {
  console.error('Error loading dBank ABI:', error.message);
  // Fallback ABI mínimo para deposit
  dBankABI = [
    {
      "inputs": [
        { "internalType": "uint256", "name": "_assets", "type": "uint256" },
        { "internalType": "address", "name": "_receiver", "type": "address" }
      ],
      "name": "deposit",
      "outputs": [{ "internalType": "uint256", "name": "shares", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "asset",
      "outputs": [{ "internalType": "contract Token", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    }
  ];
}

function initialize() {
  if (!config.treasuryPrivateKey || !config.dBankAddress) {
    throw new Error('Missing treasury private key or dBank address in config');
  }
  
  provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  treasurySigner = new ethers.Wallet(config.treasuryPrivateKey, provider);
  dBankContract = new ethers.Contract(config.dBankAddress, dBankABI, treasurySigner);
}

async function deposit({ amount, receiver }) {
  if (!dBankContract) {
    initialize();
  }

  try {
    // Aprobar tokens si es necesario
    const tokenAddress = await dBankContract.asset();
    const tokenABI = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ];
    const tokenContract = new ethers.Contract(
      tokenAddress,
      tokenABI,
      treasurySigner
    );
    
    const allowance = await tokenContract.allowance(
      treasurySigner.address,
      config.dBankAddress
    );
    
    if (allowance.lt(amount)) {
      const approveTx = await tokenContract.approve(config.dBankAddress, amount);
      await approveTx.wait();
    }

    // Ejecutar depósito
    const tx = await dBankContract.deposit(amount, receiver);
    const receipt = await tx.wait();

    // Obtener shares minted desde eventos
    const depositEvent = receipt.events?.find(e => e.event === 'Deposit');
    let shares = ethers.BigNumber.from(0);
    
    if (depositEvent && depositEvent.args && depositEvent.args.shares) {
      shares = depositEvent.args.shares;
    } else {
      // Fallback: calcular shares desde el balance del receiver
      const dBankERC20ABI = [
        'function balanceOf(address account) view returns (uint256)',
      ];
      const dBankERC20 = new ethers.Contract(config.dBankAddress, dBankERC20ABI, provider);
      const balanceBefore = await dBankERC20.balanceOf(receiver, { blockNumber: receipt.blockNumber - 1 });
      const balanceAfter = await dBankERC20.balanceOf(receiver, { blockNumber: receipt.blockNumber });
      shares = balanceAfter.sub(balanceBefore);
    }

    return {
      txHash: receipt.transactionHash,
      shares: ethers.utils.formatUnits(shares, 18),
    };
  } catch (error) {
    throw new Error(`Deposit failed: ${error.message}`);
  }
}

module.exports = { deposit };
