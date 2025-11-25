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

export const useStrategyStore = create<StrategyState>((set, get) => ({
  nodes: [],
  edges: [],
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
