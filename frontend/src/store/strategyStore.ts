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

// Example strategy nodes and edges
const exampleNodes: Node[] = [
  {
    id: 'rsi_1',
    type: 'indicator',
    position: { x: 100, y: 100 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: '<',
      compareValue: '30'
    }
  },
  {
    id: 'rsi_2',
    type: 'indicator',
    position: { x: 100, y: 250 },
    data: {
      label: 'RSI',
      type: 'indicator',
      config: { period: 14 },
      comparison: '>',
      compareValue: '70'
    }
  },
  {
    id: 'buy_1',
    type: 'action',
    position: { x: 400, y: 100 },
    data: {
      label: 'Buy',
      type: 'action',
      config: { orderType: 'all' }
    }
  },
  {
    id: 'sell_1',
    type: 'action',
    position: { x: 400, y: 250 },
    data: {
      label: 'Sell',
      type: 'action',
      config: { orderType: 'all' }
    }
  }
]

const exampleEdges: Edge[] = [
  { id: 'e1', source: 'rsi_1', target: 'buy_1' },
  { id: 'e2', source: 'rsi_2', target: 'sell_1' }
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
