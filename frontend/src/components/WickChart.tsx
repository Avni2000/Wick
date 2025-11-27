import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { INDICATOR_TYPES, NODE_CONFIGS } from '../types/nodes'
import { useStrategyStore, type TradeMarker } from '../store/strategyStore'
import { API } from '../utils/api'

interface CandleData {
    time: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
}

interface StockInfo {
    name: string
    currency: string
    exchange: string
    marketCap?: number
    previousClose?: number
}

interface SearchResult {
    symbol: string
    name: string
    exchange: string
    type: string
}

// Simple SMA calculation
const calculateSMA = (data: any[], period: number) => {
    const smaData = []
    for (let i = period - 1; i < data.length; i++) {
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0)
        smaData.push({
            time: data[i].time,
            value: sum / period,
        })
    }
    return smaData
}

// Simple RSI calculation (simplified)
const calculateRSI = (data: any[], period: number) => {
    const rsiData = []
    let gains = 0
    let losses = 0

    // First average gain/loss
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close
        if (change > 0) gains += change
        else losses -= change
    }

    let avgGain = gains / period
    let avgLoss = losses / period

    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close
        const gain = change > 0 ? change : 0
        const loss = change < 0 ? -change : 0

        avgGain = (avgGain * (period - 1) + gain) / period
        avgLoss = (avgLoss * (period - 1) + loss) / period

        const rs = avgGain / avgLoss
        const rsi = 100 - (100 / (1 + rs))

        rsiData.push({
            time: data[i].time,
            value: rsi,
        })
    }
    return rsiData
}

// EMA calculation
const calculateEMA = (data: any[], period: number) => {
    const emaData = []
    const multiplier = 2 / (period + 1)

    // Start with SMA for first EMA value
    let sum = 0
    for (let i = 0; i < period; i++) {
        sum += data[i].close
    }
    let ema = sum / period
    emaData.push({ time: data[period - 1].time, value: ema })

    for (let i = period; i < data.length; i++) {
        ema = (data[i].close - ema) * multiplier + ema
        emaData.push({ time: data[i].time, value: ema })
    }
    return emaData
}

// MACD calculation
const calculateMACD = (data: any[], fast: number, slow: number, signal: number) => {
    const macdLine = []
    const signalLine = []
    const histogram = []

    // Calculate fast and slow EMAs
    const fastEMA = calculateEMA(data, fast)
    const slowEMA = calculateEMA(data, slow)

    // Create a map for quick lookup
    const fastMap = new Map(fastEMA.map(d => [d.time, d.value]))
    const slowMap = new Map(slowEMA.map(d => [d.time, d.value]))

    // Calculate MACD line (fast EMA - slow EMA)
    const macdData: { time: number; value: number }[] = []
    slowEMA.forEach(slow => {
        const fastVal = fastMap.get(slow.time)
        if (fastVal !== undefined) {
            macdData.push({ time: slow.time as number, value: fastVal - slow.value })
        }
    })

    // Calculate signal line (EMA of MACD)
    if (macdData.length >= signal) {
        const multiplier = 2 / (signal + 1)
        let sum = 0
        for (let i = 0; i < signal; i++) {
            sum += macdData[i].value
        }
        let signalEma = sum / signal

        for (let i = signal - 1; i < macdData.length; i++) {
            if (i >= signal) {
                signalEma = (macdData[i].value - signalEma) * multiplier + signalEma
            }
            macdLine.push({ time: macdData[i].time, value: macdData[i].value })
            signalLine.push({ time: macdData[i].time, value: signalEma })
            histogram.push({ time: macdData[i].time, value: macdData[i].value - signalEma })
        }
    }

    return { macdLine, signalLine, histogram }
}

// Bollinger Bands calculation
const calculateBollingerBands = (data: any[], period: number, stdDev: number) => {
    const upper = []
    const middle = []
    const lower = []

    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1)
        const sum = slice.reduce((acc: number, val: any) => acc + val.close, 0)
        const mean = sum / period

        const squaredDiffs = slice.map((val: any) => Math.pow(val.close - mean, 2))
        const variance = squaredDiffs.reduce((acc: number, val: number) => acc + val, 0) / period
        const std = Math.sqrt(variance)

        middle.push({ time: data[i].time, value: mean })
        upper.push({ time: data[i].time, value: mean + stdDev * std })
        lower.push({ time: data[i].time, value: mean - stdDev * std })
    }

    return { upper, middle, lower }
}

// ATR calculation
const calculateATR = (data: any[], period: number) => {
    const atrData = []
    const trueRanges = []

    for (let i = 1; i < data.length; i++) {
        const high = data[i].high
        const low = data[i].low
        const prevClose = data[i - 1].close

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        )
        trueRanges.push({ time: data[i].time, value: tr })
    }

    // First ATR is simple average
    if (trueRanges.length >= period) {
        let sum = 0
        for (let i = 0; i < period; i++) {
            sum += trueRanges[i].value
        }
        let atr = sum / period
        atrData.push({ time: trueRanges[period - 1].time, value: atr })

        // Subsequent ATRs use smoothing
        for (let i = period; i < trueRanges.length; i++) {
            atr = (atr * (period - 1) + trueRanges[i].value) / period
            atrData.push({ time: trueRanges[i].time, value: atr })
        }
    }

    return atrData
}

