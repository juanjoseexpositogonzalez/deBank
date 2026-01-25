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
    // Validar inputs
    if (!amount || amount.isZero()) {
      throw new Error('Invalid amount: must be greater than zero');
    }

    if (!receiver || !ethers.utils.isAddress(receiver)) {
      throw new Error('Invalid receiver address');
    }

    // Verificar que el contrato dBank esté desplegado
    const code = await provider.getCode(config.dBankAddress);
    if (!code || code === '0x') {
      throw new Error('dBank contract not deployed at specified address');
    }

    // Aprobar tokens si es necesario
    const tokenAddress = await dBankContract.asset();
    const tokenABI = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)',
    ];
    const tokenContract = new ethers.Contract(
      tokenAddress,
      tokenABI,
      treasurySigner
    );
    
    // Verificar balance del treasury wallet
    const treasuryBalance = await tokenContract.balanceOf(treasurySigner.address);
    if (treasuryBalance.lt(amount)) {
      throw new Error(`Insufficient balance: treasury has ${ethers.utils.formatUnits(treasuryBalance, 18)}, needs ${ethers.utils.formatUnits(amount, 18)}`);
    }
    
    const allowance = await tokenContract.allowance(
      treasurySigner.address,
      config.dBankAddress
    );
    
    if (allowance.lt(amount)) {
      // Aprobar con un margen adicional para evitar múltiples aprobaciones
      const approveAmount = amount.mul(2);
      const approveTx = await tokenContract.approve(config.dBankAddress, approveAmount);
      await approveTx.wait();
    }

    // Obtener balance de shares antes del depósito
    const dBankERC20ABI = [
      'function balanceOf(address account) view returns (uint256)',
    ];
    const dBankERC20 = new ethers.Contract(config.dBankAddress, dBankERC20ABI, provider);
    const sharesBefore = await dBankERC20.balanceOf(receiver);

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
      const sharesAfter = await dBankERC20.balanceOf(receiver);
      shares = sharesAfter.sub(sharesBefore);
      
      if (shares.isZero()) {
        throw new Error('No shares were minted - deposit may have failed');
      }
    }

    return {
      txHash: receipt.transactionHash,
      shares: ethers.utils.formatUnits(shares, 18),
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    // Mejorar mensajes de error
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient funds in treasury wallet');
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      throw new Error('Transaction would fail - check contract state');
    } else if (error.reason) {
      throw new Error(`Deposit failed: ${error.reason}`);
    } else {
      throw new Error(`Deposit failed: ${error.message}`);
    }
  }
}

module.exports = { deposit };
