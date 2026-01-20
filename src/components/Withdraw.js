import { Card, Button, Spinner } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import { ethers } from 'ethers';

import Alert from './Alert'

import {
    withdrawFunds,    
} from '../store/interactions';

import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';

const Withdraw = () => {
    const [usdcAmount, setUsdcAmount] = useState("");
    const [sharesAmount, setSharesAmount] = useState("");   
    const [showAlert, setShowAlert] = useState(false);

    const isWithdrawing = useSelector(state => state.dBank.withdrawing.isWithdrawing);
    const isWithdrawSuccess = useSelector(state => state.dBank.withdrawing.isSuccess);
    const transactionHash = useSelector(state => state.dBank.withdrawing.transactionHash);
    const chainId = useSelector(state => state.provider.chainId);

    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    const tokens = useSelector(state => state.tokens.contracts);
    const symbols = useSelector(state => state.tokens.symbols);
    const dBankSymbol = useSelector(state => state.dBank.symbol);    
    const shares = useSelector(state => state.dBank.shares);
    const balances = useSelector(state => state.tokens.balances);
    const dBank = useSelector(state => state.dBank.contract);
    const userTotalAllocated = useSelector(state => state.strategyRouter.userTotalAllocated);
    const strategyRouter = useSelector(state => state.strategyRouter.contract);

    const dispatch = useDispatch();

    const explorerMap = {
        1: 'https://etherscan.io/tx/',
        11155111: 'https://sepolia.etherscan.io/tx/',
        31337: ''
    };
    const explorerBaseUrl = explorerMap[chainId] || '';

    // Helper function to format numbers with max 4 decimals
    const formatWithMaxDecimals = (value, maxDecimals = 4) => {
        if (!value || value === "0" || parseFloat(value) === 0) return "0";
        const num = parseFloat(value);
        if (isNaN(num)) return "0";
        
        // If number has no decimals or very few, show as is
        const str = num.toString();
        const [, decimals] = str.split('.');
        if (!decimals || decimals.length <= maxDecimals) {
            return num.toString();
        }
        
        // Otherwise, limit to maxDecimals
        return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
    };

    // Calculate available shares for withdrawal (excluding allocated shares)
    const [availableShares, setAvailableShares] = useState(shares || "0");
    
    useEffect(() => {
        const calculateAvailableShares = async () => {
            if (!shares || !dBank || !strategyRouter || !userTotalAllocated || parseFloat(userTotalAllocated) === 0) {
                setAvailableShares(shares || "0");
                return;
            }
            try {
                const sharesBN = ethers.utils.parseUnits(shares || "0", 18);
                const userTotalAllocatedBN = ethers.utils.parseUnits(userTotalAllocated, 18);
                // Convert allocated capital to shares
                const allocatedSharesBN = await dBank.convertToShares(userTotalAllocatedBN);
                const availableSharesBN = sharesBN.sub(allocatedSharesBN);
                setAvailableShares(availableSharesBN.gt(0) ? ethers.utils.formatUnits(availableSharesBN, 18) : "0");
            } catch (error) {
                console.error("Error calculating available shares:", error);
                setAvailableShares(shares || "0");
            }
        };
        calculateAvailableShares();
    }, [shares, dBank, strategyRouter, userTotalAllocated]);

    const withdrawHandler = async (e) => {
        e.preventDefault();

        // Validate input
        if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        // CRITICAL: Always validate allocated shares before withdrawal
        // Get fresh data from contracts to ensure accuracy
        if (!dBank || !strategyRouter || !account) {
            alert("Error: Contracts not loaded. Please refresh the page.");
            return;
        }

        try {
            // Get current user shares from contract
            const currentSharesBN = await dBank.balanceOf(account);
            const currentShares = parseFloat(ethers.utils.formatUnits(currentSharesBN, 18));
            
            if (currentShares <= 0) {
                alert("You don't have any shares to withdraw.");
                return;
            }

            // Get user's total allocated capital from StrategyRouter
            const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
            const userTotalAllocatedValue = parseFloat(ethers.utils.formatUnits(userTotalAllocatedBN, 18));
            
            // Calculate shares that will be withdrawn (based on usdcAmount, which is what we send to contract)
            const assetsToWithdrawBN = ethers.utils.parseUnits(usdcAmount, 18);
            const sharesToWithdrawBN = await dBank.convertToShares(assetsToWithdrawBN);
            
            // If user has allocated capital, convert it to shares equivalent
            if (userTotalAllocatedBN.gt(0)) {
                const allocatedSharesBN = await dBank.convertToShares(userTotalAllocatedBN);
                const allocatedShares = parseFloat(ethers.utils.formatUnits(allocatedSharesBN, 18));
                
                // Calculate available (unallocated) shares
                const availableSharesBN = currentSharesBN.sub(allocatedSharesBN);
                const availableShares = parseFloat(ethers.utils.formatUnits(availableSharesBN, 18));
                
                // Check if trying to withdraw more than available shares
                if (sharesToWithdrawBN.gt(availableSharesBN)) {
                    alert(
                        `Cannot withdraw. You have ${allocatedShares.toFixed(4)} shares allocated to strategies ` +
                        `(out of ${currentShares.toFixed(4)} total shares). ` +
                        `You can only withdraw up to ${availableShares.toFixed(4)} shares. ` +
                        `Please un-allocate some shares first.`
                    );
                    return;
                }
            } else {
                // Even if no allocated capital, verify we're not withdrawing more than total shares
                if (sharesToWithdrawBN.gt(currentSharesBN)) {
                    alert(`Cannot withdraw. You only have ${currentShares.toFixed(4)} shares.`);
                    return;
                }
            }
        } catch (error) {
            console.error("Error validating withdrawal:", error);
            alert(`Error validating withdrawal: ${error.message || 'Unknown error'}. Please try again.`);
            return; // CRITICAL: Stop execution if validation fails
        }

        setShowAlert(false);

        const result = await withdrawFunds(provider, dBank, tokens, account, usdcAmount, dispatch);

        setShowAlert(true);

        if (result) {
            setUsdcAmount("");
            setSharesAmount("");
        } else {
            setUsdcAmount("");
            setSharesAmount("");
        }
    }

    const amountHandler = async (e) => {
        const value = e.target.value;

        // Handle empty input
        if (!value || value === "") {
            setUsdcAmount("");
            setSharesAmount("");
            return;
        }
        try {
            if (e.target.id === 'usdc') {
                setUsdcAmount(e.target.value);

                const amountInWei = ethers.utils.parseUnits(e.target.value || "0", 18);
                const sharesInWei = await dBank.convertToShares(amountInWei);
                const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);
                setSharesAmount(sharesFormatted);
            } else {
                setSharesAmount(e.target.value);
                
                const sharesInWei = ethers.utils.parseUnits(e.target.value || "0", 18);
                const assetsInWei = await dBank.convertToAssets(sharesInWei);
                const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
                setUsdcAmount(assetsFormatted);
            }
        } catch (error) {
            console.error("Conversion error:", error);
        }
    }

    // Max on asset input should withdraw max assets backed by user's available shares
    const maxHandlerBalance = async () => {
        if (!dBank || !strategyRouter || !account) return;

        try {
            // Get fresh data from contracts
            const currentSharesBN = await dBank.balanceOf(account);
            const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
            
            let availableSharesBN = currentSharesBN;
            
            // If user has allocated capital, calculate available shares
            if (userTotalAllocatedBN.gt(0)) {
                const allocatedSharesBN = await dBank.convertToShares(userTotalAllocatedBN);
                availableSharesBN = currentSharesBN.sub(allocatedSharesBN);
            }
            
            if (availableSharesBN.lte(0)) {
                alert("You don't have any unallocated shares to withdraw. Please un-allocate some shares first.");
                return;
            }
            
            const availableShares = ethers.utils.formatUnits(availableSharesBN, 18);
            const assetsInWei = await dBank.convertToAssets(availableSharesBN);
            const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
            
            setSharesAmount(availableShares);
            setUsdcAmount(assetsFormatted);
        } catch (error) {
            console.error("Max conversion error:", error);
            alert(`Error calculating max withdrawal: ${error.message || 'Unknown error'}`);
        }
    }

    // Max on shares input uses available share balance
    const maxHandlerShares = async () => {
        if (!dBank || !strategyRouter || !account) return;

        try {
            // Get fresh data from contracts
            const currentSharesBN = await dBank.balanceOf(account);
            const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
            
            let availableSharesBN = currentSharesBN;
            
            // If user has allocated capital, calculate available shares
            if (userTotalAllocatedBN.gt(0)) {
                const allocatedSharesBN = await dBank.convertToShares(userTotalAllocatedBN);
                availableSharesBN = currentSharesBN.sub(allocatedSharesBN);
            }
            
            if (availableSharesBN.lte(0)) {
                alert("You don't have any unallocated shares to withdraw. Please un-allocate some shares first.");
                return;
            }
            
            const availableShares = ethers.utils.formatUnits(availableSharesBN, 18);
            const assetsInWei = await dBank.convertToAssets(availableSharesBN);
            const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
            
            setSharesAmount(availableShares);
            setUsdcAmount(assetsFormatted);
        } catch (error) {
            console.error("Max shares conversion error:", error);
            alert(`Error calculating max withdrawal: ${error.message || 'Unknown error'}`);
        }
    }

    return (
        <div>
            <Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
            {account ? (
                <Form onSubmit={withdrawHandler} style={{ maxWidht: '450px', margin: '50px auto'}}>
                    <Row>
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Balance: {formatWithMaxDecimals(balances[0])}
                            {balances && balances[0] && parseFloat(balances[0]) > 0 && (
                                <span
                                    onClick={maxHandlerBalance}
                                    style={{
                                        color: '#0d6edf',
                                        cursor: 'pointer',
                                        marginLeft: '8px',
                                        textDecoration: 'underline',
                                    }}
                                    className='max-button'
                                >
                                    Max
                                </span>
                            )}
                        </Form.Text>
                        <InputGroup>
                            <Form.Control 
                              type='number' 
                              placeholder='0.0' 
                              min='0.0'
                              step="any"
                              id="usdc"
                              onChange={(e) => amountHandler(e)}
                              value={usdcAmount === 0 ? "" : usdcAmount}
                            />
                          <InputGroup.Text style={{ width: "100px" }} className="justify-content-center">
                             {symbols && symbols[0]}
                          </InputGroup.Text>

                        </InputGroup>
                    </Row>

                    <Row className='my-3'>                        
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Shares: {formatWithMaxDecimals(shares)}
                            {availableShares && parseFloat(availableShares) > 0 && parseFloat(availableShares) < parseFloat(shares || "0") && (
                                <span style={{ color: '#ffc107', marginLeft: '8px' }}>
                                    (Available: {formatWithMaxDecimals(availableShares)})
                                </span>
                            )}
                            {availableShares && parseFloat(availableShares) > 0 && (
                                <span
                                    onClick={maxHandlerShares}
                                    style={{
                                        color: '#0d6edf',
                                        cursor: 'pointer',
                                        marginLeft: '8px',
                                        textDecoration: 'underline',
                                    }}
                                    className='max-button'
                                >
                                    Max
                                </span>
                            )}
                        </Form.Text>                        
                        <InputGroup>
                            <Form.Control
                              type='number'
                              placeholder='0.0'
                              min='0.0'
                              step="any"
                              id="shares"
                              onChange={(e) => amountHandler(e)}
                              value={sharesAmount === 0 ? "" : sharesAmount}
                            /> 
                            <InputGroup.Text style={{ width: "100px" }} className="justify-content-center">
                                { dBankSymbol && dBankSymbol}
                            </InputGroup.Text>
                        </InputGroup>
                    </Row>

                    <Row className='my-4'>
                        <Button
                            variant='primary'
                            type='submit'
                            disabled={isWithdrawing || !usdcAmount}
                            >
                              {isWithdrawing && !isWithdrawSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  Approving ...
                                </>
                              ) : isWithdrawing && isWithdrawSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  Withdrawing ...
                                </>
                              ) : (
                                "Withdraw"
                              )}
                        </Button>
                    </Row>
                </Form>
            ) : (
                <p
                  className='d-flex justify-content-center align-items-center'
                  style={{ height: '300px'}}
                >
                    Please connect your wallet
                </p>
            )}
            </Card>

            {isWithdrawing ? (
                <Alert
                    message={'Withdraw Pending...'}
                    transactionHash={null}
                    variant={'info'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl}
                />
            ) : isWithdrawSuccess && showAlert ? (
                <Alert
                    message={'Withdraw Successful'}
                    transactionHash={transactionHash}
                    variant={'success'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl}
                />
            ) : !isWithdrawSuccess && showAlert ? (
                <Alert
                    message={'Withdraw Failed'}
                    transactionHash={null}
                    variant={'danger'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl}
                />
            ) : (
                <></>
            )}
        </div>
    );
};

export default Withdraw;