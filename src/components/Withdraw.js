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
import { useState, useEffect, useRef, useCallback } from 'react';

const Withdraw = () => {
    const [usdcAmount, setUsdcAmount] = useState("");
    const [sharesAmount, setSharesAmount] = useState("");
    const [showAlert, setShowAlert] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [maxWithdrawable, setMaxWithdrawable] = useState("0");

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
    const depositorsList = useSelector(state => state.dBank.depositors.list);
    const depositorsLoading = useSelector(state => state.dBank.depositors.isLoading);

    const dispatch = useDispatch();

    const explorerBaseUrl = getExplorerUrl(chainId);

    // Load maxWithdraw from contract (capped to buffer, perTxCap, and user assets)
    const refreshMaxWithdraw = useCallback(async () => {
        if (!dBank || !account) {
            setMaxWithdrawable("0");
            return;
        }
        try {
            const maxBN = await dBank.maxWithdraw(account);
            setMaxWithdrawable(ethers.utils.formatUnits(maxBN, 18));
        } catch (error) {
            console.error("Error loading maxWithdraw:", error);
            setMaxWithdrawable("0");
        }
    }, [dBank, account]);

    // Refresh balances, depositors, and maxWithdraw when component mounts
    useEffect(() => {
        const refreshData = async () => {
            if (dBank && tokens && account) {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                    await loadDepositors(dBank, dispatch);
                    await refreshMaxWithdraw();
                } catch (error) {
                    console.error("Error refreshing data in Withdraw:", error);
                }
            }
        };
        refreshData();
    }, [account, dBank, tokens, dispatch, refreshMaxWithdraw]);

    // Refresh after successful withdraw (balances + maxWithdraw cap)
    useEffect(() => {
        if (isWithdrawSuccess && dBank && tokens && account) {
            const refreshAfterWithdraw = async () => {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                    await loadDepositors(dBank, dispatch);
                    await refreshMaxWithdraw();
                } catch (error) {
                    console.error("Error refreshing balances after withdraw:", error);
                }
            };
            refreshAfterWithdraw();
        }
    }, [isWithdrawSuccess, dBank, tokens, account, dispatch, refreshMaxWithdraw]);

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
            // Validate against contract's maxWithdraw (accounts for buffer, perTxCap, user assets)
            const assetsToWithdrawBN = ethers.utils.parseUnits(usdcAmount, 18);
            const maxWithdrawBN = await dBank.maxWithdraw(account);

            if (assetsToWithdrawBN.gt(maxWithdrawBN)) {
                const maxFormatted = parseFloat(ethers.utils.formatUnits(maxWithdrawBN, 18)).toFixed(4);
                alert(`Cannot withdraw ${usdcAmount}. Maximum available: ${maxFormatted} (limited by vault buffer).`);
                return;
            }

            const currentSharesBN = await dBank.balanceOf(account);
            if (currentSharesBN.lte(0)) {
                alert("You don't have any shares to withdraw.");
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

        await withdrawFunds(provider, dBank, tokens, account, usdcAmount, dispatch);

        setShowAlert(true);

        // Always clear inputs and refresh max withdrawal cap
        setUsdcAmount("");
        setSharesAmount("");
        await refreshMaxWithdraw();
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

    // Max on asset input - uses contract's maxWithdraw (capped to buffer)
    const maxHandlerBalance = async () => {
        if (!dBank || !account) return;

        try {
            const maxBN = await dBank.maxWithdraw(account);
            if (maxBN.lte(0)) {
                alert("No funds available to withdraw. The vault buffer may be empty.");
                return;
            }

            const sharesBN = await dBank.convertToShares(maxBN);
            setUsdcAmount(ethers.utils.formatUnits(maxBN, 18));
            setSharesAmount(ethers.utils.formatUnits(sharesBN, 18));
        } catch (error) {
            console.error("Max conversion error:", error);
        }
    }

    // Max on shares input - uses contract's maxRedeem (capped to buffer)
    const maxHandlerShares = async () => {
        if (!dBank || !account) return;

        try {
            const maxSharesBN = await dBank.maxRedeem(account);
            if (maxSharesBN.lte(0)) {
                alert("No shares available to redeem. The vault buffer may be empty.");
                return;
            }

            const assetsBN = await dBank.convertToAssets(maxSharesBN);
            setUsdcAmount(ethers.utils.formatUnits(assetsBN, 18));
            setSharesAmount(ethers.utils.formatUnits(maxSharesBN, 18));
        } catch (error) {
            console.error("Max shares conversion error:", error);
        }
    }

    return (
        <div>
            <Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
            {account ? (
                <Form onSubmit={handleWithdrawClick} style={{ maxWidht: '450px', margin: '50px auto'}}>
                    {parseFloat(maxWithdrawable) > 0 && (
                        <Row>
                            <Form.Text className='text-center my-2' style={{ color: '#20c997', fontSize: '0.95rem', fontWeight: '500' }}>
                                Available to withdraw: {formatWithMaxDecimals(maxWithdrawable)} {symbols && symbols[0]}
                            </Form.Text>
                        </Row>
                    )}
                    <Row>
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Wallet Balance: {formatWithMaxDecimals(balances && balances[0] ? balances[0] : "0")} {symbols && symbols[0]}
                            {parseFloat(maxWithdrawable) > 0 && (
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
                              isInvalid={usdcAmount && parseFloat(usdcAmount) > parseFloat(maxWithdrawable)}
                            />
                          <InputGroup.Text style={{ width: "100px" }} className="justify-content-center">
                             {symbols && symbols[0]}
                          </InputGroup.Text>
                          <Form.Control.Feedback type="invalid">
                            Amount exceeds available buffer (unallocated capital)
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