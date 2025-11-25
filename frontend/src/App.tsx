import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import StrategyBuilder from './components/StrategyBuilder'
import BacktestResults from './components/BacktestResults'
import LiveDashboard from './components/LiveDashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState<'builder' | 'backtest' | 'live'>('builder')
  const [strategyCode, setStrategyCode] = useState('')
  const [backtestResults, setBacktestResults] = useState(null)

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
          onClick={() => setActiveTab('backtest')}
          className={`w-10 h-10 rounded flex items-center justify-center ${activeTab === 'backtest' ? 'bg-dark-border' : 'hover:bg-dark-border/50'
            }`}
          title="Backtest Results"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
      </div>

      {/* Main Content */}
      <div className="flex-1 h-full overflow-hidden">
        {activeTab === 'builder' && (
          <ReactFlowProvider>
            <StrategyBuilder
              onCodeGenerated={setStrategyCode}
              onBacktestResults={setBacktestResults}
              onSwitchTab={setActiveTab}
            />
          </ReactFlowProvider>
        )}
        {activeTab === 'backtest' && (
          <BacktestResults results={backtestResults} strategyCode={strategyCode} />
        )}
        {activeTab === 'live' && (
          <LiveDashboard strategyCode={strategyCode} />
        )}
      </div>
    </div>
  )
}
