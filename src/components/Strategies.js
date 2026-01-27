import { useState, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Form, Button, InputGroup, Row, Spinner, Table } from 'react-bootstrap';
import { ethers } from 'ethers';

import Alert from './Alert';
import { allocateToStrategy, unallocateFromStrategy, loadUserStrategyAllocations, loadBalances, loadStrategyRouter } from '../store/interactions';

const formatBn = (bn) => {
  try {
    return ethers.utils.formatUnits(bn, 18);
  } catch {
    return '0';
  }
};

const formatWithMaxDecimals = (value, maxDecimals = 4) => {
  try {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    // Remove trailing zeros
    return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
};

const toWei = (v) => {
  try {
    if (v === null || v === undefined) return ethers.BigNumber.from(0);
    if (Array.isArray(v)) return ethers.BigNumber.from(0);
    if (ethers.BigNumber.isBigNumber(v)) return v;
    const asString = String(v);
    if (!asString || asString === 'undefined') return ethers.BigNumber.from(0);
    if (asString.includes('.')) return ethers.utils.parseUnits(asString, 18);
    return ethers.BigNumber.from(asString);
  } catch {
    return ethers.BigNumber.from(0);
  }
};

const Strategies = () => {
  const dispatch = useDispatch();

  const provider = useSelector(state => state.provider.connection);
  const chainId = useSelector(state => state.provider.chainId);
  const account = useSelector(state => state.provider.account);
  const tokens = useSelector(state => state.tokens.contracts);
  const dBank = useSelector(state => state.dBank.contract);

  const userShares = useSelector(state => state.dBank.shares) || "0";
  const [userSharesOnChain, setUserSharesOnChain] = useState(null);
  const [allocationSharesByStrategy, setAllocationSharesByStrategy] = useState([]);
  const [, setPricePerShare] = useState("0"); // Used internally for calculations
  const userSharesStr = useMemo(() => {
    if (!userShares) return '0';
    if (Array.isArray(userShares)) return '0';
    if (ethers.BigNumber.isBigNumber(userShares)) return ethers.utils.formatUnits(userShares, 18);
    const s = String(userShares);
    return s && s !== 'undefined' ? s : '0';
  }, [userShares]);
  const displaySharesStr = useMemo(() => userSharesOnChain || userSharesStr, [userSharesOnChain, userSharesStr]);

  const strategyRouter = useSelector(state => state.strategyRouter.contract);
  const strategies = useSelector(state => state.strategyRouter.strategies) || [];
  const strategyCap = useSelector(state => state.strategyRouter.strategyCap);
  const strategyAllocated = useSelector(state => state.strategyRouter.strategyAllocated);
  const strategyPaused = useSelector(state => state.strategyRouter.strategyPaused) || [];
  const strategyActive = useSelector(state => state.strategyRouter.strategyActive) || [];
  const symbols = useSelector(state => state.tokens.symbols) || [];
  const userStrategyAllocationsRaw = useSelector(state => state.strategyRouter.userStrategyAllocations);
  const userStrategyAllocationsValueRaw = useSelector(state => state.strategyRouter.userStrategyAllocationsValue);
  const userTotalAllocated = useSelector(state => state.strategyRouter.userTotalAllocated || "0");
  const userTotalAllocatedValue = useSelector(state => state.strategyRouter.userTotalAllocatedValue || "0");
  const userStrategyAllocations = useMemo(() => userStrategyAllocationsRaw || [], [userStrategyAllocationsRaw]);
  const userStrategyAllocationsValue = useMemo(() => userStrategyAllocationsValueRaw || [], [userStrategyAllocationsValueRaw]);

  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [isAllocating, setIsAllocating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [mode, setMode] = useState('allocate'); // 'allocate' | 'unallocate'

  const explorerMap = {
    1: 'https://etherscan.io/tx/',
    11155111: 'https://sepolia.etherscan.io/tx/',
    84532: 'https://sepolia.basescan.org/tx/',
    31337: ''
  };
  const explorerBaseUrl = explorerMap[chainId] || '';

  // Stable refs for useMemo deps
  const capsMemo = useMemo(() => strategyCap || [], [strategyCap]);
  const allocatedMemo = useMemo(() => strategyAllocated || [], [strategyAllocated]);

  const remainingForSelected = useMemo(() => {
    if (!selectedId) return '0';
    const idx = Number(selectedId) - 1;
    const cap = capsMemo[idx];
    const allocated = allocatedMemo[idx];
    try {
      const capWei = ethers.BigNumber.from(cap || 0);
      const allocWei = ethers.BigNumber.from(allocated || 0);
      if (capWei.lte(allocWei)) return '0';
      return formatBn(capWei.sub(allocWei));
    } catch {
      return '0';
    }
  }, [selectedId, capsMemo, allocatedMemo]);

  const unallocatedPrincipal = useMemo(() => {
    const totalShares = parseFloat(displaySharesStr || "0");
    const allocatedPrincipal = parseFloat(userTotalAllocated || "0");
    return Math.max(totalShares - allocatedPrincipal, 0);
  }, [displaySharesStr, userTotalAllocated]);

  const totalValue = useMemo(() => {
    return parseFloat(userTotalAllocatedValue || "0") + unallocatedPrincipal;
  }, [userTotalAllocatedValue, unallocatedPrincipal]);

  const effectivePps = useMemo(() => {
    const totalShares = parseFloat(displaySharesStr || "0");
    return totalShares > 0 ? totalValue / totalShares : 1;
  }, [displaySharesStr, totalValue]);

  const maxAlloc = useMemo(() => {
    // For allocate: min(unallocated principal, remaining cap)
    try {
      const unallocatedWei = ethers.utils.parseUnits(unallocatedPrincipal.toString(), 18);
      const remainingWei = ethers.utils.parseUnits(remainingForSelected || '0', 18);
      const minWei = unallocatedWei.lt(remainingWei) ? unallocatedWei : remainingWei;
      return ethers.utils.formatUnits(minWei, 18);
    } catch {
      return '0';
    }
  }, [unallocatedPrincipal, remainingForSelected]);

  const maxUnallocate = useMemo(() => {
    // Max un-allocate = current value allocated to selected strategy
    if (!selectedId) return '0';
    const idx = Number(selectedId) - 1;
    const allocStr = (userStrategyAllocationsValue[idx] ?? userStrategyAllocations[idx] ?? "0");
    return allocStr;
  }, [selectedId, userStrategyAllocations, userStrategyAllocationsValue]);

  // Formatted values with max 4 decimals for display
  const userSharesFormatted = useMemo(() => formatWithMaxDecimals(displaySharesStr, 4), [displaySharesStr]);
  const remainingForSelectedFormatted = useMemo(() => formatWithMaxDecimals(remainingForSelected, 4), [remainingForSelected]);
  const maxAllocFormatted = useMemo(() => formatWithMaxDecimals(maxAlloc, 4), [maxAlloc]);
  const maxUnallocateFormatted = useMemo(() => formatWithMaxDecimals(maxUnallocate, 4), [maxUnallocate]);

  useEffect(() => {
    let cancelled = false;

    const loadSharesAndAllocations = async () => {
      if (!dBank || !account) {
        if (!cancelled) {
          setUserSharesOnChain(null);
          setAllocationSharesByStrategy([]);
          setPricePerShare("0");
        }
        return;
      }

      try {
        const totalAssetsBN = await dBank.totalAssets();
        const totalSupplyBN = await dBank.totalSupply();
        const totalAssets = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 18));
        const totalSupply = parseFloat(ethers.utils.formatUnits(totalSupplyBN, 18));
        const pps = totalSupply > 0 ? totalAssets / totalSupply : 1;
        if (!cancelled) {
          setPricePerShare(pps.toString());
        }

        const currentSharesBN = await dBank.balanceOf(account);
        const currentShares = ethers.utils.formatUnits(currentSharesBN, 18);
        if (!cancelled) {
          setUserSharesOnChain(currentShares);
        }

        const allocationsSource = userStrategyAllocationsValue.length > 0
          ? userStrategyAllocationsValue
          : userStrategyAllocations;

        if (allocationsSource && allocationsSource.length > 0) {
          const allocationsInShares = [];
          for (let idx = 0; idx < allocationsSource.length; idx++) {
            const allocAssets = parseFloat(allocationsSource[idx] || "0");
            if (allocAssets > 0) {
              const allocShares = pps > 0 ? allocAssets / pps : 0;
              allocationsInShares[idx] = allocShares;
            } else {
              allocationsInShares[idx] = 0;
            }
          }
          if (!cancelled) {
            setAllocationSharesByStrategy(allocationsInShares);
          }
        } else if (!cancelled) {
          setAllocationSharesByStrategy([]);
        }
      } catch (error) {
        if (!cancelled) {
          setUserSharesOnChain(null);
          setAllocationSharesByStrategy([]);
        }
      }
    };

    loadSharesAndAllocations();
    return () => { cancelled = true; };
  }, [dBank, account, userStrategyAllocations, userStrategyAllocationsValue, userTotalAllocated, userTotalAllocatedValue]);

  const handleMax = () => {
    if (!selectedId) return;
    if (mode === 'allocate') {
      setAmount(maxAlloc);
    } else {
      setAmount(maxUnallocate);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!provider || !strategyRouter || !tokens || tokens.length === 0 || !selectedId) return;
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    // Validation for un-allocate: check against max unallocate
    if (mode === 'unallocate') {
      const maxUnallocFloat = parseFloat(maxUnallocate || '0');
      if (parseFloat(amount) > maxUnallocFloat) {
        alert(`Cannot un-allocate more than ${maxUnallocateFormatted} shares. You have ${maxUnallocateFormatted} allocated in this strategy.`);
        return;
      }
    }

    // Pre-checks against max allowed
    const maxAllowedFloat = parseFloat(maxAlloc || '0');
    if (mode === 'allocate' && parseFloat(amount) > maxAllowedFloat) {
      const allocationsForCalc = allocationSharesByStrategy.length > 0
        ? allocationSharesByStrategy
        : (userStrategyAllocationsValue.length > 0 ? userStrategyAllocationsValue : userStrategyAllocations);
      const totalAllocated = allocationsForCalc.reduce((sum, v) => sum + parseFloat(v || '0'), 0);
      const unallocated = parseFloat(displaySharesStr || '0') - totalAllocated;
      alert(`Cannot allocate more than ${maxAllowedFloat} shares. You have ${userSharesFormatted} total shares, with ${formatWithMaxDecimals(unallocated.toString(), 4)} unallocated.`);
      return;
    }

    // Additional validation: Check that user has enough unallocated shares before allocating
    if (mode === 'allocate') {
      try {
        const amountInWei = ethers.utils.parseUnits(amount, 18);
        const userSharesBN = ethers.utils.parseUnits(displaySharesStr || '0', 18);
        const allocationsForCalc = allocationSharesByStrategy.length > 0
          ? allocationSharesByStrategy
          : (userStrategyAllocationsValue.length > 0 ? userStrategyAllocationsValue : userStrategyAllocations);
        const userAllocatedSumBN = allocationsForCalc.reduce((acc, v) => {
          return acc.add(toWei(v));
        }, ethers.BigNumber.from(0));
        const unallocatedSharesBN = userSharesBN.gt(userAllocatedSumBN) ? userSharesBN.sub(userAllocatedSumBN) : ethers.BigNumber.from(0);
        
        if (amountInWei.gt(unallocatedSharesBN)) {
          alert(`Cannot allocate ${amount} shares. You only have ${ethers.utils.formatUnits(unallocatedSharesBN, 18)} unallocated shares available.`);
          return;
        }
      } catch (error) {
        console.error("Error validating allocation:", error);
        alert("Error validating allocation. Please try again.");
        return;
      }
    }

    setShowAlert(false);
    setIsAllocating(true);
    setIsSuccess(false);
    setTxHash(null);

    let ok = false;
    let hash = null;
    try {
      if (mode === 'allocate') {
        const res = await allocateToStrategy(provider, strategyRouter, tokens, account, amount, Number(selectedId), dispatch, dBank);
        ok = res.ok;
        hash = res.hash || null;
        
        // Show detailed error message if allocation failed
        if (!ok && res.error) {
          alert(`Allocation failed: ${res.error}`);
          setIsAllocating(false);
          return;
        }
        if (ok && account && res.hash) {
          const existing = localStorage.getItem(`dBank_firstAllocation_${account}`);
          if (!existing) {
            try {
              const receipt = await provider.waitForTransaction(res.hash);
              if (receipt && receipt.blockNumber) {
                const block = await provider.getBlock(receipt.blockNumber);
                if (block && block.timestamp) {
                  localStorage.setItem(`dBank_firstAllocation_${account}`, (block.timestamp * 1000).toString());
                }
              }
            } catch (error) {
              console.warn("Failed to store first allocation timestamp:", error.message);
            }
          }
        }
      } else {
        const res = await unallocateFromStrategy(provider, strategyRouter, tokens, account, amount, Number(selectedId), dispatch, 50);
        ok = res.ok;
        hash = res.hash || null;
      }
      if (ok) {
        // Wait a bit for transaction confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload all relevant data after successful allocation/unallocation
        if (dBank && tokens && account) {
          await loadBalances(dBank, tokens, account, dispatch);
        }
        
        if (strategyRouter && account) {
          await loadUserStrategyAllocations(strategyRouter, account, dispatch);
        }
        
        if (provider && chainId) {
          await loadStrategyRouter(provider, chainId, dispatch);
        }
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      ok = false;
      hash = null;
    }

    setIsAllocating(false);
    setIsSuccess(ok);
    setTxHash(hash);
    setShowAlert(true);
    if (ok) {
      setAmount('');
    }
  };

  const filteredStrategies = strategies.filter((s, idx) => {
    const active = strategyActive[idx] ?? true;
    const paused = strategyPaused[idx] ?? false;
    return active && !paused;
  });

  // Auto-select first available strategy if none selected
  useEffect(() => {
    if (!selectedId && filteredStrategies.length === 1) {
      setSelectedId(String(filteredStrategies[0].id));
    }
  }, [filteredStrategies, selectedId]);

  // Load user allocations when component mounts or when account/strategyRouter changes
  useEffect(() => {
    const loadAllocations = async () => {
      if (strategyRouter && account) {
        try {
          await loadUserStrategyAllocations(strategyRouter, account, dispatch);
        } catch (error) {
          console.error("Error loading user allocations in Strategies component:", error);
        }
      }
    };
    loadAllocations();
    
    // Also reload allocations periodically to catch blockchain time advances
    // This ensures yield is reflected when time advances
    const interval = setInterval(() => {
      if (strategyRouter && account) {
        loadAllocations();
      }
    }, 5000); // Reload every 5 seconds
    
    return () => clearInterval(interval);
  }, [strategyRouter, account, dispatch]);

  return (
       <div>
        <Card style={{ maxWidth: '650px', width: '100%'}} className='mx-auto px-4 my-4'>
        <Form onSubmit={handleSubmit} style={{ maxWidth: '650px', margin: '20px auto'}}>

          <Row className='my-2 text-end'>
            <Form.Text style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
              Total shares: {userSharesFormatted} | PPS (effective): {formatWithMaxDecimals(effectivePps, 2)} | Total value: {formatWithMaxDecimals(totalValue.toString(), 2)} {symbols && symbols[0] ? symbols[0] : 'USDC'} | Allocated value: {formatWithMaxDecimals(userTotalAllocatedValue, 2)} {symbols && symbols[0] ? symbols[0] : 'USDC'} | Unallocated value: {formatWithMaxDecimals(unallocatedPrincipal.toString(), 2)} {symbols && symbols[0] ? symbols[0] : 'USDC'} | Remaining cap (selected): {selectedId ? remainingForSelectedFormatted : '—'} | Max alloc: {selectedId ? maxAllocFormatted : '—'} | Max unalloc: {selectedId ? maxUnallocateFormatted : '—'}
            </Form.Text>
          </Row>

          <Row className='my-3'>
            <Form.Label style={{ color: '#f8f9fa' }}>Strategy</Form.Label>
            <Form.Select
              aria-label="Strategy Selector"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setAmount(''); }}
            >
              <option value="">Select strategy</option>
              {filteredStrategies.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  {`Strategy ${s.id} (${s.address.slice(0,6)}...${s.address.slice(-4)})`}
                </option>
              ))}
            </Form.Select>
            {selectedId && (
              <Form.Text style={{ color: '#adb5bd', fontSize: '0.9rem' }} className="mt-1">
                Cap: {formatWithMaxDecimals(formatBn(capsMemo[Number(selectedId)-1] || 0), 4)} | Allocated: {formatWithMaxDecimals(formatBn(allocatedMemo[Number(selectedId)-1] || 0), 4)} | Remaining: {remainingForSelectedFormatted}
              </Form.Text>
            )}
          </Row>

          <Row className='my-3'>
            <Form.Label style={{ color: '#f8f9fa' }}>Action</Form.Label>
            <Form.Select
              aria-label="Mode selector"
              value={mode}
              onChange={(e) => { setMode(e.target.value); setAmount(''); }}
            >
              <option value="allocate">Allocate</option>
              <option value="unallocate">Un-allocate</option>
            </Form.Select>
          </Row>

          <Row className='my-3'>
            <Form.Label style={{ color: '#f8f9fa' }}>Shares to {mode === 'allocate' ? 'allocate' : 'un-allocate'}</Form.Label>
            <InputGroup>
              <Form.Control
                type='number'
                placeholder='0.0'
                min='0.0'
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!selectedId}
              />
              <Button
                variant='outline-primary'
                onClick={handleMax}
                disabled={
                  !selectedId ||
                  (mode === 'allocate'
                    ? parseFloat(maxAlloc || '0') === 0
                    : parseFloat(maxUnallocate || '0') === 0)
                }
              >
                Max
              </Button>
            </InputGroup>
            <Form.Text style={{ color: '#adb5bd', fontSize: '0.9rem' }} className='mt-1'>
              {mode === 'allocate'
                ? 'Will allocate up to the lesser of your shares and the strategy remaining cap.'
                : 'Will un-allocate up to the allocated amount in the selected strategy.'}
            </Form.Text>
          </Row>

          <Row className='my-4'>
            <Button
              variant='primary'
              type='submit'
              disabled={!selectedId || !amount || parseFloat(amount) <= 0 || isAllocating}
            >
              {isAllocating ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  {mode === 'allocate' ? 'Allocating ...' : 'Un-allocating ...'}
                </>
              ) : (
                mode === 'allocate' ? "Allocate" : "Un-allocate"
              )}
            </Button>
          </Row>
        </Form>

        {/* Summary Table */}
        <div className="mt-4">
          <h6 style={{ color: '#f8f9fa' }}>Allocations</h6>
          <Table bordered size="sm" responsive style={{ backgroundColor: 'transparent', color: '#f8f9fa' }}>
            <thead style={{ backgroundColor: 'transparent' }}>
              <tr style={{ backgroundColor: 'transparent' }}>
                <th style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent' }}>Strategy</th>
                <th className="d-none d-md-table-cell" style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'center' }}>Principal</th>
                <th style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'center' }}>
                  <span className="d-none d-md-inline">{symbols && symbols[0] ? symbols[0] : 'USDC'} (value)</span>
                  <span className="d-md-none">Value</span>
                </th>
                <th style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'center' }}>
                  <span className="d-none d-md-inline">% of total</span>
                  <span className="d-md-none">%</span>
                </th>
              </tr>
            </thead>
            <tbody style={{ backgroundColor: 'transparent' }}>
              {strategies.length === 0 && (
                <tr style={{ backgroundColor: 'transparent' }}>
                  <td colSpan={4} className="text-center" style={{ color: '#adb5bd', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent' }}>No strategies loaded</td>
                </tr>
              )}
              {strategies.map((s, idx) => {
                // userStrategyAllocations[idx] is already a formatted string from loadUserStrategyAllocations
                const allocRaw = (userStrategyAllocationsValue[idx] ?? userStrategyAllocations[idx] ?? "0");
                const allocUsd = formatWithMaxDecimals(allocRaw, 4);
                const allocPrincipal = userStrategyAllocations[idx] || "0";
                const allocPrincipalFormatted = formatWithMaxDecimals(allocPrincipal, 4);
                const rawPct = totalValue > 0 ? (parseFloat(allocRaw || "0") / totalValue) * 100 : 0;
                const pctClamped = Math.min(rawPct, 100);
                const pctStr = formatWithMaxDecimals(pctClamped.toString(), 2);
                return (
                  <tr key={s.id || idx} style={{ backgroundColor: 'transparent' }}>
                    <td style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent' }}>
                      <span className="d-none d-md-inline">{`Strategy ${s.id}`}</span>
                      <span className="d-md-none">{`S${s.id}`}</span>
                    </td>
                    <td className="d-none d-md-table-cell" style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'center' }}>{allocPrincipalFormatted}</td>
                    <td style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'center' }}>{allocUsd}</td>
                    <td style={{ color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: '3px', backgroundColor: 'transparent', textAlign: 'right' }}>{pctStr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>

      
      {isAllocating ? (
        <Alert
          message={mode === 'allocate' ? 'Allocation Pending...' : 'Unallocation Pending...'}
          transactionHash={txHash}
          variant={'info'}
          setShowAlert={setShowAlert}
          explorerBaseUrl={explorerBaseUrl}
        />
      ) : isSuccess && showAlert ? (
        <Alert
          message={mode === 'allocate' ? 'Allocation Successful' : 'Unallocation Successful'}
          transactionHash={txHash}
          variant={'success'}
          setShowAlert={setShowAlert}
          explorerBaseUrl={explorerBaseUrl}
        />
      ) : !isSuccess && showAlert ? (
        <Alert
          message={'Allocation Failed'}
          transactionHash={txHash}
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

export default Strategies;
