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
import { useState } from 'react';

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

    const withdrawHandler = async (e) => {
        e.preventDefault();

        // Validate input
        if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
            alert("Please enter a valid amount");
            return;
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

    // Max on asset input should withdraw max assets backed by user's shares
    const maxHandlerBalance = async () => {
        const currentShares = shares;
        if (!currentShares || parseFloat(currentShares) <= 0) return;

        try {
            const sharesInWei = ethers.utils.parseUnits(currentShares, 18);
            const assetsInWei = await dBank.convertToAssets(sharesInWei);
            const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
            setSharesAmount(currentShares);
            setUsdcAmount(assetsFormatted);
        } catch (error) {
            console.error("Max conversion error:", error);
        }
    }

    // Max on shares input uses full share balance
    const maxHandlerShares = async () => {
        const currentShares = shares;
        if (!currentShares || parseFloat(currentShares) <= 0) return;

        try {
            const sharesInWei = ethers.utils.parseUnits(currentShares, 18);
            const assetsInWei = await dBank.convertToAssets(sharesInWei);
            const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
            setSharesAmount(currentShares);
            setUsdcAmount(assetsFormatted);
        } catch (error) {
            console.error("Max shares conversion error:", error);
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
                            {shares && parseFloat(shares) > 0 && (
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