// Stochastic calculation
const calculateStochastic = (data: any[], kPeriod: number, dPeriod: number, slowing: number) => {
    const kLine = []
    const dLine = []

    // Calculate raw %K values
    const rawK = []
    for (let i = kPeriod - 1; i < data.length; i++) {
        const slice = data.slice(i - kPeriod + 1, i + 1)
        const highestHigh = Math.max(...slice.map((d: any) => d.high))
        const lowestLow = Math.min(...slice.map((d: any) => d.low))
        const currentClose = data[i].close

        const k = highestHigh !== lowestLow
            ? ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100
            : 50
        rawK.push({ time: data[i].time, value: k })
    }

    // Apply slowing (SMA of raw %K)
    for (let i = slowing - 1; i < rawK.length; i++) {
        const slice = rawK.slice(i - slowing + 1, i + 1)
        const avg = slice.reduce((acc, val) => acc + val.value, 0) / slowing
        kLine.push({ time: rawK[i].time, value: avg })
    }

    // Calculate %D (SMA of %K)
    for (let i = dPeriod - 1; i < kLine.length; i++) {
        const slice = kLine.slice(i - dPeriod + 1, i + 1)
        const avg = slice.reduce((acc, val) => acc + val.value, 0) / dPeriod
        dLine.push({ time: kLine[i].time, value: avg })
    }

    return { kLine, dLine }
}

// ADX calculation
const calculateADX = (data: any[], period: number) => {
    const adxData = []
    const plusDI = []
    const minusDI = []

    // Calculate +DM, -DM, and TR
    const dmPlus = []
    const dmMinus = []
    const trueRanges = []

    for (let i = 1; i < data.length; i++) {
        const high = data[i].high
        const low = data[i].low
        const prevHigh = data[i - 1].high
        const prevLow = data[i - 1].low
        const prevClose = data[i - 1].close

        const upMove = high - prevHigh
        const downMove = prevLow - low

        dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0)
        dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0)

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        )
        trueRanges.push(tr)
    }

    if (trueRanges.length < period) return { adxData, plusDI, minusDI }

    // Smooth the values
    let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0)
    let smoothedPlusDM = dmPlus.slice(0, period).reduce((a, b) => a + b, 0)
    let smoothedMinusDM = dmMinus.slice(0, period).reduce((a, b) => a + b, 0)

    const dxValues = []

    for (let i = period; i < trueRanges.length; i++) {
        smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i]
        smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + dmPlus[i]
        smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + dmMinus[i]

        const pdi = (smoothedPlusDM / smoothedTR) * 100
        const mdi = (smoothedMinusDM / smoothedTR) * 100
        const dx = Math.abs(pdi - mdi) / (pdi + mdi) * 100

        plusDI.push({ time: data[i + 1].time, value: pdi })
        minusDI.push({ time: data[i + 1].time, value: mdi })
        dxValues.push({ time: data[i + 1].time, value: isNaN(dx) ? 0 : dx })
    }

    // Calculate ADX (smoothed DX)
    if (dxValues.length >= period) {
        let adx = dxValues.slice(0, period).reduce((a, b) => a + b.value, 0) / period
        adxData.push({ time: dxValues[period - 1].time, value: adx })

        for (let i = period; i < dxValues.length; i++) {
            adx = ((adx * (period - 1)) + dxValues[i].value) / period
            adxData.push({ time: dxValues[i].time, value: adx })
        }
    }

    return { adxData, plusDI, minusDI }
}

// Interval options with their constraints
// Updated based on yfinance intraday limits:
// - 1m: 7 days
// - Other intraday (< 1d): 60 days
const INTERVAL_OPTIONS = [
    { value: '1m',  label: '1 min',   maxPeriod: '7d',  defaultPeriod: '1d' },
    { value: '2m',  label: '2 min',   maxPeriod: '60d', defaultPeriod: '5d' },
    { value: '5m',  label: '5 min',   maxPeriod: '60d', defaultPeriod: '5d' },
    { value: '15m', label: '15 min',  maxPeriod: '60d', defaultPeriod: '5d' },
    { value: '30m', label: '30 min',  maxPeriod: '60d', defaultPeriod: '5d' },
    { value: '1h',  label: '1 hour',  maxPeriod: '730d', defaultPeriod: '1mo' },
    { value: '1d',  label: '1 day',   maxPeriod: 'max', defaultPeriod: '1y' },
    { value: '1wk', label: '1 week',  maxPeriod: 'max', defaultPeriod: '5y' },
    { value: '1mo', label: '1 month', maxPeriod: 'max', defaultPeriod: 'max' },
]

const PERIOD_OPTIONS = [
    { value: '1d', label: '1 Day' },
    { value: '5d', label: '5 Days' },
    { value: '1mo', label: '1 Month' },
    { value: '3mo', label: '3 Months' },
    { value: '6mo', label: '6 Months' },
    { value: '1y', label: '1 Year' },
    { value: '2y', label: '2 Years' },
    { value: '5y', label: '5 Years' },
    { value: 'max', label: 'Max' },
]

