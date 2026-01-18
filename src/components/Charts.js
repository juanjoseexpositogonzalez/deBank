import { useSelector, useDispatch } from 'react-redux';
import { ethers } from 'ethers';
import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import Loading from './Loading';

// loadStrategyRouter removed to prevent infinite loops - data is loaded in App.js

import MOCK_S1_ABI_RAW from '../abis/MockS1.json';

// Normalize ABI - handle both formats: direct array or Hardhat artifact with .abi property
const normalizeABI = (abi) => {
    if (Array.isArray(abi)) {
        return abi;
    }
    if (abi && abi.abi && Array.isArray(abi.abi)) {
        return abi.abi;
    }
    throw new Error('Invalid ABI format');
};

const MOCK_S1_ABI = normalizeABI(MOCK_S1_ABI_RAW);

const Charts = () => {
    const chainId = useSelector(state => state.provider.chainId);
    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    
    const strategyRouter = useSelector(state => state.strategyRouter.contract);
    const strategiesRaw = useSelector(state => state.strategyRouter.strategies);
    const strategyAllocatedRaw = useSelector(state => state.strategyRouter.strategyAllocated);
    const strategyCapRaw = useSelector(state => state.strategyRouter.strategyCap);
    const strategyActiveRaw = useSelector(state => state.strategyRouter.strategyActive);
    const symbols = useSelector(state => state.tokens.symbols) || [];
    
    const dBank = useSelector(state => state.dBank.contract);
    const userSharesRaw = useSelector(state => state.dBank.shares);
    const userStrategyAllocationsRaw = useSelector(state => state.strategyRouter.userStrategyAllocations);

    // Wrap in useMemo to prevent unnecessary re-renders
    const strategies = useMemo(() => strategiesRaw || [], [strategiesRaw]);
    const strategyAllocated = useMemo(() => strategyAllocatedRaw || [], [strategyAllocatedRaw]);
    const strategyCap = useMemo(() => strategyCapRaw || [], [strategyCapRaw]);
    const strategyActive = useMemo(() => strategyActiveRaw || [], [strategyActiveRaw]);
    const userStrategyAllocations = useMemo(() => userStrategyAllocationsRaw || [], [userStrategyAllocationsRaw]);

    const dispatch = useDispatch();

    const [loading, setLoading] = useState(true);
    const [strategyAssets, setStrategyAssets] = useState([]);
    const [vaultTotalAssets, setVaultTotalAssets] = useState("0");
    const [pricePerShare, setPricePerShare] = useState("0");
    const [historicalData, setHistoricalData] = useState({
        pricePerShare: [],
        totalAssets: [],
        strategyAssets: {}
    });
    const [userFirstDepositTimestamp, setUserFirstDepositTimestamp] = useState(null);

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

                // Query Deposit events for this user
                const depositFilter = dBank.filters.Deposit(null, account);
                const events = await dBank.queryFilter(depositFilter);
                
                if (events.length > 0) {
                    // Get the first deposit event (oldest)
                    const firstEvent = events[0];
                    const block = await provider.getBlock(firstEvent.blockNumber);
                    const timestamp = block.timestamp * 1000; // Convert to milliseconds
                    
                    // Store in localStorage for future use
                    localStorage.setItem(`dBank_firstDeposit_${account}`, timestamp.toString());
                    setUserFirstDepositTimestamp(timestamp);
                } else {
                    // No deposits found, use null (will use first data point)
                    setUserFirstDepositTimestamp(null);
                }
            } catch (error) {
                console.error('Error loading first deposit timestamp:', error);
                // Fallback to null
                setUserFirstDepositTimestamp(null);
            }
        };

        loadFirstDepositTimestamp();
    }, [dBank, account, provider]);

    // Load historical data from blockchain events
    useEffect(() => {
        const loadHistoricalDataFromEvents = async () => {
            if (!dBank || !provider) return;

            try {
                // Query all relevant events from dBank
                const depositEvents = await dBank.queryFilter(dBank.filters.Deposit());
                const allocateEvents = await dBank.queryFilter(dBank.filters.Allocated());
                const feesEvents = await dBank.queryFilter(dBank.filters.FeesCrystallized());
                
                // Query strategy events for each strategy
                const strategyEventsMap = {};
                for (const strategy of strategies) {
                    if (!strategy.active || !strategy.address) continue;
                    try {
                        const strategyContract = new ethers.Contract(strategy.address, MOCK_S1_ABI, provider);
                        const s1Deposited = await strategyContract.queryFilter(strategyContract.filters.S1Deposited());
                        const s1Withdrawn = await strategyContract.queryFilter(strategyContract.filters.S1Withdrawn());
                        const s1Reported = await strategyContract.queryFilter(strategyContract.filters.S1Reported());
                        strategyEventsMap[strategy.id] = [...s1Deposited, ...s1Withdrawn, ...s1Reported];
                    } catch (error) {
                        console.error(`Error querying events for strategy ${strategy.id}:`, error);
                    }
                }
                
                // Get all unique block numbers from all events
                const blockNumbers = new Set();
                depositEvents.forEach(e => blockNumbers.add(e.blockNumber));
                allocateEvents.forEach(e => blockNumbers.add(e.blockNumber));
                feesEvents.forEach(e => blockNumbers.add(e.blockNumber));
                Object.values(strategyEventsMap).flat().forEach(e => blockNumbers.add(e.blockNumber));
                
                // Get timestamps for all blocks
                const blockTimestamps = {};
                for (const blockNum of blockNumbers) {
                    const block = await provider.getBlock(blockNum);
                    blockTimestamps[blockNum] = block.timestamp * 1000; // Convert to milliseconds
                }
                
                // Build historical data points from events
                const priceHistory = [];
                const assetsHistory = [];
                const strategyHistory = {};
                
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
                        const totalAssetsBN = await dBank.totalAssets({ blockTag });
                        const totalAssets = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 18));
                        const totalSupplyBN = await dBank.totalSupply({ blockTag });
                        const totalSupply = parseFloat(ethers.utils.formatUnits(totalSupplyBN, 18));
                        const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;
                        
                        // Avoid duplicates - check if we already have a point for this timestamp
                        const existingPricePoint = priceHistory.find(p => p.x === timestamp);
                        if (!existingPricePoint) {
                            priceHistory.push({ x: timestamp, y: pricePerShare });
                            assetsHistory.push({ x: timestamp, y: totalAssets });
                        }
                    } catch (error) {
                        console.error(`Error getting state at block ${eventData.blockNumber}:`, error);
                    }
                }
                
                // Also add current state
                const currentBlock = await provider.getBlock('latest');
                const now = currentBlock.timestamp * 1000;
                const currentTotalAssetsBN = await dBank.totalAssets();
                const currentTotalAssets = parseFloat(ethers.utils.formatUnits(currentTotalAssetsBN, 18));
                const currentTotalSupplyBN = await dBank.totalSupply();
                const currentTotalSupply = parseFloat(ethers.utils.formatUnits(currentTotalSupplyBN, 18));
                const currentPricePerShare = currentTotalSupply > 0 ? currentTotalAssets / currentTotalSupply : 1;
                
                // Add current point if not already present
                const lastPricePoint = priceHistory[priceHistory.length - 1];
                if (!lastPricePoint || lastPricePoint.x !== now) {
                    priceHistory.push({ x: now, y: currentPricePerShare });
                    assetsHistory.push({ x: now, y: currentTotalAssets });
                }
                
                // Process strategy events
                for (const [strategyId, events] of Object.entries(strategyEventsMap)) {
                    if (!strategyHistory[strategyId]) {
                        strategyHistory[strategyId] = [];
                    }
                    
                    for (const event of events) {
                        const timestamp = blockTimestamps[event.blockNumber];
                        if (!timestamp) continue;
                        
                        try {
                            // Get strategy assets at that block
                            const strategy = strategies.find(s => s.id === parseInt(strategyId));
                            if (!strategy || !strategy.address) continue;
                            
                            const strategyContract = new ethers.Contract(strategy.address, MOCK_S1_ABI, provider);
                            const totalAssetsBN = await strategyContract.totalAssets({ blockTag: event.blockNumber });
                            const totalAssets = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 18));
                            
                            // Avoid duplicates
                            const existingPoint = strategyHistory[strategyId].find(p => p.x === timestamp);
                            if (!existingPoint) {
                                strategyHistory[strategyId].push({ x: timestamp, y: totalAssets });
                            }
                        } catch (error) {
                            console.error(`Error getting strategy ${strategyId} state at block ${event.blockNumber}:`, error);
                        }
                    }
                    
                    // Sort and keep last 30
                    strategyHistory[strategyId] = strategyHistory[strategyId]
                        .sort((a, b) => a.x - b.x)
                        .slice(-30);
                }
                
                // Keep last 30 points and sort by timestamp
                const newPriceHistory = priceHistory.sort((a, b) => a.x - b.x).slice(-30);
                const newAssetsHistory = assetsHistory.sort((a, b) => a.x - b.x).slice(-30);
                
                // Save to localStorage
                saveHistoricalData('pricePerShare', newPriceHistory);
                saveHistoricalData('totalAssets', newAssetsHistory);
                saveHistoricalData('strategyAssets', strategyHistory);
                
                // Update state
                setHistoricalData(prev => ({
                    ...prev,
                    pricePerShare: newPriceHistory,
                    totalAssets: newAssetsHistory,
                    strategyAssets: strategyHistory
                }));
            } catch (error) {
                console.error('Error loading historical data from events:', error);
            }
        };

        loadHistoricalDataFromEvents();
    }, [dBank, provider, strategies]);

    // Load current data
    useEffect(() => {
        const loadChartData = async () => {
            if (!strategyRouter || !dBank || !provider) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                // Get vault metrics
                const totalAssetsBN = await dBank.totalAssets();
                const totalAssets = ethers.utils.formatUnits(totalAssetsBN, 18);
                setVaultTotalAssets(totalAssets);

                const pricePerShareBN = await dBank.pricePerShare();
                const pricePerShareFormatted = ethers.utils.formatUnits(pricePerShareBN, 18);
                setPricePerShare(pricePerShareFormatted);

                // Get assets for each strategy
                const assetsPromises = strategies.map(async (strategy) => {
                    try {
                        if (!strategy.active || !strategy.address) return null;
                        const strategyContract = new ethers.Contract(strategy.address, MOCK_S1_ABI, provider);
                        const totalAssetsBN = await strategyContract.totalAssets();
                        const totalAssets = ethers.utils.formatUnits(totalAssetsBN, 18);
                        return {
                            id: strategy.id,
                            name: `Strategy ${strategy.id}`,
                            assets: totalAssets
                        };
                    } catch (error) {
                        console.error(`Error loading assets for strategy ${strategy.id}:`, error);
                        return null;
                    }
                });

                const assetsResults = await Promise.all(assetsPromises);
                const validAssets = assetsResults.filter(a => a !== null);
                setStrategyAssets(validAssets);

                // Update strategy assets history using current blockchain timestamp
                const currentBlock = await provider.getBlock('latest');
                const now = currentBlock.timestamp * 1000;
                const strategyHistory = getHistoricalData('strategyAssets') || {};

                validAssets.forEach(strategy => {
                    if (!strategyHistory[strategy.id]) {
                        strategyHistory[strategy.id] = [];
                    }
                    // Check if we already have a point for this timestamp
                    const existingPoint = strategyHistory[strategy.id].find(p => p.x === now);
                    if (!existingPoint) {
                        strategyHistory[strategy.id] = [
                            ...strategyHistory[strategy.id],
                            { x: now, y: parseFloat(strategy.assets) }
                        ].slice(-30);
                    }
                });

                // Save strategy assets to localStorage (already handled in loadHistoricalDataFromEvents)
                saveHistoricalData('strategyAssets', strategyHistory);

                // Update state (pricePerShare and totalAssets are updated by loadHistoricalDataFromEvents)
                setHistoricalData(prev => ({
                    ...prev,
                    strategyAssets: strategyHistory
                }));

            } catch (error) {
                console.error('Error loading chart data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadChartData();

        // Refresh data every 30 seconds
        const interval = setInterval(loadChartData, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strategyRouter, dBank, provider, chainId, dispatch, strategies.length]);

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
        const assetsHistory = getHistoricalData('totalAssets');
        const strategyHistory = getHistoricalData('strategyAssets') || {};
        setHistoricalData({
            pricePerShare: priceHistory,
            totalAssets: assetsHistory,
            strategyAssets: strategyHistory
        });
    }, []);

    // Chart 1: Distribution of allocations (Pie Chart)
    const allocationDistributionData = useMemo(() => {
        const total = strategyAllocated.reduce((sum, val) => {
            const num = parseFloat(ethers.utils.formatUnits(val || "0", 18));
            return sum + (isNaN(num) ? 0 : num);
        }, 0);

        if (total === 0) return { labels: [], series: [] };

        const labels = strategies
            .filter((s, idx) => strategyActive[idx] && parseFloat(ethers.utils.formatUnits(strategyAllocated[idx] || "0", 18)) > 0)
            .map(s => `Strategy ${s.id}`);

        const series = strategies
            .map((s, idx) => {
                if (!strategyActive[idx]) return 0;
                const allocated = parseFloat(ethers.utils.formatUnits(strategyAllocated[idx] || "0", 18));
                return allocated;
            })
            .filter(val => val > 0);

        return { labels, series };
    }, [strategies, strategyAllocated, strategyActive]);

    // Chart 2: Caps vs Allocated vs Total Assets (Bar Chart)
    const capsVsAllocatedData = useMemo(() => {
        const labels = strategies
            .filter((s, idx) => strategyActive[idx])
            .map(s => `S${s.id}`);

        const caps = strategies
            .filter((s, idx) => strategyActive[idx])
            .map((s, idx) => {
                const capIdx = strategies.findIndex(str => str.id === s.id);
                return parseFloat(ethers.utils.formatUnits(strategyCap[capIdx] || "0", 18));
            });

        const allocated = strategies
            .filter((s, idx) => strategyActive[idx])
            .map((s, idx) => {
                const allocIdx = strategies.findIndex(str => str.id === s.id);
                return parseFloat(ethers.utils.formatUnits(strategyAllocated[allocIdx] || "0", 18));
            });

        const assets = strategies
            .filter((s, idx) => strategyActive[idx])
            .map(s => {
                const assetData = strategyAssets.find(a => a.id === s.id);
                return assetData ? parseFloat(assetData.assets) : 0;
            });

        return { labels, caps, allocated, assets };
    }, [strategies, strategyActive, strategyCap, strategyAllocated, strategyAssets]);

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

    // Helper function to get xaxis min value (start from first deposit)
    const getXAxisMin = (data, startTime) => {
        if (!data || !Array.isArray(data) || data.length === 0) return undefined;
        // If we have a startTime (first deposit), use it
        if (startTime) {
            // Use the earlier of: first deposit timestamp or first data point
            const firstDataPoint = data[0] && data[0].x ? data[0].x : null;
            if (firstDataPoint && firstDataPoint < startTime) {
                return firstDataPoint;
            }
            return startTime;
        }
        // If no startTime, use first data point
        const firstDataPoint = data[0] && data[0].x ? data[0].x : null;
        return firstDataPoint || undefined;
    };

    // Chart 3: Price per Share Evolution (Line Chart)
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
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(historicalData.pricePerShare, userFirstDepositTimestamp)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => parseFloat(val).toFixed(4)
            },
            title: { text: 'Price per Share' }
        },
        title: {
            text: 'Vault Price per Share Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#0d6efd'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        }
    }), [historicalData.pricePerShare, userFirstDepositTimestamp]);

    // Chart 4: Total Assets Evolution (Line Chart)
    const totalAssetsOptions = useMemo(() => ({
        chart: {
            id: 'total-assets',
            type: 'line',
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(historicalData.totalAssets, userFirstDepositTimestamp)
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
            title: { text: 'Total Assets' }
        },
        title: {
            text: 'Vault Total Assets Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#198754'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        }
    }), [historicalData.totalAssets, userFirstDepositTimestamp]);

    // Chart 5: Strategy Assets Evolution (Line Chart)
    const strategyAssetsOptions = useMemo(() => {
        // Get the longest strategy history to determine format
        const strategyAssetsData = historicalData.strategyAssets || {};
        const longestHistory = Object.values(strategyAssetsData).reduce((longest, history) => {
            if (!history || !Array.isArray(history)) return longest;
            return history.length > longest.length ? history : longest;
        }, []);
        
        return {
            chart: {
                id: 'strategy-assets',
                type: 'line',
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false,
                    format: getDateTimeFormat(longestHistory, userFirstDepositTimestamp)
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
            title: { text: 'Assets' }
        },
        title: {
            text: 'Strategy Assets Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#ffc107', '#0dcaf0', '#dc3545', '#6f42c1', '#fd7e14'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        },
        legend: {
            show: true,
            position: 'top',
            labels: { colors: '#f8f9fa' }
        }
    };
    }, [historicalData.strategyAssets, userFirstDepositTimestamp]);

    // Prepare strategy assets series for line chart
    const strategyAssetsSeries = useMemo(() => {
        return strategyAssets.map(strategy => ({
            name: strategy.name,
            data: historicalData.strategyAssets[strategy.id] || []
        }));
    }, [strategyAssets, historicalData.strategyAssets]);

    // Chart 6: User Allocation Distribution (Pie Chart) - only if user is connected
    const userAllocationData = useMemo(() => {
        if (!account) {
            return { labels: [], series: [] };
        }

        // Get user total shares
        let userTotalShares = 0;
        try {
            if (userSharesRaw) {
                if (ethers.BigNumber.isBigNumber(userSharesRaw)) {
                    userTotalShares = parseFloat(ethers.utils.formatUnits(userSharesRaw, 18));
                } else {
                    userTotalShares = parseFloat(userSharesRaw || "0");
                }
            }
        } catch (error) {
            console.error("Error parsing user shares:", error);
        }

        if (userTotalShares === 0) return { labels: [], series: [] };

        // Calculate total allocated
        const totalAllocated = userStrategyAllocations.reduce((sum, val) => {
            return sum + parseFloat(val || "0");
        }, 0);

        const labels = [];
        const series = [];

        // Add allocated strategies
        strategies.forEach((s, idx) => {
            if (strategyActive[idx]) {
                const userAlloc = parseFloat(userStrategyAllocations[idx] || "0");
                if (userAlloc > 0) {
                    labels.push(`Strategy ${s.id}`);
                    series.push(userAlloc); // Use absolute values, ApexCharts will calculate percentages
                }
            }
        });

        // Add unallocated portion if there is any
        const unallocated = userTotalShares - totalAllocated;
        // Always show unallocated if there are any shares and some are not allocated
        // Use a small threshold to avoid floating point precision issues
        if (unallocated > 0.0001) {
            labels.push("Unallocated");
            series.push(unallocated);
        }

        // If no allocations at all but user has shares, show only unallocated
        if (series.length === 0 && userTotalShares > 0) {
            labels.push("Unallocated");
            series.push(userTotalShares);
        }

        // If no shares at all, return empty
        if (series.length === 0) return { labels: [], series: [] };

        return { labels, series, userTotalShares };
    }, [account, strategies, userStrategyAllocations, strategyActive, userSharesRaw]);

    // Memoize Popovers to prevent infinite re-renders
    const allocationDistributionPopover = useMemo(() => (
        <Popover id="allocation-distribution-info" style={{ backgroundColor: '#2d3142', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
            <Popover.Header as="h6" style={{ backgroundColor: '#1a1d29', color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                Allocation Distribution
            </Popover.Header>
            <Popover.Body style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                This chart shows the percentage distribution of total allocated capital across the different active strategies in the vault.
                <br /><br />
                <strong>Note:</strong> The values represent the total capital allocated by all users, not just your personal allocations.
            </Popover.Body>
        </Popover>
    ), []);

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

    return (
        <div style={{ padding: '20px' }}>
            <Row className="mb-4">
                <Col md={6} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h5 style={{ color: '#f8f9fa', margin: 0 }}>Allocation Distribution</h5>
                                <OverlayTrigger
                                    trigger="click"
                                    placement="left"
                                    overlay={allocationDistributionPopover}
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
                            {allocationDistributionData.series.length > 0 ? (
                                <Chart
                                    options={{
                                        chart: { type: 'pie' },
                                        labels: allocationDistributionData.labels,
                                        legend: {
                                            position: 'bottom',
                                            labels: { colors: '#f8f9fa' }
                                        },
                                        theme: { mode: 'dark' },
                                        dataLabels: {
                                            formatter: (val) => val.toFixed(1) + '%'
                                        },
                                        tooltip: {
                                            y: {
                                                formatter: (val) => {
                                                    const symbol = symbols[0] || 'USDC';
                                                    return `${parseFloat(val).toFixed(2)} ${symbol}`;
                                                }
                                            }
                                        }
                                    }}
                                    series={allocationDistributionData.series}
                                    type="pie"
                                    height={300}
                                />
                            ) : (
                                <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                    No allocations yet
                                </p>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col md={6} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Caps vs Allocated vs Assets</h5>
                            {capsVsAllocatedData.labels.length > 0 ? (
                                <Chart
                                    options={{
                                        chart: { type: 'bar', toolbar: { show: false } },
                                        plotOptions: {
                                            bar: {
                                                horizontal: false,
                                                columnWidth: '55%',
                                                dataLabels: { position: 'top' }
                                            }
                                        },
                                        dataLabels: {
                                            enabled: true,
                                            formatter: (val) => {
                                                if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                                                if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
                                                return val.toFixed(0);
                                            },
                                            offsetY: -20,
                                            style: { colors: ['#f8f9fa'], fontSize: '12px' }
                                        },
                                        xaxis: {
                                            categories: capsVsAllocatedData.labels,
                                            labels: { style: { colors: '#f8f9fa' } }
                                        },
                                        yaxis: {
                                            labels: {
                                                style: { colors: '#f8f9fa' },
                                                formatter: (val) => {
                                                    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                                                    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
                                                    return val.toFixed(0);
                                                }
                                            },
                                            title: { text: 'Amount', style: { color: '#f8f9fa' } }
                                        },
                                        legend: {
                                            position: 'top',
                                            labels: { colors: '#f8f9fa' }
                                        },
                                        colors: ['#6c757d', '#0d6efd', '#198754'],
                                        theme: { mode: 'dark' },
                                        grid: {
                                            borderColor: 'rgba(255, 255, 255, 0.1)'
                                        },
                                        tooltip: {
                                            y: {
                                                formatter: (val) => {
                                                    const symbol = symbols[0] || 'USDC';
                                                    return `${parseFloat(val).toFixed(2)} ${symbol}`;
                                                }
                                            }
                                        }
                                    }}
                                    series={[
                                        { name: 'Cap', data: capsVsAllocatedData.caps },
                                        { name: 'Allocated', data: capsVsAllocatedData.allocated },
                                        { name: 'Total Assets', data: capsVsAllocatedData.assets }
                                    ]}
                                    type="bar"
                                    height={300}
                                />
                            ) : (
                                <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                    No strategies available
                                </p>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4">
                <Col md={6} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            {historicalData.pricePerShare.length > 0 ? (
                                <Chart
                                    options={pricePerShareOptions}
                                    series={[{ name: 'Price per Share', data: historicalData.pricePerShare }]}
                                    type="line"
                                    height={300}
                                />
                            ) : (
                                <div>
                                    <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Vault Price per Share Evolution</h5>
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

                <Col md={6} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            {historicalData.totalAssets.length > 0 ? (
                                <Chart
                                    options={totalAssetsOptions}
                                    series={[{ name: 'Total Assets', data: historicalData.totalAssets }]}
                                    type="line"
                                    height={300}
                                />
                            ) : (
                                <div>
                                    <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Vault Total Assets Evolution</h5>
                                    <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                        Current: {parseFloat(vaultTotalAssets).toFixed(2)} {symbols[0] || 'USDC'}
                                        <br />
                                        <small>Historical data will appear as time progresses</small>
                                    </p>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4">
                <Col md={12} className="mb-4">
                    <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Card.Body>
                            {strategyAssetsSeries.length > 0 && strategyAssetsSeries.some(s => s.data.length > 0) ? (
                                <Chart
                                    options={strategyAssetsOptions}
                                    series={strategyAssetsSeries}
                                    type="line"
                                    height={350}
                                />
                            ) : (
        <div>
                                    <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Strategy Assets Evolution</h5>
                                    <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                        {strategyAssets.length > 0 ? (
                                            <>
                                                Current assets:
                                                <br />
                                                {strategyAssets.map(s => (
                                                    <span key={s.id} style={{ margin: '0 10px' }}>
                                                        {s.name}: {parseFloat(s.assets).toFixed(2)} {symbols[0] || 'USDC'}
                                                    </span>
                                                ))}
                                                <br />
                                                <small>Historical data will appear as time progresses</small>
                                            </>
                                        ) : (
                                            'No strategies with assets yet'
                                        )}
                                    </p>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

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
                                                // Calculate percentage based on user total shares
                                                // Use the absolute value from series via w.config.series[seriesIndex]
                                                const totalShares = userAllocationData.userTotalShares || 1;
                                                let absoluteValue = 0;
                                                
                                                // Try to get absolute value from w.config.series (ApexCharts way)
                                                if (opts && opts.w && opts.w.config && opts.w.config.series && opts.seriesIndex !== undefined) {
                                                    absoluteValue = opts.w.config.series[opts.seriesIndex] || 0;
                                                } else if (opts && opts.seriesIndex !== undefined) {
                                                    // Fallback to our series array
                                                    absoluteValue = userAllocationData.series[opts.seriesIndex] || 0;
                                                } else if (opts && opts.dataPointIndex !== undefined) {
                                                    absoluteValue = userAllocationData.series[opts.dataPointIndex] || 0;
                                                }
                                                
                                                const percentage = (absoluteValue / totalShares) * 100;
                                                return percentage.toFixed(1) + '%';
                                            }
                                        },
                                        tooltip: {
                                            y: {
                                                formatter: (val, opts) => {
                                                    const symbol = symbols[0] || 'USDC';
                                                    const totalShares = userAllocationData.userTotalShares || 1;
                                                    // Use absolute value from series for percentage calculation
                                                    let absoluteValue = 0;
                                                    
                                                    // Try to get absolute value from w.config.series (ApexCharts way)
                                                    if (opts && opts.w && opts.w.config && opts.w.config.series && opts.seriesIndex !== undefined) {
                                                        absoluteValue = opts.w.config.series[opts.seriesIndex] || 0;
                                                    } else if (opts && opts.seriesIndex !== undefined) {
                                                        absoluteValue = userAllocationData.series[opts.seriesIndex] || 0;
                                                    } else if (opts && opts.dataPointIndex !== undefined) {
                                                        absoluteValue = userAllocationData.series[opts.dataPointIndex] || 0;
                                                    }
                                                    
                                                    const percentage = (absoluteValue / totalShares) * 100;
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
        </div>
    );
};

export default Charts;
