import { create } from 'zustand'
import { type Node, type Edge, addEdge, type Connection, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange } from '@xyflow/react'

interface StrategyState {
  nodes: Node[]
  edges: Edge[]
  strategyCode: string
  backtestResults: any
  activeDeployment: any
  
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
  resetFlow: () => void
}

// Example strategy: Trend Following with Momentum Confirmation
// Uses EMA crossover, RSI oversold, strong trend (ADX), with proper risk management
const exampleNodes: Node[] = [
  // Buy Logic - EMA Crossover
  {
    id: 'ema_fast',
    type: 'indicator',
    position: { x: 100, y: 100 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 12 },
      comparison: 'crosses_above',
      compareValue: '',
      lookback: 3  // Within last 3 bars
    }
  },
  {
    id: 'ema_slow',
    type: 'indicator',
    position: { x: 100, y: 300 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 26 },
      comparison: '>',
      compareValue: '0'
    }
  },
  // RSI Confirmation - oversold or neutral
  {
    id: 'rsi_buy',
    type: 'indicator',
    position: { x: 100, y: 500 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: '<',
      compareValue: '60',
      lookback: 5  // Within last 5 bars
    }
  },
  // Trend Strength Filter - ADX
  {
    id: 'adx_trend',
    type: 'indicator',
    position: { x: 100, y: 700 },
    data: {
      label: 'ADX',
      type: 'indicator',
      config: { period: 14 },
      comparison: '>',
      compareValue: '25'  // Strong trend required
    }
  },
  // AND gate for EMA crossover + strong trend
  {
    id: 'and_trend',
    type: 'logic',
    position: { x: 500, y: 200 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // AND gate for RSI + ADX
  {
    id: 'and_momentum',
    type: 'logic',
    position: { x: 500, y: 600 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Final AND gate combining all conditions
  {
    id: 'and_final',
    type: 'logic',
    position: { x: 900, y: 400 },
    data: {
      label: 'AND',
      type: 'logic'
    }
  },
  // Buy Action
  {
    id: 'buy_action',
    type: 'action',
    position: { x: 1300, y: 400 },
    data: {
      label: 'Buy',
      type: 'action',
      config: { orderType: 'percent', amount: '95' }  // 95% of portfolio
    }
  },
  // Sell Logic - RSI Overbought
  {
    id: 'rsi_sell',
    type: 'indicator',
    position: { x: 100, y: 1000 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: '>',
      compareValue: '75',
      lookback: 0
    }
  },
  // OR price crosses below slow EMA
  {
    id: 'price_exit',
    type: 'price',
    position: { x: 100, y: 1200 },
    data: {
      label: 'Close',
      type: 'price',
      comparison: 'crosses_below',
      compareValue: '',
      lookback: 0
    }
  },
  {
    id: 'ema_exit_ref',
    type: 'indicator',
    position: { x: 100, y: 1400 },
    data: {
      label: 'EMA',
      type: 'indicator',
      config: { period: 26 },
      comparison: '>',
      compareValue: '0'
    }
  },
  // OR logic for sell
  {
    id: 'or_sell',
    type: 'logic',
    position: { x: 600, y: 1100 },
    data: {
      label: 'OR',
      type: 'logic'
    }
  },
  // Sell Action
  {
    id: 'sell_action',
    type: 'action',
    position: { x: 1000, y: 1100 },
    data: {
      label: 'Sell',
      type: 'action',
      config: { orderType: 'all' }
    }
  },
  // Risk Management - Stop Loss (2% ATR-based)
  {
    id: 'stop_loss',
    type: 'exit',
    position: { x: 1300, y: 100 },
    data: {
      label: 'Stop Loss',
      type: 'exit',
      config: { type: 'atr', value: 2, period: 14 }
    }
  },
  // Trailing Stop (2x ATR)
  {
    id: 'trailing_stop',
    type: 'exit',
    position: { x: 1300, y: 700 },
    data: {
      label: 'Trailing Stop',
      type: 'exit',
      config: { type: 'atr', multiplier: 2, period: 14 }
    }
  }
]

const exampleEdges: Edge[] = [
  // EMA fast connects to slow for comparison
  { id: 'e1', source: 'ema_slow', target: 'ema_fast', targetHandle: 'compare-input' },
  // EMA crossover to AND gate
  { id: 'e2', source: 'ema_fast', target: 'and_trend', targetHandle: 'input-1' },
  // Slow EMA trend direction to AND gate
  { id: 'e3', source: 'ema_slow', target: 'and_trend', targetHandle: 'input-2' },
  // RSI to AND momentum
  { id: 'e4', source: 'rsi_buy', target: 'and_momentum', targetHandle: 'input-1' },
  // ADX to AND momentum
  { id: 'e5', source: 'adx_trend', target: 'and_momentum', targetHandle: 'input-2' },
  // Trend AND to final AND
  { id: 'e6', source: 'and_trend', target: 'and_final', targetHandle: 'input-1' },
  // Momentum AND to final AND
  { id: 'e7', source: 'and_momentum', target: 'and_final', targetHandle: 'input-2' },
  // Final AND to Buy
  { id: 'e8', source: 'and_final', target: 'buy_action' },
  
  // Sell logic
  { id: 'e9', source: 'rsi_sell', target: 'or_sell', targetHandle: 'input-1' },
  { id: 'e10', source: 'price_exit', target: 'or_sell', targetHandle: 'input-2' },
  { id: 'e11', source: 'ema_exit_ref', target: 'price_exit', targetHandle: 'compare-input' },
  { id: 'e12', source: 'or_sell', target: 'sell_action' }
]

export const useStrategyStore = create<StrategyState>((set, get) => ({
  nodes: exampleNodes,
  edges: exampleEdges,
  strategyCode: '',
  backtestResults: null,
  activeDeployment: null,

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
  
  resetFlow: () => set({
    nodes: [],
    edges: [],
    strategyCode: '',
    backtestResults: null,
  }),
}))
