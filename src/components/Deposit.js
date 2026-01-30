import { Card, Button, Spinner, Table } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import { ethers } from 'ethers';

import Alert from './Alert'

import {
    depositFunds,
    depositViaX402,
    loadBalances,
    loadDepositors,
} from '../store/interactions';
import { isX402Available } from '../utils/x402Config';
import { formatWithMaxDecimals, getExplorerUrl, truncateAddress } from '../utils/format';

import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect, useRef } from 'react';


const Deposit = () => {
    const [usdcAmount, setUsdcAmount] = useState("");
    const [sharesAmount, setSharesAmount] = useState("");
    const [showAlert, setShowAlert] = useState(false);
    const [useX402, setUseX402] = useState(false);
    const [x402Loading, setX402Loading] = useState(false);
    const [vaultValue, setVaultValue] = useState("0");
    
    // Ref for debouncing conversion calls
    const conversionTimeoutRef = useRef(null);

    const isDepositing = useSelector(state => state.dBank.depositing.isDepositing);
    const isDepositSuccess = useSelector(state => state.dBank.depositing.isSuccess);
    const transactionHash = useSelector(state => state.dBank.depositing.transactionHash);
    const isX402Deposit = useSelector(state => state.dBank.depositing.isX402Deposit);
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

    // Refresh balances on mount so the vault position is always current
    useEffect(() => {
        const refreshBalances = async () => {
            if (dBank && tokens && tokens.length > 0 && account) {
                try {
                    await loadBalances(dBank, tokens, account, dispatch);
                } catch (error) {
                    console.error("Error refreshing balances in Deposit:", error);
                }
            }
        };
        refreshBalances();
    }, [account, dBank, tokens, dispatch]);

    // Compute the user's vault value in USDC from their shares
    useEffect(() => {
        const computeVaultValue = async () => {
            if (!dBank || !shares || parseFloat(shares) <= 0) {
                setVaultValue("0");
                return;
            }
            try {
                const sharesBN = ethers.utils.parseUnits(shares.toString(), 18);
                const assetsBN = await dBank.convertToAssets(sharesBN);
                setVaultValue(ethers.utils.formatUnits(assetsBN, 18));
            } catch (error) {
                // Fallback: in the 1:1 model shares ≈ USDC
                setVaultValue(shares.toString());
            }
        };
        computeVaultValue();
    }, [dBank, shares]);

    // Refrescar balances cuando hay un depósito exitoso (especialmente para x402)
    useEffect(() => {
        if (isDepositSuccess && dBank && tokens && tokens.length > 0 && account) {
            // Delay para asegurar que la transacción esté confirmada
            const timer = setTimeout(async () => {
                try {
                    console.log('Refreshing balances due to deposit success...');
                    await loadBalances(dBank, tokens, account, dispatch);
                    await loadDepositors(dBank, dispatch);
                    console.log('Balances refreshed from useEffect after deposit success');
                } catch (error) {
                    console.error('Error refreshing balances in useEffect:', error);
                }
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isDepositSuccess, dBank, tokens, account, dispatch]);

    // Periodic refresh of depositors (every 30s)
    useEffect(() => {
        if (!dBank) return;
        const interval = setInterval(() => {
            loadDepositors(dBank, dispatch);
        }, 30000);
        return () => clearInterval(interval);
    }, [dBank, dispatch]);

    const explorerBaseUrl = getExplorerUrl(chainId);
    
    // Verificar si x402 está disponible
    const x402Available = isX402Available(chainId);

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
                    // Fetch value from chain in USD
                    const amountInWei = ethers.utils.parseUnits(value || "0", 18);
                    const sharesInWei = await dBank.convertToShares(amountInWei);
                    const sharesFormatted = ethers.utils.formatUnits(sharesInWei, 18);
                    setSharesAmount(sharesFormatted);
                } else {
                    // Convert shares to assets (both in wei)
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

        // Si usa x402, usar flujo x402
        if (useX402 && x402Available) {
            setX402Loading(true);
            try {
                const result = await depositViaX402(provider, account, usdcAmount, dispatch, chainId);
                setShowAlert(true);
                
                if (result && result.ok) {
                    // Esperar un poco más para que la transacción se confirme completamente en la blockchain
                    // Base Sepolia puede tener tiempos de confirmación variables
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Recargar balances después de depósito exitoso
                    // Usar los contratos del estado Redux, o recargarlos si no están disponibles
                    try {
                        // Intentar múltiples veces para asegurar que los valores se actualicen
                        let retries = 3;
                        let balancesUpdated = false;
                        
                        while (retries > 0 && !balancesUpdated) {
                            try {
                                if (dBank && tokens && tokens.length > 0 && account) {
                                    await loadBalances(dBank, tokens, account, dispatch);
                                    console.log(`Balances reloaded after x402 deposit (attempt ${4 - retries})`);
                                    
                                    // Verificar que los valores se actualizaron
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                    balancesUpdated = true;
                                } else {
                                    // Si los contratos no están disponibles, intentar recargarlos
                                    console.warn('Contracts not available, attempting to reload...', {
                                        hasDBank: !!dBank,
                                        hasTokens: !!tokens,
                                        tokensLength: tokens?.length,
                                        hasAccount: !!account
                                    });
                                    
                                    // Recargar contratos y balances
                                    const { loadTokens, loadBank } = await import('../store/interactions');
                                    const freshTokens = await loadTokens(provider, chainId, dispatch);
                                    const freshDBank = await loadBank(provider, chainId, dispatch);
                                    
                                    if (freshDBank && freshTokens && freshTokens.length > 0 && account) {
                                        await loadBalances(freshDBank, freshTokens, account, dispatch);
                                        console.log('Balances reloaded after reloading contracts');
                                        balancesUpdated = true;
                                    }
                                }
                            } catch (retryError) {
                                console.warn(`Retry ${4 - retries} failed:`, retryError.message);
                                retries--;
                                if (retries > 0) {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }
                        }
                        
                        if (!balancesUpdated) {
                            console.error('Failed to update balances after multiple retries');
                        }
                    } catch (balanceError) {
                        console.error('Error reloading balances after x402 deposit:', balanceError);
                        // No lanzar error, solo loguear - el depósito fue exitoso
                        // El usuario puede recargar manualmente refrescando la página
                    }
                    setUsdcAmount("");
                    setSharesAmount("");
                } else {
                    // Error ya manejado por depositFail en Redux
                }
            } catch (error) {
                console.error('x402 deposit error:', error);
                alert(`Error: ${error.message}`);
            } finally {
                setX402Loading(false);
            }
        } else {
            // Flujo tradicional
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
    }
    return (
        <div>
            <Card style={{ maxWidth: '450px'}} className='mx-auto px-4'>
            {account ? (
                <Form onSubmit={depositHandler} style={{ maxWidht: '450px', margin: '50px auto'}}>
                    {/* Vault position indicator */}
                    {parseFloat(vaultValue) > 0 && (
                        <Row>
                            <Form.Text className='text-center my-2' style={{ color: '#20c997', fontSize: '0.95rem', fontWeight: '500' }}>
                                In Vault: {formatWithMaxDecimals(vaultValue)} {symbols && symbols[0]}
                                {' '}({formatWithMaxDecimals(shares)} {dBankSymbol})
                            </Form.Text>
                        </Row>
                    )}
                    <Row>
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Wallet: {formatWithMaxDecimals(balances && balances[0] ? balances[0] : "0")}
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
                              isInvalid={usdcAmount && balances && balances[0] && parseFloat(usdcAmount) > parseFloat(balances[0])}
                            />
                          <InputGroup.Text style={{ width: "100px" }} className="justify-content-center">
                             {symbols && symbols[0]}
                          </InputGroup.Text>
                          <Form.Control.Feedback type="invalid">
                            Amount exceeds available balance
                          </Form.Control.Feedback>
                        </InputGroup>
                    </Row>

                    <Row className='my-3'>                        
                        <Form.Text className='text-end my-2' style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                            Shares: {formatWithMaxDecimals(shares || "0")}
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

                    {x402Available ? (
                        <Row className='my-3'>
                            <Form.Check
                                type="switch"
                                id="use-x402"
                                // label="Aportar con x402 (pago on-chain automático)"
                                label="Deposit with x402 (automatic on-chain payment)"
                                checked={useX402}
                                onChange={(e) => setUseX402(e.target.checked)}
                                disabled={x402Loading || isDepositing}
                            />
                            <Form.Text style={{ fontSize: '0.85rem', color: '#6c757d', fontWeight: '400' }}>
                                x402 allows automatic payments without prior approvals. Only available on Base Sepolia.
                            </Form.Text>
                        </Row>
                    ) : (chainId === 84532 || chainId === '84532') ? (
                        <Row className='my-3'>
                            <Form.Text className="text-warning" style={{ fontSize: '0.85rem' }}>
                                ⚠️ x402 is available on Base Sepolia but not configured. Verify config.json.
                            </Form.Text>
                        </Row>
                    ) : null}

                    <Row className='my-4'>
                        <Button
                            variant='primary'
                            type='submit'
                            disabled={(isDepositing || x402Loading) || !usdcAmount}
                            >
                              {(isDepositing || x402Loading) && !isDepositSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  {useX402 ? 'Processing x402 payment...' : 'Approving ...'}
                                </>
                              ) : (isDepositing || x402Loading) && isDepositSuccess ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                                  {useX402 ? 'Depositing with x402 ...' : 'Depositing ...'}
                                </>
                              ) : (
                                useX402 ? "Deposit with x402" : "Deposit"
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

            {isDepositing ? (
                <Alert
                    message={isX402Deposit ? 'Deposit with x402 Pending...' : 'Deposit Pending...'}
                    transactionHash={null}
                    variant={'info'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl}
                />
            ) : isDepositSuccess && showAlert ? (
                <Alert
                    message={isX402Deposit ? 'Deposit with x402 Successful' : 'Deposit Successful'}
                    transactionHash={transactionHash}
                    variant={'success'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl}
                />
            ) : !isDepositSuccess && showAlert ? (
                <Alert
                    message={isX402Deposit ? 'Deposit with x402 Failed' : 'Deposit Failed'}
                    transactionHash={null}
                    variant={'danger'}
                    setShowAlert={setShowAlert}
                    explorerBaseUrl={explorerBaseUrl} />
            ) : <></>}
        </div>
    );
};

export default Deposit;
