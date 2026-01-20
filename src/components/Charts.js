import { useSelector } from 'react-redux';
import { ethers } from 'ethers';
import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import Loading from './Loading';

const Charts = () => {
    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    
    const strategiesRaw = useSelector(state => state.strategyRouter.strategies);
    const strategyActiveRaw = useSelector(state => state.strategyRouter.strategyActive);
    const symbols = useSelector(state => state.tokens.symbols) || [];
    
    const dBank = useSelector(state => state.dBank.contract);
    const userSharesRaw = useSelector(state => state.dBank.shares);
    const userStrategyAllocationsRaw = useSelector(state => state.strategyRouter.userStrategyAllocations);

    // Wrap in useMemo to prevent unnecessary re-renders
    const strategies = useMemo(() => strategiesRaw || [], [strategiesRaw]);
    const strategyActive = useMemo(() => strategyActiveRaw || [], [strategyActiveRaw]);
    const userStrategyAllocations = useMemo(() => userStrategyAllocationsRaw || [], [userStrategyAllocationsRaw]);

    const [loading, setLoading] = useState(true);
    const [pricePerShare, setPricePerShare] = useState("0");
    const [historicalData, setHistoricalData] = useState({
        pricePerShare: [],
        userSharesValue: []
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
                
                // Get all unique block numbers from all events
                const blockNumbers = new Set();
                depositEvents.forEach(e => blockNumbers.add(e.blockNumber));
                allocateEvents.forEach(e => blockNumbers.add(e.blockNumber));
                feesEvents.forEach(e => blockNumbers.add(e.blockNumber));
                
                // Get timestamps for all blocks
                const blockTimestamps = {};
                for (const blockNum of blockNumbers) {
                    const block = await provider.getBlock(blockNum);
                    blockTimestamps[blockNum] = block.timestamp * 1000; // Convert to milliseconds
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
                        const totalAssetsBN = await dBank.totalAssets({ blockTag });
                        let totalAssets = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 18));
                        const totalSupplyBN = await dBank.totalSupply({ blockTag });
                        let totalSupply = parseFloat(ethers.utils.formatUnits(totalSupplyBN, 18));
                        
                        // Calculate price per share
                        const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;
                        
                        // Get user shares at this block (if account is connected)
                        let userSharesValue = 0;
                        if (account) {
                            try {
                                const userSharesBN = await dBank.balanceOf(account, { blockTag });
                                const userShares = parseFloat(ethers.utils.formatUnits(userSharesBN, 18));
                                userSharesValue = userShares * pricePerShare;
                                
                                // Debug log for first few events to verify calculations
                                if (eventData.blockNumber <= 10) {
                                    console.log(`[Charts] Block ${eventData.blockNumber}:`, {
                                        userShares: userShares.toFixed(4),
                                        pricePerShare: pricePerShare.toFixed(6),
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
                            priceHistory.push({ x: timestamp, y: pricePerShare });
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
            }
        };

        loadHistoricalDataFromEvents();
    }, [dBank, provider, account]);

    // Load current data periodically
    useEffect(() => {
        const loadChartData = async () => {
            if (!dBank || !provider) return;

            try {
                // Get current price per share
                const totalAssetsBN = await dBank.totalAssets();
                const totalAssets = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 18));
                const totalSupplyBN = await dBank.totalSupply();
                const totalSupply = parseFloat(ethers.utils.formatUnits(totalSupplyBN, 18));
                const currentPricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;
                
                setPricePerShare(currentPricePerShare.toString());
                
                // Add current point to history if it's different from last point
                const currentTimestamp = Date.now();
                setHistoricalData(prev => {
                    const lastPricePoint = prev.pricePerShare[prev.pricePerShare.length - 1];
                    const priceHistory = [...prev.pricePerShare];
                    
                    // Only add if it's been at least 1 minute since last point or price changed significantly
                    if (!lastPricePoint || 
                        (currentTimestamp - lastPricePoint.x > 60000) || 
                        Math.abs(lastPricePoint.y - currentPricePerShare) > 0.0001) {
                        priceHistory.push({ x: currentTimestamp, y: currentPricePerShare });
                        // Keep last 30 points
                        priceHistory.sort((a, b) => a.x - b.x).slice(-30);
                    }
                    
                    // Update user shares value if account is connected
                    let userSharesValueHistory = [...prev.userSharesValue];
                    if (account && userSharesRaw) {
                        let userShares = 0;
                        try {
                            if (ethers.BigNumber.isBigNumber(userSharesRaw)) {
                                userShares = parseFloat(ethers.utils.formatUnits(userSharesRaw, 18));
                            } else {
                                userShares = parseFloat(userSharesRaw || "0");
                            }
                        } catch (error) {
                            console.error("Error parsing user shares:", error);
                        }
                        
                        const currentUserValue = userShares * currentPricePerShare;
                        const lastUserValuePoint = userSharesValueHistory[userSharesValueHistory.length - 1];
                        
                        // Only add if it's been at least 1 minute since last point or value changed significantly
                        if (!lastUserValuePoint || 
                            (currentTimestamp - lastUserValuePoint.x > 60000) || 
                            Math.abs(lastUserValuePoint.y - currentUserValue) > 0.01) {
                            userSharesValueHistory.push({ x: currentTimestamp, y: currentUserValue });
                            // Keep last 30 points
                            userSharesValueHistory.sort((a, b) => a.x - b.x).slice(-30);
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

        // Refresh data every 30 seconds
        const interval = setInterval(loadChartData, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dBank, provider, account, userSharesRaw]);

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
                if (userAlloc > 0.0001) { // Use threshold to avoid floating point issues
                    labels.push(`Strategy ${s.id}`);
                    series.push(userAlloc);
                }
            }
        });

        // Calculate unallocated portion
        const unallocated = userTotalShares - totalAllocated;
        
        // Only add unallocated if it's significant and there are other allocations
        if (unallocated > 0.0001 && totalAllocated > 0.0001) {
            labels.push("Unallocated");
            series.push(unallocated);
        } else if (totalAllocated === 0 && userTotalShares > 0.0001) {
            // Only show unallocated if there are no allocations at all
            labels.push("Unallocated");
            series.push(userTotalShares);
        }

        // If no shares at all, return empty
        if (series.length === 0) return { labels: [], series: [] };

        return { labels, series, userTotalShares };
    }, [account, strategies, userStrategyAllocations, strategyActive, userSharesRaw]);

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
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(historicalData.pricePerShare, userFirstDepositTimestamp)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => val.toFixed(4)
            },
            title: { text: 'Price per Share' }
        },
        title: {
            text: 'Vault Price per Share Evolution',
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
    }), [historicalData.pricePerShare, userFirstDepositTimestamp]);

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
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(historicalData.userSharesValue, userFirstDepositTimestamp)
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
    }), [historicalData.userSharesValue, userFirstDepositTimestamp]);

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
    if (account && userSharesRaw && pricePerShare) {
        try {
            let userShares = 0;
            if (ethers.BigNumber.isBigNumber(userSharesRaw)) {
                userShares = parseFloat(ethers.utils.formatUnits(userSharesRaw, 18));
            } else {
                userShares = parseFloat(userSharesRaw || "0");
            }
            currentUserSharesValue = userShares * parseFloat(pricePerShare);
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
                                                const totalShares = userAllocationData.userTotalShares || 1;
                                                let absoluteValue = 0;
                                                
                                                if (opts && opts.w && opts.w.config && opts.w.config.series && opts.seriesIndex !== undefined) {
                                                    absoluteValue = opts.w.config.series[opts.seriesIndex] || 0;
                                                } else if (opts && opts.seriesIndex !== undefined) {
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
                                                    let absoluteValue = 0;
                                                    
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

            {/* Chart 2: Vault Price per Share Evolution */}
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

                {/* Chart 3: Your Shares Value Evolution */}
                {account && (
                    <Col md={6} className="mb-4">
                        <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Card.Body>
                                {historicalData.userSharesValue.length > 0 ? (
                                    <Chart
                                        options={userSharesValueOptions}
                                        series={[{ name: 'Your Shares Value', data: historicalData.userSharesValue }]}
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
