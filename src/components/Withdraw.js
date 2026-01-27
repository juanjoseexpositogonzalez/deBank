import { Card, Button, Spinner, Modal } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import { ethers } from 'ethers';

import Alert from './Alert'

import {
    withdrawFunds,
    loadBalances,
} from '../store/interactions';
import { formatWithMaxDecimals, getExplorerUrl } from '../utils/format';

import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect, useCallback, useRef } from 'react';

const Withdraw = () => {
    const [usdcAmount, setUsdcAmount] = useState("");
    const [sharesAmount, setSharesAmount] = useState("");   
    const [showAlert, setShowAlert] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    
    // Ref for debouncing conversion calls
    const conversionTimeoutRef = useRef(null);

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

    const explorerBaseUrl = getExplorerUrl(chainId);

    // Calculate available shares for withdrawal (block if allocated)
    const [availableShares, setAvailableShares] = useState(shares || "0");
    
    // Refresh balances when component mounts or when account/shares change
    useEffect(() => {
        const refreshBalances = async () => {
            if (dBank && tokens && account) {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                } catch (error) {
                    console.error("Error refreshing balances in Withdraw:", error);
                }
            }
        };
        refreshBalances();
    }, [account, dBank, tokens, dispatch]);
    
    // También refrescar cuando cambia el estado de withdraw (después de un withdraw exitoso)
    useEffect(() => {
        if (isWithdrawSuccess && dBank && tokens && account) {
            // Pequeño delay para asegurar que la transacción esté confirmada
            const timer = setTimeout(async () => {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                    console.log('Balances refreshed after withdraw success');
                } catch (error) {
                    console.error("Error refreshing balances after withdraw:", error);
                }
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isWithdrawSuccess, dBank, tokens, account, dispatch]);
    
    useEffect(() => {
        const calculateAvailableShares = async () => {
            if (!shares || !dBank || !strategyRouter || !userTotalAllocated || parseFloat(userTotalAllocated) === 0) {
                setAvailableShares(shares || "0");
                return;
            }
            try {
                // If there is any allocation, block withdrawals
                setAvailableShares("0");
            } catch (error) {
                console.error("Error calculating available shares:", error);
                setAvailableShares(shares || "0");
            }
        };
        calculateAvailableShares();
    }, [shares, dBank, strategyRouter, userTotalAllocated]);

    // Validate withdrawal before showing confirmation modal
    const handleWithdrawClick = async (e) => {
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
            if (userTotalAllocatedBN.gt(0)) {
                alert("You cannot withdraw while you have shares allocated. Unallocate first.");
                return;
            }

            // Calculate shares that will be withdrawn (based on usdcAmount)
            const assetsToWithdrawBN = ethers.utils.parseUnits(usdcAmount, 18);
            const sharesToWithdrawBN = await dBank.convertToShares(assetsToWithdrawBN);

            // Verify we're not withdrawing more than total shares
            if (sharesToWithdrawBN.gt(currentSharesBN)) {
                alert(`Cannot withdraw. You only have ${currentShares.toFixed(4)} shares.`);
                return;
            }
        } catch (error) {
            console.error("Error validating withdrawal:", error);
            alert(`Error validating withdrawal: ${error.message || 'Unknown error'}. Please try again.`);
            return;
        }

        // Validation passed, show confirmation modal
        setShowConfirmModal(true);
    };

    // Execute withdrawal after confirmation
    const confirmWithdraw = async () => {
        setShowConfirmModal(false);
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
    };

    const amountHandler = async (e) => {
        const value = e.target.value;
        const inputId = e.target.id;

        // Handle empty input
        if (!value || value === "") {
            setUsdcAmount("");
            setSharesAmount("");
            return;
        }

        // Set the input value immediately for responsive UI
        if (inputId === 'usdc') {
            setUsdcAmount(value);
        } else {
            setSharesAmount(value);
        }

        // Clear previous timeout
        if (conversionTimeoutRef.current) {
            clearTimeout(conversionTimeoutRef.current);
        }

        // Debounce the contract call (300ms delay)
        conversionTimeoutRef.current = setTimeout(async () => {
            try {
                if (inputId === 'usdc') {
                    const amountInWei = ethers.utils.parseUnits(value || "0", 18);
                    const sharesInWei = await dBank.convertToShares(amountInWei);
                    const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);
                    setSharesAmount(sharesFormatted);
                } else {
                    const sharesInWei = ethers.utils.parseUnits(value || "0", 18);
                    const assetsInWei = await dBank.convertToAssets(sharesInWei);
                    const assetsFormatted = ethers.utils.formatUnits(assetsInWei, 18);
                    setUsdcAmount(assetsFormatted);
                }
            } catch (error) {
                console.error("Conversion error:", error);
            }
        }, 300);
    }

    // Max on asset input should withdraw max assets backed by user's available shares
    const maxHandlerBalance = async () => {
        if (!dBank || !strategyRouter || !account) return;

        try {
            const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
            if (userTotalAllocatedBN.gt(0)) {
                alert("You cannot withdraw while you have shares allocated. Unallocate first.");
                // alert("No puedes retirar mientras tengas shares alocadas. Desaloca primero.");
                return;
            }

            const currentSharesBN = await dBank.balanceOf(account);
            if (currentSharesBN.lte(0)) {
                alert("You don't have any shares to withdraw.");
                return;
            }

            const availableShares = ethers.utils.formatUnits(currentSharesBN, 18);
            const assetsInWei = await dBank.convertToAssets(currentSharesBN);
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
            const userTotalAllocatedBN = await strategyRouter.getUserTotalAllocated(account);
            if (userTotalAllocatedBN.gt(0)) {
                alert("You cannot withdraw while you have shares allocated. Unallocate first.");
                // alert("No puedes retirar mientras tengas shares alocadas. Desaloca primero.");
                return;
            }

            const currentSharesBN = await dBank.balanceOf(account);
            if (currentSharesBN.lte(0)) {
                alert("You don't have any shares to withdraw.");
                return;
            }

            const availableShares = ethers.utils.formatUnits(currentSharesBN, 18);
            const assetsInWei = await dBank.convertToAssets(currentSharesBN);
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
                <Form onSubmit={handleWithdrawClick} style={{ maxWidht: '450px', margin: '50px auto'}}>
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
                        <InputGroup hasValidation>
                            <Form.Control 
                              type='number' 
                              placeholder='0.0' 
                              min='0.0'
                              step="any"
                              id="usdc"
                              onChange={(e) => amountHandler(e)}
                              value={usdcAmount === 0 ? "" : usdcAmount}
                              isInvalid={sharesAmount && availableShares && parseFloat(sharesAmount) > parseFloat(availableShares)}
                            />
                          <InputGroup.Text style={{ width: "100px" }} className="justify-content-center">
                             {symbols && symbols[0]}
                          </InputGroup.Text>
                          <Form.Control.Feedback type="invalid">
                            Amount exceeds available shares
                          </Form.Control.Feedback>
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

            {/* Confirmation Modal */}
            <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered>
                <Modal.Header closeButton style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                    <Modal.Title style={{ color: '#f8f9fa' }}>Confirm Withdrawal</Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ backgroundColor: '#1a1d29', color: '#adb5bd' }}>
                    <p>Are you sure you want to withdraw?</p>
                    <p className="mb-0">
                        <strong style={{ color: '#f8f9fa' }}>{formatWithMaxDecimals(usdcAmount, 4)} {symbols && symbols[0]}</strong>
                        <br />
                        <small>({formatWithMaxDecimals(sharesAmount, 4)} shares)</small>
                    </p>
                </Modal.Body>
                <Modal.Footer style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                    <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={confirmWithdraw}>
                        Confirm Withdrawal
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default Withdraw;