import { useEffect, useRef } from 'react'
import { createChart, type IChartApi, LineSeries } from 'lightweight-charts'

export default function BacktestResults({
  results,
  strategyCode
}: {
  results: any
  strategyCode: string
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

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

    // Convert equity curve data
    if (results.equity_curve && Array.isArray(results.equity_curve)) {
      const data = results.equity_curve.map((point: any) => ({
        time: point.date,
        value: point.equity,
      }))
      lineSeries.setData(data)
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
          <h3 className="text-lg font-semibold mb-4 text-dark-text">Equity Curve</h3>
          <div ref={chartContainerRef} />
        </div>

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
