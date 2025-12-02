import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import StrategyBuilder from './components/StrategyBuilder'
import BacktestResults from './components/BacktestResults'
import LiveDashboard from './components/LiveDashboard'
import WickChart from './components/WickChart'
import StrategyFiles from './components/StrategyFiles'
import { API } from './utils/api'

export default function App() {
  const [activeTab, setActiveTab] = useState<'builder' | 'files' | 'backtest' | 'live' | 'chart'>('builder')
  const [strategyCode, setStrategyCode] = useState('')
  const [backtestResults, setBacktestResults] = useState(null)
  const [backtestTicker, setBacktestTicker] = useState('AAPL')

  const handleRunFileBacktest = async (filename: string, ticker: string) => {
    try {
      // 1. Run backtest
      const res = await fetch(API.backtestStrategy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          ticker,
          start_date: '2020-01-01',
          end_date: new Date().toISOString().split('T')[0],
          cash: 100000,
          commission: 0.002
        })
      })
      const data = await res.json()

      if (data.success) {
        setBacktestResults(data.results)
        setBacktestTicker(ticker)

        // 2. Load content for display
        const contentRes = await fetch(API.strategy(filename))
        const contentData = await contentRes.json()
        if (contentData.success) {
          setStrategyCode(contentData.content)
        }

        setActiveTab('backtest')
      } else {
        alert(`Backtest failed: ${data.error}`)
      }
    } catch (e) {
      alert('Failed to run backtest')
    }
  }

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text">
      {/* Sidebar */}
      <div className="w-16 bg-dark-surface border-r border-dark-border flex flex-col items-center py-4 gap-4">
        <button
          onClick={() => setActiveTab('builder')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'builder' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Strategy Builder"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'files' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Strategy Files"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('backtest')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'backtest' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Backtest Results"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'live' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Live Trading"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('chart')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'chart' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Chart"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 h-full overflow-hidden">
        {activeTab === 'builder' && (
          <ReactFlowProvider>
            <StrategyBuilder
              onCodeGenerated={setStrategyCode}
              onBacktestResults={(results) => {
                setBacktestResults(results)
              }}
              onBacktestTicker={setBacktestTicker}
              onSwitchTab={setActiveTab}
            />
          </ReactFlowProvider>
        )}
        {activeTab === 'files' && (
          <StrategyFiles onRunBacktest={handleRunFileBacktest} />
        )}
        {activeTab === 'backtest' && (
          <BacktestResults
            results={backtestResults}
            strategyCode={strategyCode}
            ticker={backtestTicker}
            onPlotOnChart={() => setActiveTab('chart')}
          />
        )}
        {activeTab === 'live' && (
          <LiveDashboard strategyCode={strategyCode} />
        )}
        {activeTab === 'chart' && (
          <WickChart />
        )}
      </div>
    </div>
  )
}
