import { create } from 'zustand'
import { type Node, type Edge, addEdge, type Connection, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange } from '@xyflow/react'

// Trade marker interface for chart plotting
export interface TradeMarker {
  entry_time: string
  entry_unix: number
  exit_time: string
  exit_unix: number
  entry_price: number
  exit_price: number
  size: number
  pnl: number
  return_pct: number
  entry_bar: number
  exit_bar: number
  duration: string
  conditions?: string[] // Strategy conditions that triggered this trade
}

export interface BacktestPlotData {
  ticker: string
  trades: TradeMarker[]
  strategyDescription: string
  interval: string
}

interface StrategyState {
  nodes: Node[]
  edges: Edge[]
  strategyCode: string
  backtestResults: any
  activeDeployment: any
  backtestPlotData: BacktestPlotData | null  // For plotting on chart
  
  // Actions
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: Node) => void
  setStrategyCode: (code: string) => void
  setBacktestResults: (results: any) => void
  setActiveDeployment: (deployment: any) => void
  setBacktestPlotData: (data: BacktestPlotData | null) => void
  resetFlow: () => void
}

// Trend-Pullback Strategy: Enter on pullback resumption in confirmed uptrend
// Safer than crossover strategies - only trades WITH established trend
const exampleNodes: Node[] = [
  // ========== TREND FILTER (must be in uptrend) ==========
  // EMA 12 > EMA 26
  {
    id: 'ema_fast',
    type: 'indicator',
    position: { x: 50, y: 50 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 12 },
      comparison: '>',
      compareValue: '',
      lookback: 0
    }
  },
  {
    id: 'ema_slow',
    type: 'indicator',
    position: { x: 50, y: 250 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 26 },
      comparison: '>',
      compareValue: '0'
    }
  },
  // Close > EMA 26 (price above trend)
  {
    id: 'price_above_ema',
    type: 'price',
    position: { x: 50, y: 500 },
    data: {
      label: 'Close',
      type: 'price',
      comparison: '>',
      compareValue: '',
      lookback: 0
    }
  },
  {
    id: 'ema_slow_ref',
    type: 'indicator',
    position: { x: 50, y: 700 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 26 },
      comparison: '>',
      compareValue: '0'
    }
  },
  
  // ========== PULLBACK RESUMPTION SIGNAL ==========
  // RSI crosses above 50 (momentum resuming after pullback)
  {
    id: 'rsi_resume',
    type: 'indicator',
    position: { x: 50, y: 1000 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: 'crosses_above',
      compareValue: '50',
      lookback: 2
    }
  },
  // ADX > 18 (trend still present)
  {
    id: 'adx_trend',
    type: 'indicator',
    position: { x: 50, y: 1200 },
    data: {
      label: 'ADX',
      type: 'indicator',
      config: { period: 14 },
      comparison: '>',
      compareValue: '18'
    }
  },
  
  // ========== LOGIC GATES ==========
  // Trend filter: EMA12 > EMA26
  {
    id: 'and_ema_trend',
    type: 'logic',
    position: { x: 550, y: 150 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Price above trend: Close > EMA26
  {
    id: 'and_price_trend',
    type: 'logic',
    position: { x: 550, y: 600 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Pullback resume: RSI cross + ADX
  {
    id: 'and_pullback',
    type: 'logic',
    position: { x: 550, y: 1100 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Combine trend filters
  {
    id: 'and_trend_combined',
    type: 'logic',
    position: { x: 1050, y: 375 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Final entry signal: trend + pullback
  {
    id: 'and_entry',
    type: 'logic',
    position: { x: 1550, y: 650 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  
  // ========== ENTRY ACTION ==========
  {
    id: 'buy_action',
    type: 'action',
    position: { x: 2050, y: 650 },
    data: {
      label: 'Buy',
      type: 'action',
      config: { orderType: 'percent', amount: '80' }
    }
  },
  
  // ========== EXIT SIGNALS ==========
  // RSI crosses below 70 (momentum cooling)
  {
    id: 'rsi_exit',
    type: 'indicator',
    position: { x: 50, y: 1600 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: 'crosses_below',
      compareValue: '70',
      lookback: 1
    }
  },
  // EMA 12 crosses below EMA 26 (trend reversal)
  {
    id: 'ema_cross_exit',
    type: 'indicator',
    position: { x: 50, y: 1850 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 12 },
      comparison: 'crosses_below',
      compareValue: '',
      lookback: 1
    }
  },
  {
    id: 'ema_slow_exit',
    type: 'indicator',
    position: { x: 50, y: 2050 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 26 },
      comparison: '>',
      compareValue: '0'
    }
  },
  // OR gate for exits
  {
    id: 'or_exit',
    type: 'logic',
    position: { x: 550, y: 1850 },
    data: {
      label: 'OR',
      type: 'logic'
    }
  },
  // Sell Action
  {
    id: 'sell_action',
    type: 'action',
    position: { x: 1050, y: 1850 },
    data: {
      label: 'Sell',
      type: 'action',
      config: { orderType: 'all' }
    }
  },
  
  // ========== RISK MANAGEMENT ==========
  // Initial Stop Loss: 1.5x ATR
  {
    id: 'stop_loss',
    type: 'exit',
    position: { x: 2050, y: 300 },
    data: {
      label: 'Stop Loss',
      type: 'exit',
      config: { type: 'atr', value: 1.5, period: 14 }
    }
  },
  // Trailing Stop: 2.5x ATR (starts after 1x ATR profit - handled in code)
  {
    id: 'trailing_stop',
    type: 'exit',
    position: { x: 2050, y: 1000 },
    data: {
      label: 'Trailing Stop',
      type: 'exit',
      config: { type: 'atr', multiplier: 2.5, period: 14 }
    }
  }
]

const exampleEdges: Edge[] = [
  // ========== TREND FILTER CONNECTIONS ==========
  // EMA comparison: EMA12 > EMA26
  { id: 'e1', source: 'ema_slow', target: 'ema_fast', targetHandle: 'compare-input' },
  { id: 'e2', source: 'ema_fast', target: 'and_ema_trend', targetHandle: 'input-1' },
  { id: 'e3', source: 'ema_slow', target: 'and_ema_trend', targetHandle: 'input-2' },
  
  // Price above EMA: Close > EMA26
  { id: 'e4', source: 'ema_slow_ref', target: 'price_above_ema', targetHandle: 'compare-input' },
  { id: 'e5', source: 'price_above_ema', target: 'and_price_trend',  targetHandle: 'input-1' },
  { id: 'e6', source: 'ema_slow_ref', target: 'and_price_trend', targetHandle: 'input-2' },
  
  // Combine EMA trend + price trend
  { id: 'e7', source: 'and_ema_trend', target: 'and_trend_combined', targetHandle: 'input-1' },
  { id: 'e8', source: 'and_price_trend', target: 'and_trend_combined', targetHandle: 'input-2' },
  
  // ========== PULLBACK RESUMPTION ==========
  // RSI + ADX
  { id: 'e9', source: 'rsi_resume', target: 'and_pullback', targetHandle: 'input-1' },
  { id: 'e10', source: 'adx_trend', target: 'and_pullback', targetHandle: 'input-2' },
  
  // ========== FINAL ENTRY SIGNAL ==========
  { id: 'e11', source: 'and_trend_combined', target: 'and_entry', targetHandle: 'input-1' },
  { id: 'e12', source: 'and_pullback', target: 'and_entry', targetHandle: 'input-2' },
  { id: 'e13', source: 'and_entry', target: 'buy_action' },
  
  // ========== EXIT SIGNALS ==========
  // RSI crosses below 70
  { id: 'e14', source: 'rsi_exit', target: 'or_exit', targetHandle: 'input-1' },
  // EMA death cross
  { id: 'e15', source: 'ema_slow_exit', target: 'ema_cross_exit', targetHandle: 'compare-input' },
  { id: 'e16', source: 'ema_cross_exit', target: 'or_exit', targetHandle: 'input-2' },
  { id: 'e17', source: 'or_exit', target: 'sell_action' }
]

export const useStrategyStore = create<StrategyState>((set, get) => ({
  nodes: exampleNodes,
  edges: exampleEdges,
  strategyCode: '',
  backtestResults: null,
  activeDeployment: null,
  backtestPlotData: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    })
  },
  
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    })
  },
  
  onConnect: (connection) => {
    set({
      edges: addEdge(connection, get().edges),
    })
  },
  
  addNode: (node) => {
    set({
      nodes: [...get().nodes, node],
    })
  },
  
  setStrategyCode: (code) => set({ strategyCode: code }),
  setBacktestResults: (results) => set({ backtestResults: results }),
  setActiveDeployment: (deployment) => set({ activeDeployment: deployment }),
  setBacktestPlotData: (data) => set({ backtestPlotData: data }),
  
  resetFlow: () => set({
    nodes: [],
    edges: [],
    strategyCode: '',
    backtestResults: null,
    backtestPlotData: null,
  }),
}))
