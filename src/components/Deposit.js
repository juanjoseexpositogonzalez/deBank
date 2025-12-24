import { Card, Button, Spinner } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import { ethers } from 'ethers';

import Alert from './Alert'

import {
    depositFunds,    
} from '../store/interactions';

import { useSelector, useDispatch } from 'react-redux';
import { useState } from 'react';


const Deposit = () => {
    const [usdcAmount, setUsdcAmount] = useState("");
    const [sharesAmount, setSharesAmount] = useState("");   
    const [showAlert, setShowAlert] = useState(false);

    const isDepositing = useSelector(state => state.dBank.depositing.isDepositing);
    const isDepositSuccess = useSelector(state => state.dBank.depositing.isSuccess);
    const transactionHash = useSelector(state => state.dBank.depositing.transactionHash);
    
    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    const tokens = useSelector(state => state.tokens.contracts);
    const symbols = useSelector(state => state.tokens.symbols);
    const dBankSymbol = useSelector(state => state.dBank.symbol);    
    const shares = useSelector(state => state.dBank.shares);
    const balances = useSelector(state => state.tokens.balances);
    const dBank = useSelector(state => state.dBank.contract);

    const dispatch = useDispatch();

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
    
                // Fetch value from chain in USD
                const amountInWei = ethers.utils.parseUnits(e.target.value || "0", 18);
                const sharesInWei = await dBank.convertToShares(amountInWei);
                const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);
                // Set shares
                setSharesAmount(sharesFormatted);
            } else {
                setSharesAmount(e.target.value);
    
                // Convert shares to assets (both in wei)
                const sharesInWei = ethers.utils.parseUnits(e.target.value || "0", 18);
                const assetsInWei = await dBank.convertToAssets(sharesInWei);
                const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
                // Set usdc
                setUsdcAmount(assetsFormatted);
            }
        } catch (error) {
            console.error("Conversion error:", error);
        }
        
    }

    const maxHandlerBalance = async () => {
        // Get user's full balance from Redux state
        const maxBalance = balances[0];

        // Handle edge cases
        if (!maxBalance || parseFloat(maxBalance) <= 0) {
            return;
        }

        // Set USDC amount to max blanace
        setUsdcAmount(maxBalance);

        // Calculate corresponding shares
        try {
            const amountInWei = ethers.utils.parseUnits(maxBalance, 18);
            const sharesInWei = await dBank.convertToShares(amountInWei);
            const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);
            setSharesAmount(sharesFormatted);

        } catch (error) {
            console.error("Max conversion error:", error);
        }
    }

    const maxHandlerShares = async () => {
        // Use available token balance to compute max purchasable shares
        const maxUsdc = balances && balances[0];

        if (!maxUsdc || parseFloat(maxUsdc) <= 0) {
            return;
        }

        try {
            const amountInWei = ethers.utils.parseUnits(maxUsdc, 18);
            const sharesInWei = await dBank.convertToShares(amountInWei);
            const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);

            // Set both fields coherently
            setUsdcAmount(maxUsdc);
            setSharesAmount(sharesFormatted);
        } catch (error) {
            console.error("Max conversion error:", error);
        }
    }

    const depositHandler = async (e) => {
        e.preventDefault();

        // Validate input
        if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        // reset alerts and start flow
        setShowAlert(false);

        const result = await depositFunds(provider, dBank, tokens, account, usdcAmount, dispatch);
        
        setShowAlert(true);

        if (result) {
            setUsdcAmount("");
            setSharesAmount("");
        } else {
            setUsdcAmount("");
            setSharesAmount("");
        }
    }
    return (
        <div>
            <Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
            {account ? (
                <Form onSubmit={depositHandler} style={{ maxWidht: '450px', margin: '50px auto'}}>
                    <Row>
                        <Form.Text className='text-end my-2' muted>
                            Balance: {balances[0] || "0"}
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
                        <Form.Text className='text-end my-2' muted>
                            Shares: {shares || "0"}
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
                            disabled={isDepositing || !usdcAmount}
                            >
                              {isDepositing && !isDepositSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  Approving ...
                                </>
                              ) : isDepositing && isDepositSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  Depositing ...
                                </>
                              ) : (
                                "Deposit"
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

            {isDepositing ? (
                <Alert
                    message={'Deposit Pending...'}
                    transactionHash={null}
                    variant={'info'}
                    setShowAlert={setShowAlert}
                />
                ) : isDepositSuccess && showAlert ? (
                <Alert
                    message={'Deposit Successful'}
                    transactionHash={transactionHash}
                    variant={'success'}
                    setShowAlert={setShowAlert}
                />
                ) : !isDepositSuccess && showAlert ? (
                <Alert
                    message={'Deposit Failed'}
                    transactionHash={null}
                    variant={'danger'}
                    setShowAlert={setShowAlert}
                />
                ) : (
                <></>
                )}
        </div>
    );
}

export default Deposit;
