import { useEffect, useRef } from 'react'
import { createChart, type IChartApi, LineSeries } from 'lightweight-charts'
import { useStrategyStore, type BacktestPlotData } from '../store/strategyStore'

export default function BacktestResults({
  results,
  strategyCode,
  ticker,
  onPlotOnChart
}: {
  results: any
  strategyCode: string
  ticker?: string
  onPlotOnChart?: () => void
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const setBacktestPlotData = useStrategyStore(state => state.setBacktestPlotData)
  const nodes = useStrategyStore(state => state.nodes)

  useEffect(() => {
    if (!chartContainerRef.current || !results) return

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2b2b2b' },
        horzLines: { color: '#2b2b2b' },
      },
      timeScale: {
        borderColor: '#4b5563',
      },
      rightPriceScale: {
        borderColor: '#4b5563',
      },
    })

    chartRef.current = chart

    // Add line series for equity curve
    const lineSeries = chart.addSeries(LineSeries, {
      lineWidth: 2,
      color: '#3b82f6',
    })

    // Set equity curve data (already in correct format from backend)
    if (results.equity_curve && Array.isArray(results.equity_curve)) {
      lineSeries.setData(results.equity_curve)
    }

    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [results])

  if (!results) {
    return (
      <div className="h-full flex items-center justify-center text-dark-muted">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Backtest Results</h2>
          <p>No backtest results yet. Run a backtest from the Strategy Builder.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-dark-bg">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6 text-dark-text">Backtest Results</h2>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Return</div>
            <div className={`text-2xl font-bold ${results.return_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {results.return_pct?.toFixed(2)}%
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Sharpe Ratio</div>
            <div className="text-2xl font-bold text-dark-text">
              {results.sharpe_ratio?.toFixed(2) || 'N/A'}
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Max Drawdown</div>
            <div className="text-2xl font-bold text-red-500">
              {results.max_drawdown?.toFixed(2)}%
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Win Rate</div>
            <div className="text-2xl font-bold text-dark-text">
              {results.win_rate?.toFixed(2)}%
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Total Trades</div>
            <div className="text-2xl font-bold text-dark-text">
              {results.num_trades || 0}
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Starting Cash</div>
            <div className="text-2xl font-bold text-dark-text">
              ${results.start_value?.toLocaleString()}
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Final Value</div>
            <div className="text-2xl font-bold text-dark-text">
              ${results.end_value?.toLocaleString()}
            </div>
          </div>

          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">Profit/Loss</div>
            <div className={`text-2xl font-bold ${(results.end_value - results.start_value) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${(results.end_value - results.start_value)?.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Equity Curve Chart */}
        <div className="bg-dark-surface p-4 rounded-lg border border-dark-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-dark-text">Equity Curve</h3>
            {results.trades && results.trades.length > 0 && (
              <button
                onClick={() => {
                  // Build strategy description from nodes
                  const strategyDescription = nodes
                    .filter(n => n.type === 'indicator' || n.type === 'price')
                    .map(n => {
                      const config = n.data.config
                      const label = n.data.label as string
                      const comparison = n.data.comparison || ''
                      const compareValue = n.data.compareValue || ''
                      if (config) {
                        const params = Object.entries(config).map(([k, v]) => `${k}=${v}`).join(', ')
                        return `${label}(${params}) ${comparison} ${compareValue}`.trim()
                      }
                      return `${label} ${comparison} ${compareValue}`.trim()
                    })
                    .join(' AND ')
                  
                  const plotData: BacktestPlotData = {
                    ticker: ticker || 'AAPL',
                    trades: results.trades.map((trade: any) => ({
                      ...trade,
                      conditions: [strategyDescription]
                    })),
                    strategyDescription,
                    interval: results.interval || '1d'
                  }
                  setBacktestPlotData(plotData)
                  onPlotOnChart?.()
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Plot on Chart
              </button>
            )}
          </div>
          <div ref={chartContainerRef} />
        </div>

        {/* Trade List */}
        {results.trades && results.trades.length > 0 && (
          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border mb-6">
            <h3 className="text-lg font-semibold mb-4 text-dark-text">Trade History ({results.trades.length} trades)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-dark-muted border-b border-dark-border">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Entry</th>
                    <th className="text-left py-2 px-2">Exit</th>
                    <th className="text-right py-2 px-2">Entry $</th>
                    <th className="text-right py-2 px-2">Exit $</th>
                    <th className="text-right py-2 px-2">Shares</th>
                    <th className="text-right py-2 px-2">P&L</th>
                    <th className="text-right py-2 px-2">Return</th>
                    <th className="text-left py-2 px-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {results.trades.map((trade: any, idx: number) => (
                    <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-border/20">
                      <td className="py-2 px-2 text-dark-muted">{idx + 1}</td>
                      <td className="py-2 px-2 text-dark-text">{trade.entry_time}</td>
                      <td className="py-2 px-2 text-dark-text">{trade.exit_time}</td>
                      <td className="py-2 px-2 text-right text-dark-text">${trade.entry_price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-dark-text">${trade.exit_price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-dark-text">{Math.abs(trade.size)}</td>
                      <td className={`py-2 px-2 text-right font-medium ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${trade.pnl.toFixed(2)}
                      </td>
                      <td className={`py-2 px-2 text-right font-medium ${trade.return_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.return_pct.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2 text-dark-muted">{trade.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Strategy Code */}
        {strategyCode && (
          <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
            <h3 className="text-lg font-semibold mb-4 text-dark-text">Strategy Code</h3>
            <pre className="text-xs text-dark-text bg-dark-bg p-4 rounded overflow-x-auto">
              <code>{strategyCode}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