export default function WickChart() {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
    const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">[]>>(new Map())
    const tradeMarkerSeriesRef = useRef<ISeriesApi<"Line">[]>([])

    const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set())
    const [chartData, setChartData] = useState<CandleData[]>([])
    const [currentTicker, setCurrentTicker] = useState('AAPL')
    const [stockInfo, setStockInfo] = useState<StockInfo | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Interval and period state
    const [selectedInterval, setSelectedInterval] = useState('1d')
    const [selectedPeriod, setSelectedPeriod] = useState('max')
    const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)
    
    // Search state
    const [tickerSearch, setTickerSearch] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [showSearchResults, setShowSearchResults] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    
    // Trade markers state
    const [selectedTrade, setSelectedTrade] = useState<TradeMarker | null>(null)
    
    // Get backtest plot data from store
    const backtestPlotData = useStrategyStore(state => state.backtestPlotData)
    
    // Navigate chart to show a specific trade
    const navigateToTrade = useCallback((trade: TradeMarker) => {
        if (!chartRef.current || chartData.length === 0) return
        
        const timeScale = chartRef.current.timeScale()
        
        // Find the candle times that contain this trade
        const entryTime = trade.entry_unix
        const exitTime = trade.exit_unix
        
        // Add padding around the trade (show some context before entry and after exit)
        const tradeDuration = exitTime - entryTime
        const padding = Math.max(tradeDuration * 0.5, 86400 * 5) // At least 5 days padding
        
        const rangeStart = entryTime - padding
        const rangeEnd = exitTime + padding
        
        // Use setVisibleRange which works with actual timestamps
        try {
            timeScale.setVisibleRange({
                from: rangeStart as any,
                to: rangeEnd as any
            })
        } catch (e) {
            // Fallback: scroll to approximate position based on data index
            const entryIndex = chartData.findIndex(c => c.time >= entryTime)
            if (entryIndex >= 0) {
                const totalBars = chartData.length
                const visibleBars = 50 // Show about 50 bars
                const targetPosition = -(totalBars - entryIndex - visibleBars / 2)
                timeScale.scrollToPosition(targetPosition, true)
            }
        }
        
        setSelectedTrade(trade)
    }, [chartData])
    const setBacktestPlotData = useStrategyStore(state => state.setBacktestPlotData)

    // Get available periods for the selected interval
    const getAvailablePeriods = useCallback((interval: string) => {
        const intervalConfig = INTERVAL_OPTIONS.find(i => i.value === interval)
        if (!intervalConfig) return PERIOD_OPTIONS
        
        const maxPeriodIndex = PERIOD_OPTIONS.findIndex(p => p.value === intervalConfig.maxPeriod)
        if (maxPeriodIndex === -1) return PERIOD_OPTIONS
        
        return PERIOD_OPTIONS.slice(0, maxPeriodIndex + 1)
    }, [])

    // Handle interval change
    const handleIntervalChange = useCallback((newInterval: string) => {
        setSelectedInterval(newInterval)
        const intervalConfig = INTERVAL_OPTIONS.find(i => i.value === newInterval)
        if (intervalConfig) {
            // Check if current period is valid for new interval
            const availablePeriods = getAvailablePeriods(newInterval)
            const periodIsValid = availablePeriods.some(p => p.value === selectedPeriod)
            if (!periodIsValid) {
                setSelectedPeriod(intervalConfig.defaultPeriod)
            }
        }
    }, [selectedPeriod, getAvailablePeriods])

    // Fetch chart data
    const fetchChartData = useCallback(async (ticker: string, period: string, interval: string) => {
        setIsLoading(true)
        setError(null)
        
        try {
            const response = await fetch(API.chart(ticker, period, interval))
            const data = await response.json()
            
            if (data.success) {
                setChartData(data.candles)
                setStockInfo(data.info)
                // Note: Don't update currentTicker here - it causes loops
                // The ticker is already set by the caller
            } else {
                setError(data.error || 'Failed to fetch data')
            }
        } catch (err) {
            setError('Failed to connect to server')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Search for tickers
    const searchTickers = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([])
            return
        }
        
        setIsSearching(true)
        try {
            const response = await fetch(API.search(query))
            const data = await response.json()
            
            if (data.success) {
                setSearchResults(data.results)
            }
        } catch (err) {
            console.error('Search error:', err)
        } finally {
            setIsSearching(false)
        }
    }, [])

    // Debounced search
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }
        
        if (tickerSearch.trim()) {
            searchTimeoutRef.current = setTimeout(() => {
                searchTickers(tickerSearch)
            }, 300)
        } else {
            setSearchResults([])
        }
        
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current)
            }
        }
    }, [tickerSearch, searchTickers])

    // Track if this is the initial mount to avoid double-fetching
    const isInitialMount = useRef(true)
    // Track if we've already applied backtest data to avoid re-applying on tab switches
    const appliedBacktestRef = useRef<string | null>(null)

    // Fetch data when ticker, interval, or period changes
    useEffect(() => {
        // Skip the first run since we'll fetch on mount anyway
        if (isInitialMount.current) {
            isInitialMount.current = false
            // Check if we have backtest data to show - if so, use that ticker
            if (backtestPlotData && appliedBacktestRef.current !== backtestPlotData.ticker) {
                appliedBacktestRef.current = backtestPlotData.ticker
                fetchChartData(backtestPlotData.ticker.toUpperCase(), selectedPeriod, selectedInterval)
                setCurrentTicker(backtestPlotData.ticker.toUpperCase())
            } else {
                fetchChartData(currentTicker, selectedPeriod, selectedInterval)
            }
            return
        }
        
        // Refetch when any of these change
        if (currentTicker) {
            fetchChartData(currentTicker, selectedPeriod, selectedInterval)
        }
    }, [currentTicker, selectedInterval, selectedPeriod, fetchChartData])
    
    // Handle backtest plot data - switch to the backtest ticker
    // Note: We only set the ticker here; the main data fetch effect will handle fetching
    useEffect(() => {
        if (backtestPlotData && appliedBacktestRef.current !== backtestPlotData.ticker) {
            appliedBacktestRef.current = backtestPlotData.ticker
            const upperTicker = backtestPlotData.ticker.toUpperCase()
            setCurrentTicker(prev => prev.toUpperCase() !== upperTicker ? upperTicker : prev)
        }
    }, [backtestPlotData])

    // Create chart
    useEffect(() => {
        if (!chartContainerRef.current) return

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#1E1E1E' },
                textColor: '#D9D9D9',
            },
            grid: {
                vertLines: { color: '#2B2B2B' },
                horzLines: { color: '#2B2B2B' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        })

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        })

        candlestickSeries.setData(chartData as any)

        chartRef.current = chart
        candlestickSeriesRef.current = candlestickSeries

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth })
            }
        }

        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            chart.remove()
        }
    }, [chartData])
    
    // Resize chart when sidebar visibility changes
    useEffect(() => {
        if (chartRef.current && chartContainerRef.current) {
            // Small delay to allow CSS transition to complete
            const timer = setTimeout(() => {
                chartRef.current?.applyOptions({ 
                    width: chartContainerRef.current?.clientWidth || 0 
                })
            }, 50)
            return () => clearTimeout(timer)
        }
    }, [backtestPlotData])

    // Handle indicators
    useEffect(() => {
        if (!chartRef.current) return

        // Remove inactive indicators
        indicatorSeriesRef.current.forEach((seriesArray, key) => {
            if (!activeIndicators.has(key)) {
                seriesArray.forEach(series => chartRef.current?.removeSeries(series))
                indicatorSeriesRef.current.delete(key)
            }
        })

        // Add active indicators
        activeIndicators.forEach((key) => {
            if (indicatorSeriesRef.current.has(key)) return

            const seriesArray: ISeriesApi<"Line">[] = []

            if (key === INDICATOR_TYPES.SMA) {
                const series = chartRef.current!.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, title: 'SMA' })
                const data = calculateSMA(chartData, NODE_CONFIGS.sma.period)
                series.setData(data)
                seriesArray.push(series)
            } else if (key === INDICATOR_TYPES.EMA) {
                const series = chartRef.current!.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2, title: 'EMA' })
                const data = calculateEMA(chartData, NODE_CONFIGS.ema.period)
                series.setData(data)
                seriesArray.push(series)
            } else if (key === INDICATOR_TYPES.RSI) {
                const series = chartRef.current!.addSeries(LineSeries, {
                    color: '#E91E63',
                    lineWidth: 2,
                    title: 'RSI',
                    priceScaleId: 'left'
                })
                chartRef.current!.applyOptions({
                    leftPriceScale: { visible: true }
                })
                const data = calculateRSI(chartData, NODE_CONFIGS.rsi.period)
                series.setData(data)
                seriesArray.push(series)
            } else if (key === INDICATOR_TYPES.MACD) {
                // MACD Line
                const macdSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#2196F3',
                    lineWidth: 2,
                    title: 'MACD',
                    priceScaleId: 'macd'
                })
                // Signal Line
                const signalSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#FF9800',
                    lineWidth: 2,
                    title: 'Signal',
                    priceScaleId: 'macd'
                })
                // Histogram
                const histSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#4CAF50',
                    lineWidth: 1,
                    title: 'Histogram',
                    priceScaleId: 'macd'
                })

                const { macdLine, signalLine, histogram } = calculateMACD(
                    chartData,
                    NODE_CONFIGS.macd.fast,
                    NODE_CONFIGS.macd.slow,
                    NODE_CONFIGS.macd.signal
                )
                macdSeries.setData(macdLine)
                signalSeries.setData(signalLine)
                histSeries.setData(histogram)
                seriesArray.push(macdSeries, signalSeries, histSeries)
            } else if (key === INDICATOR_TYPES.BB) {
                // Upper Band
                const upperSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#9C27B0',
                    lineWidth: 1,
                    title: 'BB Upper'
                })
                // Middle Band (SMA)
                const middleSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#9C27B0',
                    lineWidth: 2,
                    title: 'BB Middle'
                })
                // Lower Band
                const lowerSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#9C27B0',
                    lineWidth: 1,
                    title: 'BB Lower'
                })

                const { upper, middle, lower } = calculateBollingerBands(
                    chartData,
                    NODE_CONFIGS.bollinger_bands.period,
                    NODE_CONFIGS.bollinger_bands.std
                )
                upperSeries.setData(upper)
                middleSeries.setData(middle)
                lowerSeries.setData(lower)
                seriesArray.push(upperSeries, middleSeries, lowerSeries)
            } else if (key === INDICATOR_TYPES.ATR) {
                const series = chartRef.current!.addSeries(LineSeries, {
                    color: '#00BCD4',
                    lineWidth: 2,
                    title: 'ATR',
                    priceScaleId: 'atr'
                })
                const data = calculateATR(chartData, NODE_CONFIGS.atr.period)
                series.setData(data)
                seriesArray.push(series)
            } else if (key === INDICATOR_TYPES.STOCHASTIC) {
                // %K Line
                const kSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#3F51B5',
                    lineWidth: 2,
                    title: 'Stoch %K',
                    priceScaleId: 'stoch'
                })
                // %D Line
                const dSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#F44336',
                    lineWidth: 2,
                    title: 'Stoch %D',
                    priceScaleId: 'stoch'
                })

                const { kLine, dLine } = calculateStochastic(
                    chartData,
                    NODE_CONFIGS.stochastic.k_period,
                    NODE_CONFIGS.stochastic.d_period,
                    NODE_CONFIGS.stochastic.slowing
                )
                kSeries.setData(kLine)
                dSeries.setData(dLine)
                seriesArray.push(kSeries, dSeries)
            } else if (key === INDICATOR_TYPES.ADX) {
                // ADX Line
                const adxSeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#795548',
                    lineWidth: 2,
                    title: 'ADX',
                    priceScaleId: 'adx'
                })
                // +DI Line
                const plusDISeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#4CAF50',
                    lineWidth: 1,
                    title: '+DI',
                    priceScaleId: 'adx'
                })
                // -DI Line
                const minusDISeries = chartRef.current!.addSeries(LineSeries, {
                    color: '#F44336',
                    lineWidth: 1,
                    title: '-DI',
                    priceScaleId: 'adx'
                })

                const { adxData, plusDI, minusDI } = calculateADX(chartData, NODE_CONFIGS.adx.period)
                adxSeries.setData(adxData)
                plusDISeries.setData(plusDI)
                minusDISeries.setData(minusDI)
                seriesArray.push(adxSeries, plusDISeries, minusDISeries)
            }

            if (seriesArray.length > 0) {
                indicatorSeriesRef.current.set(key, seriesArray)
            }
        })
    }, [activeIndicators, chartData])
    
    // Draw trade markers on chart when backtest data is available
    useEffect(() => {
        if (!chartRef.current || !candlestickSeriesRef.current) return
        
        // Clear previous trade marker series
        tradeMarkerSeriesRef.current.forEach(series => {
            try {
                chartRef.current?.removeSeries(series)
            } catch (e) {
                // Series may already be removed
            }
        })
        tradeMarkerSeriesRef.current = []
        
        if (!backtestPlotData || backtestPlotData.trades.length === 0 || chartData.length === 0) return
        
        // Create a map of candle times for quick lookup
        const candleTimeSet = new Set(chartData.map(c => c.time))
        
        // For each trade, create visual markers
        backtestPlotData.trades.forEach((trade) => {
            // Find the closest candle times for entry and exit
            let entryTime = trade.entry_unix
            let exitTime = trade.exit_unix
            
            // If exact time not in data, find closest
            if (!candleTimeSet.has(entryTime)) {
                const closest = chartData.find(c => c.time >= entryTime)
                if (closest) entryTime = closest.time
            }
            if (!candleTimeSet.has(exitTime)) {
                const closest = chartData.find(c => c.time >= exitTime)
                if (closest) exitTime = closest.time
            }
            
            // Create entry marker (green triangle pointing up)
            const entryMarkerSeries = chartRef.current!.addSeries(LineSeries, {
                color: '#22c55e',
                lineWidth: 1,
                lineVisible: false,
                pointMarkersVisible: true,
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
            })
            entryMarkerSeries.setData([
                { time: entryTime as any, value: trade.entry_price }
            ])
            
            // Create exit marker (colored by P&L)
            const exitColor = trade.pnl >= 0 ? '#22c55e' : '#ef4444'
            const exitMarkerSeries = chartRef.current!.addSeries(LineSeries, {
                color: exitColor,
                lineWidth: 1,
                lineVisible: false,
                pointMarkersVisible: true,
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
            })
            exitMarkerSeries.setData([
                { time: exitTime as any, value: trade.exit_price }
            ])
            
            // Create a bold line connecting entry to exit
            const connectionSeries = chartRef.current!.addSeries(LineSeries, {
                color: trade.pnl >= 0 ? '#22c55e' : '#ef4444',
                lineWidth: 3,
                lineStyle: 0, // Solid line
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
            })
            connectionSeries.setData([
                { time: entryTime as any, value: trade.entry_price },
                { time: exitTime as any, value: trade.exit_price }
            ])
            
            tradeMarkerSeriesRef.current.push(entryMarkerSeries, exitMarkerSeries, connectionSeries)
        })
        
    }, [backtestPlotData, chartData])

    const toggleIndicator = (type: string) => {
        const newSet = new Set(activeIndicators)
        if (newSet.has(type)) {
            newSet.delete(type)
        } else {
            newSet.add(type)
        }
        setActiveIndicators(newSet)
    }

    // All indicators from INDICATOR_TYPES with colors for display
    const supportedIndicators = [
        { type: INDICATOR_TYPES.SMA, label: 'SMA', fullName: 'Simple Moving Average', color: '#2962FF' },
        { type: INDICATOR_TYPES.EMA, label: 'EMA', fullName: 'Exponential Moving Average', color: '#FF6D00' },
        { type: INDICATOR_TYPES.RSI, label: 'RSI', fullName: 'Relative Strength Index', color: '#E91E63' },
        { type: INDICATOR_TYPES.MACD, label: 'MACD', fullName: 'Moving Average Convergence Divergence', color: '#2196F3' },
        { type: INDICATOR_TYPES.BB, label: 'BB', fullName: 'Bollinger Bands', color: '#9C27B0' },
        { type: INDICATOR_TYPES.ATR, label: 'ATR', fullName: 'Average True Range', color: '#00BCD4' },
        { type: INDICATOR_TYPES.STOCHASTIC, label: 'STOCH', fullName: 'Stochastic Oscillator', color: '#3F51B5' },
        { type: INDICATOR_TYPES.ADX, label: 'ADX', fullName: 'Average Directional Index', color: '#795548' },
    ]

    const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)

    const handleTickerSelect = (ticker: string) => {
        setShowSearchResults(false)
        setTickerSearch('')
        setSearchResults([])
        fetchChartData(ticker, selectedPeriod, selectedInterval)
    }

    const handleTickerSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (tickerSearch.trim()) {
            handleTickerSelect(tickerSearch.trim().toUpperCase())
        }
    }

    // Get current available periods based on selected interval
    const availablePeriods = getAvailablePeriods(selectedInterval)

    return (
        <div className="relative h-full bg-dark-bg">
            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-20 bg-dark-bg/80 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-dark-text">Loading {currentTicker}...</span>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && !isLoading && (
                <div className="absolute inset-0 z-20 bg-dark-bg/80 flex items-center justify-center">
                    <div className="bg-dark-surface border border-red-500/50 rounded-xl p-6 max-w-md text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="text-white font-semibold mb-2">Unable to Load Data</h3>
                        <p className="text-red-400 mb-4 text-sm">{error}</p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => fetchChartData(currentTicker, selectedPeriod, selectedInterval)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                            >
                                Retry
                            </button>
                            <button
                                onClick={() => setError(null)}
                                className="px-4 py-2 bg-dark-bg hover:bg-dark-bg/80 text-dark-text border border-dark-border rounded-lg transition-colors text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart Container - Adjusts width when sidebar is visible */}
            <div 
                className={`absolute inset-0 transition-all duration-300 ${backtestPlotData && backtestPlotData.trades.length > 0 ? 'right-80' : ''}`} 
                ref={chartContainerRef}
            >
                {/* Chart renders here */}
            </div>

            {/* Right Sidebar - Only when backtest data exists */}
            {backtestPlotData && backtestPlotData.trades.length > 0 ? (
                <div className="absolute top-0 right-0 bottom-0 w-80 bg-dark-surface border-l border-dark-border z-10 flex flex-col">
                    {/* Sidebar Header with Ticker Info */}
                    <div className="p-4 border-b border-dark-border">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <span className="text-dark-text font-bold text-xl">{currentTicker}</span>
                                {stockInfo && (
                                    <p className="text-gray-500 text-sm truncate">{stockInfo.name}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setBacktestPlotData(null)}
                                className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                title="Close sidebar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Ticker Search in Sidebar */}
                        <div className="relative">
                            <form onSubmit={handleTickerSubmit}>
                                <input
                                    type="text"
                                    value={tickerSearch}
                                    onChange={(e) => {
                                        setTickerSearch(e.target.value)
                                        setShowSearchResults(true)
                                    }}
                                    onFocus={() => setShowSearchResults(true)}
                                    placeholder="Search ticker..."
                                    className="w-full bg-dark-bg text-dark-text placeholder-gray-500 px-3 py-2 pr-10 rounded-lg border border-dark-border focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
                                />
                                <button
                                    type="submit"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {isSearching ? (
                                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    )}
                                </button>
                            </form>

                            {/* Search Results Dropdown in Sidebar */}
                            {showSearchResults && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-dark-bg rounded-lg border border-dark-border shadow-xl overflow-hidden z-20">
                                    <div className="max-h-60 overflow-y-auto">
                                        {searchResults.map((result, idx) => (
                                            <button
                                                key={`${result.symbol}-${idx}`}
                                                onClick={() => handleTickerSelect(result.symbol)}
                                                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-surface transition-colors text-left border-b border-dark-border/50 last:border-b-0"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-medium text-sm">{result.symbol}</span>
                                                        <span className="text-xs text-gray-500 px-1 py-0.5 bg-dark-surface rounded">{result.type}</span>
                                                    </div>
                                                    <p className="text-gray-400 text-xs truncate">{result.name}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Backtest Info */}
                    <div className="px-4 py-3 border-b border-dark-border bg-blue-900/10">
                        <div className="flex items-center gap-2 mb-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <span className="text-blue-400 font-semibold text-sm">Backtest Results</span>
                        </div>
                        <p className="text-xs text-dark-muted">{backtestPlotData.trades.length} trades executed</p>
                        {backtestPlotData.strategyDescription && (
                            <p className="text-xs text-blue-400/70 font-mono mt-2 break-words">
                                {backtestPlotData.strategyDescription}
                            </p>
                        )}
                    </div>
                    
                    {/* Trade List */}
                    <div className="flex-1 overflow-y-auto">
                        {backtestPlotData.trades.map((trade, idx) => (
                            <div 
                                key={idx}
                                className={`p-3 border-b border-dark-border/50 hover:bg-dark-bg/50 transition-colors cursor-pointer ${selectedTrade === trade ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : ''}`}
                                onClick={() => navigateToTrade(trade)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-dark-text">Trade #{idx + 1}</span>
                                    <span className={`text-xs font-bold ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)} ({trade.return_pct.toFixed(2)}%)
                                    </span>
                                </div>
                                
                                {/* Entry */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="text-xs text-dark-muted">
                                        Buy {Math.abs(trade.size)} @ ${trade.entry_price.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-auto">{trade.entry_time}</span>
                                </div>
                                
                                {/* Exit */}
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${trade.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className="text-xs text-dark-muted">
                                        Sell @ ${trade.exit_price.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-auto">{trade.exit_time}</span>
                                </div>
                                
                                {/* Duration */}
                                <div className="mt-1 text-xs text-gray-500">
                                    Duration: {trade.duration}
                                </div>
                                
                                {/* Conditions */}
                                {trade.conditions && trade.conditions.length > 0 && (
                                    <div className="mt-2 p-2 bg-dark-bg/50 rounded text-xs">
                                        <span className="text-gray-400">Conditions: </span>
                                        <span className="text-blue-400 font-mono">{trade.conditions.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* Top Bar - Ticker Info & Search (Only when no backtest sidebar) */
                <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
                    {/* Current Ticker Display */}
                    <div className="bg-dark-surface/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-dark-border">
                        <div className="flex items-center gap-2">
                            <span className="text-dark-text font-semibold text-lg">{currentTicker}</span>
                            {stockInfo && (
                                <span className="text-gray-500 text-sm hidden sm:inline">{stockInfo.name}</span>
                            )}
                        </div>
                    </div>

                    {/* Ticker Search */}
                    <div className="relative">
                        <form onSubmit={handleTickerSubmit}>
                            <input
                                type="text"
                                value={tickerSearch}
                                onChange={(e) => {
                                    setTickerSearch(e.target.value)
                                    setShowSearchResults(true)
                                }}
                                onFocus={() => setShowSearchResults(true)}
                                placeholder="Search ticker..."
                                className="bg-dark-surface/90 backdrop-blur-sm text-dark-text placeholder-gray-500 px-4 py-2 pr-10 rounded-lg border border-dark-border focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-48 transition-all"
                            />
                            <button
                                type="submit"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                            >
                                {isSearching ? (
                                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                )}
                            </button>
                        </form>

                        {/* Search Results Dropdown */}
                        {showSearchResults && searchResults.length > 0 && (
                            <div className="absolute top-full right-0 mt-2 w-80 bg-dark-surface/95 backdrop-blur-sm rounded-xl border border-dark-border shadow-2xl overflow-hidden">
                                <div className="max-h-80 overflow-y-auto">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={`${result.symbol}-${idx}`}
                                            onClick={() => handleTickerSelect(result.symbol)}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-dark-bg/50 transition-colors text-left border-b border-dark-border last:border-b-0"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-medium">{result.symbol}</span>
                                                    <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-dark-bg rounded">{result.type}</span>
                                                </div>
                                                <p className="text-gray-400 text-sm truncate">{result.name}</p>
                                            </div>
                                            <span className="text-gray-500 text-xs">{result.exchange}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Click outside to close search */}
            {showSearchResults && (
                <div 
                    className="absolute inset-0 z-5" 
                    onClick={() => setShowSearchResults(false)}
                />
            )}

            {/* Indicators Toggle Button */}
            <button
                onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
                className={`absolute top-4 left-4 z-10 bg-dark-surface/90 backdrop-blur-sm px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    showIndicatorPanel ? 'border-blue-500 text-blue-400' : 'border-dark-border text-dark-text hover:border-gray-600'
                }`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="font-medium">Indicators</span>
                {activeIndicators.size > 0 && (
                    <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {activeIndicators.size}
                    </span>
                )}
            </button>

            {/* Floating Indicator Panel */}
            {showIndicatorPanel && (
                <div className="absolute top-16 left-4 z-10 bg-dark-surface/95 backdrop-blur-sm rounded-xl border border-dark-border shadow-2xl w-72 overflow-hidden">
                    <div className="p-3 border-b border-dark-border flex items-center justify-between">
                        <h3 className="text-dark-text font-semibold">Technical Indicators</h3>
                        <button
                            onClick={() => setShowIndicatorPanel(false)}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="p-2 max-h-80 overflow-y-auto">
                        {supportedIndicators.map((ind) => {
                            const isActive = activeIndicators.has(ind.type)
                            return (
                                <button
                                    key={ind.type}
                                    onClick={() => toggleIndicator(ind.type)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all ${
                                        isActive
                                            ? 'bg-dark-bg border border-dark-border'
                                            : 'hover:bg-dark-bg/50'
                                    }`}
                                >
                                    <div
                                        className={`w-3 h-3 rounded-full transition-all ${isActive ? 'scale-100' : 'scale-75 opacity-50'}`}
                                        style={{ backgroundColor: ind.color }}
                                    />
                                    <div className="flex-1 text-left">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-medium ${isActive ? 'text-white' : 'text-dark-text'}`}>
                                                {ind.label}
                                            </span>
                                            {isActive && (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-500">{ind.fullName}</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                    {activeIndicators.size > 0 && (
                        <div className="p-3 border-t border-dark-border">
                            <button
                                onClick={() => setActiveIndicators(new Set())}
                                className="w-full text-center text-sm text-red-400 hover:text-red-300 transition-colors"
                            >
                                Clear All Indicators
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Center - Interval & Period Selector */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
                {/* Interval Selector */}
                <div className="bg-dark-surface/90 backdrop-blur-sm rounded-lg border border-dark-border flex overflow-hidden">
                    {INTERVAL_OPTIONS.map((interval) => (
                        <button
                            key={interval.value}
                            onClick={() => handleIntervalChange(interval.value)}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                                selectedInterval === interval.value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-dark-text hover:bg-dark-bg'
                            }`}
                        >
                            {interval.label}
                        </button>
                    ))}
                </div>

                {/* Period Selector */}
                <div className="relative">
                    <button
                        onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                        className="bg-dark-surface/90 backdrop-blur-sm text-dark-text px-4 py-2 rounded-lg border border-dark-border focus:outline-none focus:border-blue-500 cursor-pointer hover:border-gray-600 transition-colors flex items-center gap-2"
                    >
                        {PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.label}
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </button>

                    {/* Period Dropdown - Opens Upward */}
                    {showPeriodDropdown && (
                        <div className="absolute bottom-full mb-2 left-0 bg-dark-surface/95 backdrop-blur-sm rounded-xl border border-dark-border shadow-2xl w-56 overflow-hidden">
                            <div className="p-2 max-h-80 overflow-y-auto">
                                {availablePeriods.map((period) => {
                                    const isActive = selectedPeriod === period.value
                                    return (
                                        <button
                                            key={period.value}
                                            onClick={() => {
                                                setSelectedPeriod(period.value)
                                                setShowPeriodDropdown(false)
                                            }}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all ${
                                                isActive
                                                    ? 'bg-dark-bg border border-dark-border'
                                                    : 'hover:bg-dark-bg/50'
                                            }`}
                                        >
                                            <div
                                                className={`w-3 h-3 rounded-full bg-blue-500 transition-all ${isActive ? 'scale-100' : 'scale-75 opacity-50'}`}
                                            />
                                            <div className="flex-1 text-left">
                                                <span className={`font-medium text-sm ${isActive ? 'text-white' : 'text-dark-text'}`}>
                                                    {period.label}
                                                </span>
                                            </div>
                                            {isActive && (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Click outside to close period dropdown */}
            {showPeriodDropdown && (
                <div 
                    className="absolute inset-0 z-5" 
                    onClick={() => setShowPeriodDropdown(false)}
                />
            )}

            {/* Active Indicators Pills - Bottom Left */}
            {activeIndicators.size > 0 && (
                <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 max-w-md">
                    {supportedIndicators
                        .filter((ind) => activeIndicators.has(ind.type))
                        .map((ind) => (
                            <div
                                key={ind.type}
                                className="bg-dark-surface/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-dark-border flex items-center gap-2 group"
                            >
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: ind.color }}
                                />
                                <span className="text-dark-text text-sm font-medium">{ind.label}</span>
                                <button
                                    onClick={() => toggleIndicator(ind.type)}
                                    className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                </div>
            )}
            
            {/* Selected Trade Info Panel - Bottom of chart */}
            {selectedTrade && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-lg p-4 shadow-xl">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-green-500" />
                            <div>
                                <div className="text-xs text-dark-muted">Entry</div>
                                <div className="text-sm text-dark-text font-semibold">${selectedTrade.entry_price.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">{selectedTrade.entry_time}</div>
                            </div>
                        </div>
                        <div className="text-dark-muted">→</div>
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${selectedTrade.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                            <div>
                                <div className="text-xs text-dark-muted">Exit</div>
                                <div className="text-sm text-dark-text font-semibold">${selectedTrade.exit_price.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">{selectedTrade.exit_time}</div>
                            </div>
                        </div>
                        <div className="border-l border-dark-border pl-4">
                            <div className="text-xs text-dark-muted">P&L</div>
                            <div className={`text-lg font-bold ${selectedTrade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {selectedTrade.pnl >= 0 ? '+' : ''}{selectedTrade.pnl.toFixed(2)}
                            </div>
                            <div className={`text-xs ${selectedTrade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {selectedTrade.return_pct >= 0 ? '+' : ''}{selectedTrade.return_pct.toFixed(2)}%
                            </div>
                        </div>
                        <div className="border-l border-dark-border pl-4">
                            <div className="text-xs text-dark-muted">Size</div>
                            <div className="text-sm text-dark-text">{Math.abs(selectedTrade.size)} shares</div>
                            <div className="text-xs text-gray-500">{selectedTrade.duration}</div>
                        </div>
                        <button 
                            onClick={() => setSelectedTrade(null)}
                            className="ml-2 text-gray-500 hover:text-red-400 transition-colors p-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
