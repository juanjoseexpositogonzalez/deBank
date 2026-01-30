import { Card, Button, Spinner, Modal, Table } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import { ethers } from 'ethers';

import Alert from './Alert'

import {
    withdrawFunds,
    loadBalances,
    loadDepositors,
} from '../store/interactions';
import { formatWithMaxDecimals, getExplorerUrl, truncateAddress } from '../utils/format';

import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect, useRef } from 'react';

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
    const withdrawErrorMessage = useSelector(state => state.dBank.withdrawing.errorMessage);
    const chainId = useSelector(state => state.provider.chainId);

    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    const tokens = useSelector(state => state.tokens.contracts);
    const symbols = useSelector(state => state.tokens.symbols);
    const dBankSymbol = useSelector(state => state.dBank.symbol);
    const shares = useSelector(state => state.dBank.shares);
    const balances = useSelector(state => state.tokens.balances);
    const dBank = useSelector(state => state.dBank.contract);
    const strategyRouter = useSelector(state => state.strategyRouter.contract);
    const depositorsList = useSelector(state => state.dBank.depositors.list);
    const depositorsLoading = useSelector(state => state.dBank.depositors.isLoading);

    const dispatch = useDispatch();

    const explorerBaseUrl = getExplorerUrl(chainId);

    // Available shares = user's full vault balance
    // Strategy allocations are independent (tokens go from wallet, not vault)
    const availableShares = shares || "0";

    // Refresh balances when component mounts
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

    // Refresh after successful withdraw
    useEffect(() => {
        if (isWithdrawSuccess && dBank && tokens && account) {
            const refreshAfterWithdraw = async () => {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                    await loadDepositors(dBank, dispatch);
                } catch (error) {
                    console.error("Error refreshing balances after withdraw:", error);
                }
            };
            refreshAfterWithdraw();
        }
    }, [isWithdrawSuccess, dBank, tokens, account, dispatch]);

    // Periodic refresh of depositors (every 30s)
    useEffect(() => {
        if (!dBank) return;
        const interval = setInterval(() => {
            loadDepositors(dBank, dispatch);
        }, 30000);
        return () => clearInterval(interval);
    }, [dBank, dispatch]);

    // Validate withdrawal before showing confirmation modal
    const handleWithdrawClick = async (e) => {
        e.preventDefault();

        // Validate input
        if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        if (!dBank || !account) {
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

            // Basic validation: don't exceed total balance
            // The contract will validate allocations - if rejected, we show a friendly error
            const assetsToWithdrawBN = ethers.utils.parseUnits(usdcAmount, 18);
            const sharesToWithdrawBN = await dBank.convertToShares(assetsToWithdrawBN);

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

    // Max on asset input - sets to unallocated vault balance (total shares minus strategy allocations)
    const maxHandlerBalance = async () => {
        if (!dBank || !account) return;

        try {
            const currentSharesBN = await dBank.balanceOf(account);
            if (currentSharesBN.lte(0)) {
                alert("You don't have any shares to withdraw.");
                return;
            }

            // Subtract allocated shares
            let unallocatedSharesBN = currentSharesBN;
            if (strategyRouter) {
                try {
                    const allocatedBN = await strategyRouter.getUserTotalAllocated(account);
                    const allocatedSharesBN = await dBank.convertToShares(allocatedBN);
                    unallocatedSharesBN = currentSharesBN.gt(allocatedSharesBN)
                        ? currentSharesBN.sub(allocatedSharesBN)
                        : ethers.BigNumber.from(0);
                } catch (err) {
                    console.warn("Could not fetch allocated shares:", err.message);
                }
            }

            if (unallocatedSharesBN.lte(0)) {
                alert("All your shares are allocated to strategies. Un-allocate first.");
                return;
            }

            const assetsBN = await dBank.convertToAssets(unallocatedSharesBN);
            setUsdcAmount(ethers.utils.formatUnits(assetsBN, 18));
            setSharesAmount(ethers.utils.formatUnits(unallocatedSharesBN, 18));
        } catch (error) {
            console.error("Max conversion error:", error);
        }
    }

    // Max on shares input - sets to unallocated vault balance
    const maxHandlerShares = async () => {
        if (!dBank || !account) return;

        try {
            const currentSharesBN = await dBank.balanceOf(account);
            if (currentSharesBN.lte(0)) {
                alert("You don't have any shares to withdraw.");
                return;
            }

            // Subtract allocated shares
            let unallocatedSharesBN = currentSharesBN;
            if (strategyRouter) {
                try {
                    const allocatedBN = await strategyRouter.getUserTotalAllocated(account);
                    const allocatedSharesBN = await dBank.convertToShares(allocatedBN);
                    unallocatedSharesBN = currentSharesBN.gt(allocatedSharesBN)
                        ? currentSharesBN.sub(allocatedSharesBN)
                        : ethers.BigNumber.from(0);
                } catch (err) {
                    console.warn("Could not fetch allocated shares:", err.message);
                }
            }

            if (unallocatedSharesBN.lte(0)) {
                alert("All your shares are allocated to strategies. Un-allocate first.");
                return;
            }

            const assetsBN = await dBank.convertToAssets(unallocatedSharesBN);
            setUsdcAmount(ethers.utils.formatUnits(assetsBN, 18));
            setSharesAmount(ethers.utils.formatUnits(unallocatedSharesBN, 18));
        } catch (error) {
            console.error("Max shares conversion error:", error);
        }
    }

    return (
        <div>
            <Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
            {account ? (
                <Form onSubmit={handleWithdrawClick} style={{ maxWidht: '450px', margin: '50px auto'}}>
                    <Row>
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Wallet Balance: {formatWithMaxDecimals(balances && balances[0] ? balances[0] : "0")} {symbols && symbols[0]}
                            {availableShares && parseFloat(availableShares) > 0 && (
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
                            Wallet Shares: {formatWithMaxDecimals(shares)} {dBankSymbol}
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

            {/* Depositors Table */}
            <Card style={{ maxWidth: '450px' }} className='mx-auto mt-4 px-3 py-3'>
                <h6 className='text-center mb-3' style={{ color: '#f8f9fa' }}>Vault Depositors</h6>
                {depositorsLoading ? (
                    <div className='text-center py-3'>
                        <Spinner animation="border" size="sm" />
                    </div>
                ) : depositorsList && depositorsList.length > 0 ? (
                    <Table striped bordered hover size="sm" variant="dark" style={{ fontSize: '0.85rem' }}>
                        <thead>
                            <tr>
                                <th>Address</th>
                                <th className='text-end'>Amount ({symbols && symbols[0]})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {depositorsList.map((d, i) => (
                                <tr key={i}>
                                    <td title={d.address}>{truncateAddress(d.address)}</td>
                                    <td className='text-end'>{formatWithMaxDecimals(d.usdcValue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                ) : (
                    <p className='text-center text-muted mb-0' style={{ fontSize: '0.85rem' }}>No depositors yet</p>
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
                    errorDetails={withdrawErrorMessage}
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