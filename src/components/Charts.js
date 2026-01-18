import { useSelector, useDispatch } from 'react-redux';
import { ethers } from 'ethers';
import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import Loading from './Loading';

import {
    loadStrategyRouter,
} from '../store/interactions';

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

    // Load current data
    useEffect(() => {
        const loadChartData = async () => {
            if (!strategyRouter || !dBank || !provider) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                // Load strategy router data
                await loadStrategyRouter(provider, chainId, dispatch);

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

                // Save current snapshot to historical data
                const now = Date.now();
                const priceHistory = getHistoricalData('pricePerShare');
                const assetsHistory = getHistoricalData('totalAssets');
                const strategyHistory = getHistoricalData('strategyAssets') || {};

                // Add current data point (keep last 30 points)
                const newPriceHistory = [...priceHistory, { x: now, y: parseFloat(pricePerShareFormatted) }].slice(-30);
                const newAssetsHistory = [...assetsHistory, { x: now, y: parseFloat(totalAssets) }].slice(-30);

                // Update strategy assets history
                validAssets.forEach(strategy => {
                    if (!strategyHistory[strategy.id]) {
                        strategyHistory[strategy.id] = [];
                    }
                    strategyHistory[strategy.id] = [
                        ...strategyHistory[strategy.id],
                        { x: now, y: parseFloat(strategy.assets) }
                    ].slice(-30);
                });

                // Save to localStorage
                saveHistoricalData('pricePerShare', newPriceHistory);
                saveHistoricalData('totalAssets', newAssetsHistory);
                saveHistoricalData('strategyAssets', strategyHistory);

                // Update state
                setHistoricalData({
                    pricePerShare: newPriceHistory,
                    totalAssets: newAssetsHistory,
                    strategyAssets: strategyHistory
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
    }, [strategyRouter, dBank, provider, chainId, dispatch, strategies]);

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

    // Chart 3: Price per Share Evolution (Line Chart)
    const pricePerShareOptions = {
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
                format: 'HH:mm'
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
    };

    // Chart 4: Total Assets Evolution (Line Chart)
    const totalAssetsOptions = {
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
                format: 'HH:mm'
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
    };

    // Chart 5: Strategy Assets Evolution (Line Chart)
    const strategyAssetsOptions = {
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
                format: 'HH:mm'
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

    // Prepare strategy assets series for line chart
    const strategyAssetsSeries = useMemo(() => {
        return strategyAssets.map(strategy => ({
            name: strategy.name,
            data: historicalData.strategyAssets[strategy.id] || []
        }));
    }, [strategyAssets, historicalData.strategyAssets]);

    // Chart 6: User Allocation Distribution (Pie Chart) - only if user is connected
    const userAllocationData = useMemo(() => {
        if (!account || userStrategyAllocations.length === 0) {
            return { labels: [], series: [] };
        }

        const total = userStrategyAllocations.reduce((sum, val) => {
            const num = parseFloat(val || "0");
            return sum + (isNaN(num) ? 0 : num);
        }, 0);

        if (total === 0) return { labels: [], series: [] };

        const labels = strategies
            .filter((s, idx) => {
                const userAlloc = parseFloat(userStrategyAllocations[idx] || "0");
                return strategyActive[idx] && userAlloc > 0;
            })
            .map(s => `Strategy ${s.id}`);

        const series = strategies
            .map((s, idx) => {
                if (!strategyActive[idx]) return 0;
                return parseFloat(userStrategyAllocations[idx] || "0");
            })
            .filter(val => val > 0);

        return { labels, series };
    }, [account, strategies, userStrategyAllocations, strategyActive]);

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
                                    overlay={
                                        <Popover id="allocation-distribution-info" style={{ backgroundColor: '#2d3142', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                                            <Popover.Header as="h6" style={{ backgroundColor: '#1a1d29', color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                                                Allocation Distribution
                                            </Popover.Header>
                                            <Popover.Body style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                                                Esta gráfica muestra la distribución porcentual del capital total alocado entre las diferentes estrategias activas del vault.
                                                <br /><br />
                                                <strong>Nota:</strong> Los valores representan el capital total alocado por todos los usuarios, no solo tus allocations personales.
                                            </Popover.Body>
                                        </Popover>
                                    }
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
                    <Col md={6} className="mb-4">
                        <Card style={{ backgroundColor: '#1a1d29', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Card.Body>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h5 style={{ color: '#f8f9fa', margin: 0 }}>Your Allocation Distribution</h5>
                                    <OverlayTrigger
                                        trigger="click"
                                        placement="left"
                                        overlay={
                                            <Popover id="user-allocation-distribution-info" style={{ backgroundColor: '#2d3142', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                                                <Popover.Header as="h6" style={{ backgroundColor: '#1a1d29', color: '#f8f9fa', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
                                                    Your Allocation Distribution
                                                </Popover.Header>
                                                <Popover.Body style={{ color: '#adb5bd', fontSize: '0.9rem' }}>
                                                    Esta gráfica muestra la distribución porcentual de <strong>tus allocations personales</strong> entre las diferentes estrategias.
                                                    <br /><br />
                                                    <strong>Importante:</strong> Solo puedes retirar shares que no estén alocadas en estrategias. Si tienes shares alocadas, deberás des-alocarlas primero antes de poder retirar.
                                                </Popover.Body>
                                            </Popover>
                                        }
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
