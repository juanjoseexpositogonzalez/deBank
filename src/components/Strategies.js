import { useState, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Form, Button, InputGroup, Row, Spinner, Table } from 'react-bootstrap';
import { ethers } from 'ethers';

import Alert from './Alert';
import { allocateToStrategy, unallocateFromStrategy } from '../store/interactions';

const formatBn = (bn) => {
  try {
    return ethers.utils.formatUnits(bn, 18);
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

  const userShares = useSelector(state => state.dBank.shares) || "0";
  const userSharesStr = useMemo(() => {
    if (!userShares) return '0';
    if (Array.isArray(userShares)) return '0';
    if (ethers.BigNumber.isBigNumber(userShares)) return ethers.utils.formatUnits(userShares, 18);
    const s = String(userShares);
    return s && s !== 'undefined' ? s : '0';
  }, [userShares]);

  const strategyRouter = useSelector(state => state.strategyRouter.contract);
  const strategies = useSelector(state => state.strategyRouter.strategies) || [];
  const strategyCap = useSelector(state => state.strategyRouter.strategyCap) || [];
  const strategyAllocated = useSelector(state => state.strategyRouter.strategyAllocated) || [];
  const strategyPaused = useSelector(state => state.strategyRouter.strategyPaused) || [];
  const strategyActive = useSelector(state => state.strategyRouter.strategyActive) || [];
  const symbols = useSelector(state => state.tokens.symbols) || [];
  const totalAllocated = useSelector(state => state.strategyRouter.totalAllocated);

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
    31337: ''
  };
  const explorerBaseUrl = explorerMap[chainId] || '';

  // Stable refs for useMemo deps
  const capsMemo = useMemo(() => strategyCap || [], [strategyCap]);
  const allocatedMemo = useMemo(() => strategyAllocated || [], [strategyAllocated]);
  const totalAllocatedWei = useMemo(() => {
    try {
      return ethers.BigNumber.from(totalAllocated || 0);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [totalAllocated]);

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

  const maxAlloc = useMemo(() => {
    // For allocate: min(unallocated user shares, remaining cap)
    try {
      const userWei = ethers.utils.parseUnits(userSharesStr || '0', 18);
      const allocatedSumWei = allocatedMemo.reduce((acc, v) => acc.add(toWei(v)), ethers.BigNumber.from(0));
      const unallocatedWei = userWei.gt(allocatedSumWei) ? userWei.sub(allocatedSumWei) : ethers.BigNumber.from(0);
      const remainingWei = ethers.utils.parseUnits(remainingForSelected || '0', 18);
      const minWei = unallocatedWei.lt(remainingWei) ? unallocatedWei : remainingWei;
      return ethers.utils.formatUnits(minWei, 18);
    } catch {
      return '0';
    }
  }, [userSharesStr, remainingForSelected, allocatedMemo]);

  const maxUnallocate = useMemo(() => {
    // Max withdraw = allocated for that strategy
    if (!selectedId) return '0';
    const idx = Number(selectedId) - 1;
    return formatBn(allocatedMemo[idx] || 0);
  }, [selectedId, allocatedMemo]);

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
    if (!amount || parseFloat(amount) <= 0) return;

    // Pre-checks against max allowed
    const maxAllowedFloat = parseFloat(maxAlloc || '0');
    if (mode === 'allocate' && parseFloat(amount) > maxAllowedFloat) {
      setShowAlert(true);
      setIsAllocating(false);
      setIsSuccess(false);
      setTxHash(null);
      return;
    }

    setShowAlert(false);
    setIsAllocating(true);
    setIsSuccess(false);
    setTxHash(null);

    let ok = false;
    let hash = null;
    if (mode === 'allocate') {
      const res = await allocateToStrategy(provider, strategyRouter, tokens, account, amount, Number(selectedId), dispatch);
      ok = res.ok;
      hash = res.hash || null;
    } else {
      const res = await unallocateFromStrategy(provider, strategyRouter, tokens, account, amount, Number(selectedId), dispatch, 50);
      ok = res.ok;
      hash = res.hash || null;
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

  return (
    <Card style={{ maxWidth: '550px'}} className='mx-auto px-4 my-4'>
      <Form onSubmit={handleSubmit} style={{ maxWidht: '550px', margin: '20px auto'}}>

        <Row className='my-2 text-end'>
          <Form.Text muted>
            Total shares: {userShares || '0'} | Remaining cap (selected): {selectedId ? (remainingForSelected || '0') : '—'} | Max alloc: {selectedId ? (maxAlloc || '0') : '—'} | Max unalloc: {selectedId ? (maxUnallocate || '0') : '—'}
          </Form.Text>
        </Row>

        <Row className='my-3'>
          <Form.Label>Strategy</Form.Label>
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
            <Form.Text muted className="mt-1">
              Cap: {formatBn(capsMemo[Number(selectedId)-1] || 0)} | Allocated: {formatBn(allocatedMemo[Number(selectedId)-1] || 0)} | Remaining: {remainingForSelected}
            </Form.Text>
          )}
        </Row>

        <Row className='my-3'>
          <Form.Label>Action</Form.Label>
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
          <Form.Label>Shares to {mode === 'allocate' ? 'allocate' : 'un-allocate'}</Form.Label>
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
          <Form.Text muted className='mt-1'>
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

      <div className="mt-3 w-100" style={{ maxWidth: '520px' }}>
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

      {/* Summary Table */}
      <div className="mt-4">
        <h6>Allocations</h6>
        <Table striped bordered hover size="sm" responsive>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Shares</th>
              <th>{symbols && symbols[0] ? symbols[0] : 'USDC'}</th>
              <th>% of your shares</th>
            </tr>
          </thead>
          <tbody>
            {strategies.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center">No strategies loaded</td>
              </tr>
            )}
            {strategies.map((s, idx) => {
              const alloc = formatBn(allocatedMemo[idx] || 0);
              const allocUsd = alloc; // Assuming allocated is in asset units
              const allocWei = toWei(allocatedMemo[idx]);
              const userSharesWei = toWei(ethers.utils.parseUnits(userShares || '0', 18));
              const pctBps = userSharesWei.gt(0)
                ? allocWei.mul(ethers.BigNumber.from(10000)).div(userSharesWei) // basis points vs user total shares
                : ethers.BigNumber.from(0);
              const pctStr = ethers.utils.formatUnits(pctBps, 2); // two decimals, already %
              return (
                <tr key={s.id || idx}>
                  <td>{`Strategy ${s.id}`}</td>
                  <td>{alloc}</td>
                  <td>{allocUsd}</td>
                  <td>{pctStr}%</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Card>
  );
};

export default Strategies;