import { useSelector, useDispatch } from 'react-redux';
import { ethers } from 'ethers';
import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import Loading from './Loading';
import { loadUserStrategyAllocations } from '../store/interactions';

const Charts = () => {
    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    const dispatch = useDispatch();
    
    const strategiesRaw = useSelector(state => state.strategyRouter.strategies);
    const strategyActiveRaw = useSelector(state => state.strategyRouter.strategyActive);
    const strategyRouter = useSelector(state => state.strategyRouter.contract);
    const symbols = useSelector(state => state.tokens.symbols) || [];
    
    const dBank = useSelector(state => state.dBank.contract);
    const userSharesRaw = useSelector(state => state.dBank.shares);
    const userStrategyAllocationsRaw = useSelector(state => state.strategyRouter.userStrategyAllocations);
    const userStrategyAllocationsValueRaw = useSelector(state => state.strategyRouter.userStrategyAllocationsValue);
    const userTotalAllocated = useSelector(state => state.strategyRouter.userTotalAllocated || "0");
    const userTotalAllocatedValue = useSelector(state => state.strategyRouter.userTotalAllocatedValue || "0");

    // Wrap in useMemo to prevent unnecessary re-renders
    const strategies = useMemo(() => strategiesRaw || [], [strategiesRaw]);
    const strategyActive = useMemo(() => strategyActiveRaw || [], [strategyActiveRaw]);
    const userStrategyAllocations = useMemo(() => userStrategyAllocationsRaw || [], [userStrategyAllocationsRaw]);
    const userStrategyAllocationsValue = useMemo(() => userStrategyAllocationsValueRaw || [], [userStrategyAllocationsValueRaw]);

    const [loading, setLoading] = useState(true);
    const [pricePerShare, setPricePerShare] = useState("0");
    const [historicalData, setHistoricalData] = useState({
        pricePerShare: [],
        userSharesValue: []
    });
    const [userFirstDepositTimestamp, setUserFirstDepositTimestamp] = useState(null);
    const [userFirstAllocationTimestamp, setUserFirstAllocationTimestamp] = useState(null);
    const [lastBlockTimestamp, setLastBlockTimestamp] = useState(null);
    const [userSharesOnChain, setUserSharesOnChain] = useState(null);

    // Load user's first deposit timestamp
    useEffect(() => {
        const loadFirstDepositTimestamp = async () => {
            if (!dBank || !account || !provider) {
                setUserFirstDepositTimestamp(null);
                return;
            }

            try {
                // Check if we have it stored in localStorage
                const storedTimestamp = localStorage.getItem(`dBank_firstDeposit_${account}`);
                if (storedTimestamp) {
                    setUserFirstDepositTimestamp(parseInt(storedTimestamp));
                    return;
                }

                // Query Deposit events for this user with error handling
                try {
                    const depositFilter = dBank.filters.Deposit(null, account);
                    // Limit search to recent blocks to avoid RPC issues
                    let currentBlock = null;
                    try {
                        currentBlock = await provider.getBlockNumber();
                    } catch (blockNumError) {
                        console.warn('Could not get current block number:', blockNumError.message);
                    }
                    
                    const fromBlock = currentBlock ? Math.max(0, currentBlock - 10000) : 0;
                    const toBlock = currentBlock || 'latest';
                    
                    const events = await dBank.queryFilter(
                        depositFilter, 
                        fromBlock, 
                        toBlock
                    ).catch(err => {
                        console.warn('Error querying deposit events for first timestamp:', err.message);
                        return [];
                    });
                    
                    if (events.length > 0) {
                        // Get the first deposit event (oldest)
                        const firstEvent = events[0];
                        try {
                            const block = await provider.getBlock(firstEvent.blockNumber);
                            const timestamp = block.timestamp * 1000; // Convert to milliseconds
                            
                            // Store in localStorage for future use
                            localStorage.setItem(`dBank_firstDeposit_${account}`, timestamp.toString());
                            setUserFirstDepositTimestamp(timestamp);
                        } catch (blockError) {
                            console.warn('Error fetching block for first deposit:', blockError.message);
                            // Use current timestamp as fallback
                            try {
                                const currentBlockData = await provider.getBlock('latest');
                                const timestamp = currentBlockData.timestamp * 1000;
                                setUserFirstDepositTimestamp(timestamp);
                            } catch {
                                setUserFirstDepositTimestamp(null);
                            }
                        }
                    } else {
                        // No deposits found, use null (will use first data point)
                        setUserFirstDepositTimestamp(null);
                    }
                } catch (queryError) {
                    console.warn('Error querying deposit events:', queryError.message);
                    setUserFirstDepositTimestamp(null);
                }
            } catch (error) {
                // Don't log RPC errors as critical - they're often temporary
                if (error.code !== -32002 && error.code !== -32603 && error.code !== -32005) {
                    console.error('Error loading first deposit timestamp:', error);
                } else {
                    console.warn('RPC error loading first deposit timestamp (non-critical):', error.message);
                }
                setUserFirstDepositTimestamp(null);
            }
        };

        loadFirstDepositTimestamp();
    }, [dBank, account, provider]);

    // Load user's first allocation timestamp from localStorage
    useEffect(() => {
        if (!account) {
            setUserFirstAllocationTimestamp(null);
            return;
        }
        const storedTimestamp = localStorage.getItem(`dBank_firstAllocation_${account}`);
        if (storedTimestamp) {
            setUserFirstAllocationTimestamp(parseInt(storedTimestamp));
        } else {
            setUserFirstAllocationTimestamp(null);
        }
    }, [account]);

    // Last block timestamp is refreshed in loadChartData()

    // Load historical data from blockchain events
    useEffect(() => {
        const loadHistoricalDataFromEvents = async () => {
            if (!dBank || !provider) return;

            try {
                // Limit the range of events to query (last 10000 blocks to avoid RPC limits)
                const currentBlock = await provider.getBlockNumber();
                const fromBlock = Math.max(0, currentBlock - 10000);
                
                console.log('Loading historical data from block', fromBlock, 'to', currentBlock);
                
                // Query all relevant events from dBank with block range limit
                const depositEvents = await dBank.queryFilter(dBank.filters.Deposit(), fromBlock, currentBlock).catch(err => {
                    console.warn('Error querying Deposit events:', err.message);
                    return [];
                });
                const allocateEvents = await dBank.queryFilter(dBank.filters.Allocated(), fromBlock, currentBlock).catch(err => {
                    console.warn('Error querying Allocated events:', err.message);
                    return [];
                });
                const feesEvents = await dBank.queryFilter(dBank.filters.FeesCrystallized(), fromBlock, currentBlock).catch(err => {
                    console.warn('Error querying FeesCrystallized events:', err.message);
                    return [];
                });
                
                // Get all unique block numbers from all events
                const blockNumbers = new Set();
                depositEvents.forEach(e => blockNumbers.add(e.blockNumber));
                allocateEvents.forEach(e => blockNumbers.add(e.blockNumber));
                feesEvents.forEach(e => blockNumbers.add(e.blockNumber));
                
                // Get timestamps for all blocks (with error handling)
                const blockTimestamps = {};
                const blockNumbersArray = Array.from(blockNumbers).sort((a, b) => a - b);
                
                // Process blocks in batches to avoid overwhelming the RPC
                const batchSize = 10;
                for (let i = 0; i < blockNumbersArray.length; i += batchSize) {
                    const batch = blockNumbersArray.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (blockNum) => {
                        try {
                            const block = await provider.getBlock(blockNum);
                            blockTimestamps[blockNum] = block.timestamp * 1000; // Convert to milliseconds
                        } catch (err) {
                            console.warn(`Error fetching block ${blockNum}:`, err.message);
                            // Use approximate timestamp if block fetch fails
                            const currentBlock = await provider.getBlock('latest');
                            blockTimestamps[blockNum] = currentBlock.timestamp * 1000;
                        }
                    }));
                    
                    // Small delay between batches to avoid rate limiting
                    if (i + batchSize < blockNumbersArray.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                
                // Build historical data points from events
                const priceHistory = [];
                const userSharesValueHistory = [];
                
                // Sort all events by block number
                const allEvents = [
                    ...depositEvents.map(e => ({ type: 'deposit', event: e, blockNumber: e.blockNumber })),
                    ...allocateEvents.map(e => ({ type: 'allocate', event: e, blockNumber: e.blockNumber })),
                    ...feesEvents.map(e => ({ type: 'fees', event: e, blockNumber: e.blockNumber }))
                ].sort((a, b) => a.blockNumber - b.blockNumber);
                
                // For each event, get the state at that block
                for (const eventData of allEvents) {
                    const timestamp = blockTimestamps[eventData.blockNumber];
                    try {
                        // Get state at that block using blockTag
                        const blockTag = eventData.blockNumber;
                        // Get user shares at this block (if account is connected)
                        let userSharesValue = 0;
                        let effectivePps = 1;
                        if (account) {
                            try {
                                const userSharesBN = await dBank.balanceOf(account, { blockTag });
                                const userShares = parseFloat(ethers.utils.formatUnits(userSharesBN, 18));
                                let allocatedPrincipalBN = ethers.BigNumber.from(0);
                                let allocatedValueBN = ethers.BigNumber.from(0);

                                if (strategyRouter && strategies.length > 0) {
                                    for (const s of strategies) {
                                        if (!s || !s.id) continue;
                                        const allocBN = await strategyRouter.getUserStrategyAllocation(account, s.id, { blockTag });
                                        if (allocBN.gt(0)) {
                                            const [strategyAddr, , , strategyAllocatedBN] = await strategyRouter.getStrategy(s.id, { blockTag });
                                            let allocationValueBN = allocBN;
                                            if (strategyAddr && strategyAddr !== ethers.constants.AddressZero && strategyAllocatedBN.gt(0)) {
                                                try {
                                                    const strategy = new ethers.Contract(
                                                        strategyAddr,
                                                        ["function totalAssets() view returns (uint256)"],
                                                        provider
                                                    );
                                                    const strategyTotalAssetsBN = await strategy.totalAssets({ blockTag });
                                                    allocationValueBN = allocBN.mul(strategyTotalAssetsBN).div(strategyAllocatedBN);
                                                } catch {
                                                    allocationValueBN = allocBN;
                                                }
                                            }
                                            allocatedPrincipalBN = allocatedPrincipalBN.add(allocBN);
                                            allocatedValueBN = allocatedValueBN.add(allocationValueBN);
                                        }
                                    }
                                }

                                const unallocatedPrincipalBN = userSharesBN.gt(allocatedPrincipalBN)
                                    ? userSharesBN.sub(allocatedPrincipalBN)
                                    : ethers.BigNumber.from(0);
                                const totalValueBN = allocatedValueBN.add(unallocatedPrincipalBN);
                                userSharesValue = parseFloat(ethers.utils.formatUnits(totalValueBN, 18));
                                effectivePps = userShares > 0 ? userSharesValue / userShares : 1;
                                
                                // Debug log for first few events to verify calculations
                                if (eventData.blockNumber <= 10) {
                                    console.log(`[Charts] Block ${eventData.blockNumber}:`, {
                                        userShares: userShares.toFixed(4),
                                        pricePerShare: effectivePps.toFixed(6),
                                        userSharesValue: userSharesValue.toFixed(2),
                                        eventType: eventData.type
                                    });
                                }
                            } catch (error) {
                                // User might not have shares at this block
                                userSharesValue = 0;
                            }
                        }
                        
                        // Avoid duplicates - check if we already have a point for this timestamp
                        const existingPricePoint = priceHistory.find(p => p.x === timestamp);
                        if (!existingPricePoint) {
                            priceHistory.push({ x: timestamp, y: effectivePps });
                        }
                        
                        // Add user shares value point
                        if (account) {
                            const existingUserValuePoint = userSharesValueHistory.find(p => p.x === timestamp);
                            if (!existingUserValuePoint) {
                                userSharesValueHistory.push({ x: timestamp, y: userSharesValue });
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing event at block ${eventData.blockNumber}:`, error);
                    }
                }
                
                // Remove duplicates and sort by timestamp, then keep last 30 points
                const priceMap = new Map();
                const userValueMap = new Map();
                
                // Sort by timestamp first
                const sortedPriceHistory = priceHistory.sort((a, b) => a.x - b.x);
                const sortedUserValueHistory = userSharesValueHistory.sort((a, b) => a.x - b.x);
                
                // Remove duplicates (keep last value for each timestamp)
                sortedPriceHistory.forEach(point => {
                    priceMap.set(point.x, point.y);
                });
                sortedUserValueHistory.forEach(point => {
                    userValueMap.set(point.x, point.y);
                });
                
                // Convert back to arrays and keep last 30
                const newPriceHistory = Array.from(priceMap.entries())
                    .map(([x, y]) => ({ x, y }))
                    .sort((a, b) => a.x - b.x)
                    .slice(-30);
                const newUserValueHistory = Array.from(userValueMap.entries())
                    .map(([x, y]) => ({ x, y }))
                    .sort((a, b) => a.x - b.x)
                    .slice(-30);
                
                // Save to localStorage
                saveHistoricalData('pricePerShare', newPriceHistory);
                if (account) {
                    saveHistoricalData(`userSharesValue_${account}`, newUserValueHistory);
                }
                
                // Update state
                setHistoricalData({
                    pricePerShare: newPriceHistory,
                    userSharesValue: account ? newUserValueHistory : []
                });
                
            } catch (error) {
                console.error('Error loading historical data:', error);
                // Don't show error to user if it's just a data loading issue
                // The charts will still work with current data
                if (error.code !== -32603 && !error.message.includes('Failed to fetch')) {
                    console.warn('Historical data loading failed, but charts will continue with current data');
                }
            }
        };

        loadHistoricalDataFromEvents();
    }, [dBank, provider, account, strategyRouter, strategies]);

    // Load current data periodically
    useEffect(() => {
        const loadChartData = async () => {
            if (!dBank || !provider) return;

            try {
                // Get current block timestamp
                const currentBlock = await provider.getBlock('latest');
                setLastBlockTimestamp(currentBlock.timestamp * 1000);
                
                if (strategyRouter && account) {
                    await loadUserStrategyAllocations(strategyRouter, account, dispatch);
                }
                
                // Fetch current user shares for value series
                let currentUserShares = 0;
                if (account) {
                    try {
                        const currentSharesBN = await dBank.balanceOf(account);
                        currentUserShares = parseFloat(ethers.utils.formatUnits(currentSharesBN, 18));
                        setUserSharesOnChain(currentUserShares.toString());
                    } catch (error) {
                        console.error("Error parsing user shares:", error);
                    }
                }

                const allocatedValue = parseFloat(userTotalAllocatedValue || "0");
                const unallocatedValue = Math.max(
                    currentUserShares - parseFloat(userTotalAllocated || "0"),
                    0
                );
                const currentUserValue = allocatedValue + unallocatedValue;
                const currentPricePerShare = currentUserShares > 0
                    ? currentUserValue / currentUserShares
                    : 1;

                setPricePerShare(currentPricePerShare.toString());

                // Add current point to history
                const currentTimestamp = currentBlock.timestamp * 1000;
                setHistoricalData(prev => {
                    const lastPricePoint = prev.pricePerShare[prev.pricePerShare.length - 1];
                    let priceHistory = [...prev.pricePerShare];
                    
                    // Always add current point if timestamp changed significantly (more than 1 minute)
                    // or if price changed, or if this is the first point
                    const shouldAddPricePoint = !lastPricePoint || 
                        (currentTimestamp - lastPricePoint.x > 60000) || 
                        Math.abs(lastPricePoint.y - currentPricePerShare) > 0.0001;
                    
                    if (shouldAddPricePoint) {
                        // Remove any existing point at this timestamp to avoid duplicates
                        priceHistory = priceHistory.filter(p => Math.abs(p.x - currentTimestamp) > 1000);
                        priceHistory.push({ x: currentTimestamp, y: currentPricePerShare });
                        // Sort and keep last 30 points
                        priceHistory = priceHistory.sort((a, b) => a.x - b.x).slice(-30);
                    }
                    
                    // Update user shares value if account is connected
                    let userSharesValueHistory = [...prev.userSharesValue];
                    if (account) {
                        const lastUserValuePoint = userSharesValueHistory[userSharesValueHistory.length - 1];
                        
                        // Always add current point if timestamp changed significantly or value changed
                        const shouldAddUserValuePoint = !lastUserValuePoint || 
                            (currentTimestamp - lastUserValuePoint.x > 60000) || 
                            Math.abs(lastUserValuePoint.y - currentUserValue) > 0.01;
                        
                        if (shouldAddUserValuePoint) {
                            // Remove any existing point at this timestamp to avoid duplicates
                            userSharesValueHistory = userSharesValueHistory.filter(p => Math.abs(p.x - currentTimestamp) > 1000);
                            userSharesValueHistory.push({ x: currentTimestamp, y: currentUserValue });
                            // Sort and keep last 30 points
                            userSharesValueHistory = userSharesValueHistory.sort((a, b) => a.x - b.x).slice(-30);
                        }
                    }
                    
                    return {
                        pricePerShare: priceHistory,
                        userSharesValue: userSharesValueHistory
                    };
                });
                
            } catch (error) {
                console.error('Error loading chart data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadChartData();

        // Refresh data every 5 seconds for smoother UI updates (reduced from 10s)
        // This ensures charts update quickly when blockchain time advances
        const interval = setInterval(loadChartData, 5000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dBank, provider, account, userTotalAllocated, userTotalAllocatedValue]);

    // Helper functions for localStorage
    const getHistoricalData = (key) => {
        try {
            const data = localStorage.getItem(`dBank_${key}`);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    };

    const saveHistoricalData = (key, data) => {
        try {
            localStorage.setItem(`dBank_${key}`, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving historical data for ${key}:`, error);
        }
    };

    // Load historical data on mount
    useEffect(() => {
        const priceHistory = getHistoricalData('pricePerShare');
        const userValueHistory = account ? getHistoricalData(`userSharesValue_${account}`) : [];
        setHistoricalData({
            pricePerShare: priceHistory,
            userSharesValue: userValueHistory
        });
    }, [account]);

    // Helper function to determine datetime format based on data range
    const getDateTimeFormat = (data, startTime = null) => {
        if (!data || !Array.isArray(data) || data.length < 2) return 'HH:mm';
        const timestamps = data.map(d => d && d.x ? d.x : null).filter(x => x !== null && x !== undefined);
        if (timestamps.length < 2) return 'HH:mm';
        const minTime = startTime || Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const diffMs = maxTime - minTime;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        if (diffDays > 365) return 'MMM yyyy'; // More than a year: show month and year
        if (diffDays > 30) return 'MMM dd'; // More than a month: show month and day
        if (diffDays > 1) return 'MMM dd HH:mm'; // More than a day: show date and time
        return 'HH:mm'; // Less than a day: show time only
    };

    // Chart 1: User Allocation Distribution (Pie Chart) - only if user is connected
    const userAllocationData = useMemo(() => {
        if (!account) {
            return { labels: [], series: [] };
        }

        // Get user total shares
        let userTotalShares = 0;
        try {
            if (userSharesOnChain) {
                userTotalShares = parseFloat(userSharesOnChain || "0");
            } else if (userSharesRaw) {
                if (ethers.BigNumber.isBigNumber(userSharesRaw)) {
                    userTotalShares = parseFloat(ethers.utils.formatUnits(userSharesRaw, 18));
                } else {
                    userTotalShares = parseFloat(userSharesRaw || "0");
                }
            }
        } catch (error) {
            console.error("Error parsing user shares:", error);
        }

        const currentPps = parseFloat(pricePerShare || "0");
        const totalUserValue = userTotalShares * currentPps;

        if (totalUserValue === 0 && (!userStrategyAllocationsValue || userStrategyAllocationsValue.length === 0)) {
            return { labels: [], series: [] };
        }

        const labels = [];
        const series = [];
        let totalAllocatedShares = 0;

        const allocationsSource = userStrategyAllocationsValue && userStrategyAllocationsValue.length > 0
            ? userStrategyAllocationsValue
            : userStrategyAllocations;

        strategies.forEach((s, idx) => {
            if (strategyActive[idx] && allocationsSource[idx] !== undefined) {
                const allocValue = parseFloat(allocationsSource[idx] || "0");
                if (allocValue > 0.0001) {
                    labels.push(`Strategy ${s.id}`);
                    series.push(allocValue);
                    totalAllocatedShares += allocValue;
                }
            }
        });

        // Calculate unallocated portion (total value minus allocated)
        const unallocated = Math.max(totalUserValue - totalAllocatedShares, 0);
        
        // Only add unallocated if it's significant and there are other allocations
        if (unallocated > 0.0001 && totalAllocatedShares > 0.0001) {
            labels.push("Unallocated");
            series.push(unallocated);
        } else if (totalAllocatedShares === 0 && unallocated > 0.0001) {
            // Only show unallocated if there are no allocations at all
            labels.push("Unallocated");
            series.push(unallocated);
        }

        // If no shares at all, return empty
        if (series.length === 0) return { labels: [], series: [] };

        const totalValue = unallocated + totalAllocatedShares;
        return { labels, series, userTotalShares, totalUserValue, totalValue };
    }, [account, strategies, strategyActive, userSharesRaw, userSharesOnChain, userStrategyAllocationsValue, userStrategyAllocations, pricePerShare]);

    const chartStartTimestamp = userFirstAllocationTimestamp || userFirstDepositTimestamp || undefined;
    const filteredPriceHistory = useMemo(() => {
        if (!chartStartTimestamp) return historicalData.pricePerShare;
        return historicalData.pricePerShare.filter(point => point.x >= chartStartTimestamp);
    }, [historicalData.pricePerShare, chartStartTimestamp]);
    const filteredUserValueHistory = useMemo(() => {
        if (!chartStartTimestamp) return historicalData.userSharesValue;
        return historicalData.userSharesValue.filter(point => point.x >= chartStartTimestamp);
    }, [historicalData.userSharesValue, chartStartTimestamp]);

    // Chart 2: Price per Share Evolution (Line Chart)
    const pricePerShareOptions = useMemo(() => ({
        chart: {
            id: 'price-per-share',
            type: 'line',
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            type: 'datetime',
            min: chartStartTimestamp,
            max: lastBlockTimestamp || undefined,
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(filteredPriceHistory, chartStartTimestamp)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => val.toFixed(4)
            },
            title: { text: 'Price per Share' }
        },
        title: {
            text: 'Effective Price per Share Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#0dcaf0'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        },
        legend: {
            show: false
        }
    }), [filteredPriceHistory, chartStartTimestamp, lastBlockTimestamp]);

    // Chart 3: User Shares Value Evolution (Line Chart) - only if user is connected
    const userSharesValueOptions = useMemo(() => ({
        chart: {
            id: 'user-shares-value',
            type: 'line',
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            type: 'datetime',
            min: chartStartTimestamp,
            max: lastBlockTimestamp || undefined,
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(filteredUserValueHistory, chartStartTimestamp)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => {
                    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
                    if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
                    return val.toFixed(2);
                }
            },
            title: { text: 'Value' }
        },
        title: {
            text: 'Your Shares Value Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#ffc107'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        },
        legend: {
            show: false
        }
    }), [filteredUserValueHistory, chartStartTimestamp, lastBlockTimestamp]);

    // Memoize Popovers to prevent infinite re-renders
    const userAllocationDistributionPopover = useMemo(() => (
        <Popover id="user-allocation-distribution-info" style={{ backgroundColor: '#2d3142', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
            <Popover.Header as="h6" style={{ backgroundColor: '#1a1d29', color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                Your Allocation Distribution
            </Popover.Header>
            <Popover.Body style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                This chart shows the percentage distribution of <strong>your personal allocations</strong> across the different strategies.
                <br /><br />
                <strong>Important:</strong> You can only withdraw shares that are not allocated to strategies. If you have allocated shares, you must un-allocate them first before withdrawing.
            </Popover.Body>
        </Popover>
    ), []);

    if (loading) {
        return <Loading />;
    }

    // Calculate current user shares value
    let currentUserSharesValue = 0;
    if (account) {
        try {
            let userShares = 0;
            if (userSharesOnChain) {
                userShares = parseFloat(userSharesOnChain || "0");
            } else if (ethers.BigNumber.isBigNumber(userSharesRaw)) {
                userShares = parseFloat(ethers.utils.formatUnits(userSharesRaw, 18));
            } else {
                userShares = parseFloat(userSharesRaw || "0");
            }
            const allocatedValue = parseFloat(userTotalAllocatedValue || "0");
            const unallocatedValue = Math.max(userShares - parseFloat(userTotalAllocated || "0"), 0);
            currentUserSharesValue = allocatedValue + unallocatedValue;
        } catch (error) {
            console.error("Error calculating user shares value:", error);
        }
    }

    return (
        <div style={{ padding: '20px' }}>
            {/* Chart 1: Your Allocation Distribution */}
            {account && userAllocationData.series.length > 0 && (
                <Row className="mb-4">
                    <Col md={6} className="mb-4 mx-auto">
                        <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Card.Body>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h5 style={{ color: '#f8f9fa', margin: 0 }}>Your Allocation Distribution</h5>
                                    <OverlayTrigger
                                        trigger="click"
                                        placement="left"
                                        overlay={userAllocationDistributionPopover}
                                        rootClose
                                    >
                                        <Button
                                            variant="link"
                                            style={{
                                                color: '#0dcaf0',
                                                padding: '0',
                                                minWidth: '24px',
                                                height: '24px',
                                                fontSize: '16px',
                                                textDecoration: 'none',
                                                border: '1px solid #0dcaf0',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                lineHeight: '1'
                                            }}
                                        >
                                            ?
                                        </Button>
                                    </OverlayTrigger>
                                </div>
                                <Chart
                                    options={{
                                        chart: { type: 'pie' },
                                        labels: userAllocationData.labels,
                                        legend: {
                                            position: 'bottom',
                                            labels: { colors: '#f8f9fa' }
                                        },
                                        theme: { mode: 'dark' },
                                        dataLabels: {
                                            formatter: (val, opts) => {
                                                const totalValue = userAllocationData.totalValue || 1;
                                                let absoluteValue = 0;
                                                
                                                if (opts && opts.w && opts.w.config && opts.w.config.series && opts.seriesIndex !== undefined) {
                                                    absoluteValue = opts.w.config.series[opts.seriesIndex] || 0;
                                                } else if (opts && opts.seriesIndex !== undefined) {
                                                    absoluteValue = userAllocationData.series[opts.seriesIndex] || 0;
                                                } else if (opts && opts.dataPointIndex !== undefined) {
                                                    absoluteValue = userAllocationData.series[opts.dataPointIndex] || 0;
                                                }
                                                
                                                const percentage = (absoluteValue / totalValue) * 100;
                                                return percentage.toFixed(1) + '%';
                                            }
                                        },
                                        tooltip: {
                                            y: {
                                                formatter: (val, opts) => {
                                                    const symbol = symbols[0] || 'USDC';
                                                    const totalValue = userAllocationData.totalValue || 1;
                                                    let absoluteValue = 0;
                                                    
                                                    if (opts && opts.w && opts.w.config && opts.w.config.series && opts.seriesIndex !== undefined) {
                                                        absoluteValue = opts.w.config.series[opts.seriesIndex] || 0;
                                                    } else if (opts && opts.seriesIndex !== undefined) {
                                                        absoluteValue = userAllocationData.series[opts.seriesIndex] || 0;
                                                    } else if (opts && opts.dataPointIndex !== undefined) {
                                                        absoluteValue = userAllocationData.series[opts.dataPointIndex] || 0;
                                                    }
                                                    
                                                    const percentage = (absoluteValue / totalValue) * 100;
                                                    return `${parseFloat(absoluteValue).toFixed(2)} ${symbol} (${percentage.toFixed(1)}%)`;
                                                }
                                            }
                                        }
                                    }}
                                    series={userAllocationData.series}
                                    type="pie"
                                    height={300}
                                />
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Chart 2: Vault Price per Share Evolution */}
            <Row className="mb-4">
                <Col md={6} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            {filteredPriceHistory.length > 0 ? (
                                <Chart
                                    options={pricePerShareOptions}
                                    series={[{ name: 'Price per Share', data: filteredPriceHistory }]}
                                    type="line"
                                    height={300}
                                />
                            ) : (
                                <div>
                                    <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Effective Price per Share Evolution</h5>
                                    <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                        Current: {parseFloat(pricePerShare).toFixed(4)}
                                        <br />
                                        <small>Historical data will appear as time progresses</small>
                                    </p>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                {/* Chart 3: Your Shares Value Evolution */}
                {account && (
                    <Col md={6} className="mb-4">
                        <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Card.Body>
                                {filteredUserValueHistory.length > 0 ? (
                                    <Chart
                                        options={userSharesValueOptions}
                                        series={[{ name: 'Your Shares Value', data: filteredUserValueHistory }]}
                                        type="line"
                                        height={300}
                                    />
                                ) : (
                                    <div>
                                        <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Your Shares Value Evolution</h5>
                                        <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                            Current: {currentUserSharesValue.toFixed(2)} {symbols[0] || 'USDC'}
                                            <br />
                                            <small>Historical data will appear as time progresses</small>
                                        </p>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                )}
            </Row>
        </div>
    );
};

export default Charts;
