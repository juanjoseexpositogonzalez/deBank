import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useMemo, useCallback } from 'react';
import { Card, Row, Col, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import Loading from './Loading';
import { loadChartData } from '../store/interactions';

const Charts = () => {
    const dispatch = useDispatch();
    
    // Provider state
    const provider = useSelector(state => state.provider.connection);
    const account = useSelector(state => state.provider.account);
    
    // Contract state
    const dBank = useSelector(state => state.dBank.contract);
    const strategyRouter = useSelector(state => state.strategyRouter.contract);
    const symbolsRaw = useSelector(state => state.tokens.symbols);
    const symbols = useMemo(() => symbolsRaw || [], [symbolsRaw]);
    
    // Strategy state for pie chart
    const strategiesRaw = useSelector(state => state.strategyRouter.strategies);
    const strategyActiveRaw = useSelector(state => state.strategyRouter.strategyActive);
    const userStrategyAllocationsValueRaw = useSelector(state => state.strategyRouter.userStrategyAllocationsValue);
    const userSharesRaw = useSelector(state => state.dBank.shares);
    
    // Charts state from Redux
    const pricePerShareHistory = useSelector(state => state.charts.pricePerShareHistory);
    const userSharesValueHistory = useSelector(state => state.charts.userSharesValueHistory);
    const currentPricePerShare = useSelector(state => state.charts.currentPricePerShare);
    const currentUserSharesValue = useSelector(state => state.charts.currentUserSharesValue);
    const lastBlockTimestamp = useSelector(state => state.charts.lastBlockTimestamp);
    const isLoading = useSelector(state => state.charts.isLoading);

    // Memoize arrays to prevent unnecessary re-renders
    const strategies = useMemo(() => strategiesRaw || [], [strategiesRaw]);
    const strategyActive = useMemo(() => strategyActiveRaw || [], [strategyActiveRaw]);
    const userStrategyAllocationsValue = useMemo(() => userStrategyAllocationsValueRaw || [], [userStrategyAllocationsValueRaw]);

    // Load chart data function
    const refreshChartData = useCallback(async () => {
        if (provider && dBank) {
            await loadChartData(provider, dBank, strategyRouter, account, dispatch);
        }
    }, [provider, dBank, strategyRouter, account, dispatch]);

    // Initial load and periodic refresh
    useEffect(() => {
        refreshChartData();

        // Refresh every 5 seconds
        const interval = setInterval(refreshChartData, 5000);
        return () => clearInterval(interval);
    }, [refreshChartData]);

    // Helper function to determine datetime format based on data range
    const getDateTimeFormat = useCallback((data) => {
        if (!data || !Array.isArray(data) || data.length < 2) return 'HH:mm';
        const timestamps = data.map(d => d && d.x ? d.x : null).filter(x => x !== null);
        if (timestamps.length < 2) return 'HH:mm';
        
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const diffMs = maxTime - minTime;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        if (diffDays > 365) return 'MMM yyyy';
        if (diffDays > 30) return 'MMM dd';
        if (diffDays > 1) return 'MMM dd HH:mm';
        return 'HH:mm';
    }, []);

    // User allocation data for pie chart
    const userAllocationData = useMemo(() => {
        if (!account) {
            return { labels: [], series: [] };
        }

        // Get user total shares
        let userTotalShares = 0;
        try {
            userTotalShares = parseFloat(userSharesRaw || "0");
        } catch (error) {
            console.error("Error parsing user shares:", error);
        }

        const currentPps = parseFloat(currentPricePerShare || "1");
        const totalUserValue = userTotalShares * currentPps;

        if (totalUserValue === 0 && userStrategyAllocationsValue.length === 0) {
            return { labels: [], series: [] };
        }

        const labels = [];
        const series = [];
        let totalAllocatedValue = 0;

        strategies.forEach((s, idx) => {
            if (strategyActive[idx] && userStrategyAllocationsValue[idx] !== undefined) {
                const allocValue = parseFloat(userStrategyAllocationsValue[idx] || "0");
                if (allocValue > 0.0001) {
                    labels.push(`Strategy ${s.id}`);
                    series.push(allocValue);
                    totalAllocatedValue += allocValue;
                }
            }
        });

        // Calculate unallocated portion
        const unallocated = Math.max(totalUserValue - totalAllocatedValue, 0);
        
        if (unallocated > 0.0001) {
            labels.push("Unallocated");
            series.push(unallocated);
        }

        if (series.length === 0) return { labels: [], series: [] };

        const totalValue = unallocated + totalAllocatedValue;
        return { labels, series, userTotalShares, totalUserValue, totalValue };
    }, [account, strategies, strategyActive, userSharesRaw, userStrategyAllocationsValue, currentPricePerShare]);

    // Chart options for Price per Share
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
            max: lastBlockTimestamp || undefined,
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(pricePerShareHistory)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => val ? val.toFixed(4) : '0'
            },
            title: { text: 'Price per Share' }
        },
        title: {
            text: 'Price per Share Evolution',
            style: { color: '#f8f9fa', fontSize: '16px' }
        },
        colors: ['#0dcaf0'],
        theme: { mode: 'dark' },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.1)'
        },
        legend: { show: false }
    }), [pricePerShareHistory, lastBlockTimestamp, getDateTimeFormat]);

    // Chart options for User Shares Value
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
            max: lastBlockTimestamp || undefined,
            labels: {
                datetimeUTC: false,
                format: getDateTimeFormat(userSharesValueHistory)
            }
        },
        yaxis: {
            labels: {
                formatter: (val) => {
                    if (!val) return '0';
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
        legend: { show: false }
    }), [userSharesValueHistory, lastBlockTimestamp, getDateTimeFormat]);

    // Pie chart popover
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

    // Pie chart options
    const pieChartOptions = useMemo(() => ({
        chart: { type: 'pie' },
        labels: userAllocationData.labels,
        legend: {
            position: 'bottom',
            labels: { colors: '#f8f9fa' }
        },
        theme: { mode: 'dark' },
        dataLabels: {
            formatter: (val) => val ? val.toFixed(1) + '%' : '0%'
        },
        tooltip: {
            y: {
                formatter: (val, opts) => {
                    const symbol = symbols[0] || 'USDC';
                    const totalValue = userAllocationData.totalValue || 1;
                    let absoluteValue = 0;
                    
                    if (opts && opts.seriesIndex !== undefined) {
                        absoluteValue = userAllocationData.series[opts.seriesIndex] || 0;
                    }
                    
                    const percentage = (absoluteValue / totalValue) * 100;
                    return `${parseFloat(absoluteValue).toFixed(2)} ${symbol} (${percentage.toFixed(1)}%)`;
                }
            }
        }
    }), [userAllocationData, symbols]);

    if (isLoading && pricePerShareHistory.length === 0) {
        return <Loading />;
    }

    const currentUserValue = parseFloat(currentUserSharesValue || "0");
    const currentPps = parseFloat(currentPricePerShare || "1");

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
                                    options={pieChartOptions}
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
                            {pricePerShareHistory.length > 0 ? (
                                <Chart
                                    options={pricePerShareOptions}
                                    series={[{ name: 'Price per Share', data: pricePerShareHistory }]}
                                    type="line"
                                    height={300}
                                />
                            ) : (
                                <div>
                                    <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Price per Share Evolution</h5>
                                    <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                        Current: {currentPps.toFixed(4)}
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
                                {userSharesValueHistory.length > 0 ? (
                                    <Chart
                                        options={userSharesValueOptions}
                                        series={[{ name: 'Your Shares Value', data: userSharesValueHistory }]}
                                        type="line"
                                        height={300}
                                    />
                                ) : (
                                    <div>
                                        <h5 style={{ color: '#f8f9fa', marginBottom: '20px' }}>Your Shares Value Evolution</h5>
                                        <p style={{ color: '#adb5bd', textAlign: 'center', padding: '50px' }}>
                                            Current: {currentUserValue.toFixed(2)} {symbols[0] || 'USDC'}
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
