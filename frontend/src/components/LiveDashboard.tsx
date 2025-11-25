import { useState, useEffect, useRef } from 'react'
import { useStrategyStore } from '../store/strategyStore'

interface Position {
  ticker: string
  shares: number
  avg_price: number
  current_price: number
  pnl: number
  pnl_pct: number
}

interface Signal {
  timestamp: string
  type: string
  price: number
  message: string
}

interface Order {
  id: number
  timestamp: string
  type: string
  shares: number
  price: number
  status: string
}

export default function LiveDashboard({
  strategyCode
}: {
  strategyCode: string
}) {
  const [isDeployed, setIsDeployed] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [ticker, setTicker] = useState('AAPL')
  const [interval, setInterval] = useState('1min')
  const [position, setPosition] = useState<Position | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const setActiveDeployment = useStrategyStore((state) => state.setActiveDeployment)

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const handleDeploy = async () => {
    if (!strategyCode) {
      alert('Please create a strategy first')
      return
    }

    try {
      const response = await fetch('http://localhost:8000/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_code: strategyCode,
          ticker,
          interval,
          mode: 'paper',
        }),
      })

      const result = await response.json()
      
      if (result.deployment_id) {
        setDeploymentId(result.deployment_id)
        setIsDeployed(true)
        setActiveDeployment(result)
        connectWebSocket(result.deployment_id)
        addLog(`✅ Deployed strategy for ${ticker}`)
      } else {
        alert('Deployment failed: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Failed to deploy: ' + error)
      addLog(`❌ Deployment failed: ${error}`)
    }
  }

  const handleStop = async () => {
    if (!deploymentId) return

    try {
      await fetch(`http://localhost:8000/deploy/${deploymentId}`, {
        method: 'DELETE',
      })

      setIsDeployed(false)
      setDeploymentId(null)
      setActiveDeployment(null)
      
      if (wsRef.current) {
        wsRef.current.close()
      }
      
      addLog(`⏹️ Stopped deployment`)
    } catch (error) {
      alert('Failed to stop deployment: ' + error)
      addLog(`❌ Stop failed: ${error}`)
    }
  }

  const connectWebSocket = (depId: string) => {
    const ws = new WebSocket(`ws://localhost:8000/ws/${depId}`)
    
    ws.onopen = () => {
      addLog('🔌 WebSocket connected')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'signal':
          addSignal({
            timestamp: new Date().toLocaleTimeString(),
            type: data.signal,
            price: data.price,
            message: `${data.signal} signal at $${data.price}`,
          })
          addLog(`📊 Signal: ${data.signal} at $${data.price}`)
          break

        case 'order':
          addOrder({
            id: data.order_id,
            timestamp: new Date().toLocaleTimeString(),
            type: data.order_type,
            shares: data.shares,
            price: data.price,
            status: data.status,
          })
          addLog(`📝 Order: ${data.order_type} ${data.shares} shares at $${data.price}`)
          break

        case 'position':
          setPosition({
            ticker: data.ticker,
            shares: data.shares,
            avg_price: data.avg_price,
            current_price: data.current_price,
            pnl: data.pnl,
            pnl_pct: data.pnl_pct,
          })
          break

        case 'error':
          addLog(`❌ Error: ${data.message}`)
          break

        default:
          addLog(`📨 ${JSON.stringify(data)}`)
      }
    }

    ws.onerror = (error) => {
      addLog(`❌ WebSocket error: ${error}`)
    }

    ws.onclose = () => {
      addLog('🔌 WebSocket disconnected')
    }

    wsRef.current = ws
  }

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 100))
  }

  const addSignal = (signal: Signal) => {
    setSignals((prev) => [signal, ...prev].slice(0, 50))
  }

  const addOrder = (order: Order) => {
    setOrders((prev) => [order, ...prev].slice(0, 50))
  }

  return (
    <div className="h-full overflow-auto bg-dark-bg p-6">
      <h2 className="text-2xl font-bold mb-6 text-dark-text">Live Paper Trading</h2>

      {/* Deployment Controls */}
      <div className="bg-dark-surface p-4 rounded-lg border border-dark-border mb-6">
        <h3 className="text-lg font-semibold mb-4 text-dark-text">Deployment</h3>
        
        {!isDeployed ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-dark-muted mb-1">Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text"
                  placeholder="AAPL"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-muted mb-1">Interval</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text"
                >
                  <option value="1min">1 Minute</option>
                  <option value="5min">5 Minutes</option>
                  <option value="15min">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={handleDeploy}
              disabled={!strategyCode}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              Deploy Strategy
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-dark-text font-semibold">{ticker} - {interval}</div>
                <div className="text-sm text-dark-muted">Deployment ID: {deploymentId}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-500 font-semibold">Live</span>
              </div>
            </div>
            
            <button
              onClick={handleStop}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Stop Deployment
            </button>
          </div>
        )}
      </div>

      {/* Position */}
      {position && (
        <div className="bg-dark-surface p-4 rounded-lg border border-dark-border mb-6">
          <h3 className="text-lg font-semibold mb-4 text-dark-text">Current Position</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-dark-muted">Shares</div>
              <div className="text-xl font-bold text-dark-text">{position.shares}</div>
            </div>
            <div>
              <div className="text-sm text-dark-muted">Avg Price</div>
              <div className="text-xl font-bold text-dark-text">${position.avg_price.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-dark-muted">Current Price</div>
              <div className="text-xl font-bold text-dark-text">${position.current_price.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-dark-muted">P&L</div>
              <div className={`text-xl font-bold ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${position.pnl.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-dark-muted">P&L %</div>
              <div className={`text-xl font-bold ${position.pnl_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {position.pnl_pct.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Signals Feed */}
        <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
          <h3 className="text-lg font-semibold mb-4 text-dark-text">Signals</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {signals.length === 0 ? (
              <div className="text-sm text-dark-muted text-center py-4">No signals yet</div>
            ) : (
              signals.map((signal, idx) => (
                <div key={idx} className="text-sm border-b border-dark-border pb-2">
                  <div className="flex justify-between items-center">
                    <span className={`font-semibold ${
                      signal.type === 'BUY' ? 'text-green-500' :
                      signal.type === 'SELL' ? 'text-red-500' :
                      'text-yellow-500'
                    }`}>
                      {signal.type}
                    </span>
                    <span className="text-dark-muted">{signal.timestamp}</span>
                  </div>
                  <div className="text-dark-text">${signal.price.toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Orders */}
        <div className="bg-dark-surface p-4 rounded-lg border border-dark-border">
          <h3 className="text-lg font-semibold mb-4 text-dark-text">Orders</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="text-sm text-dark-muted text-center py-4">No orders yet</div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="text-sm border-b border-dark-border pb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-dark-text">{order.type}</span>
                    <span className="text-dark-muted">{order.timestamp}</span>
                  </div>
                  <div className="text-dark-text">
                    {order.shares} shares @ ${order.price.toFixed(2)}
                  </div>
                  <div className="text-xs text-dark-muted">{order.status}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-dark-surface p-4 rounded-lg border border-dark-border mt-6">
        <h3 className="text-lg font-semibold mb-4 text-dark-text">Activity Log</h3>
        <div className="bg-dark-bg p-3 rounded max-h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-dark-muted text-center py-4">No activity yet</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="text-dark-text mb-1">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
