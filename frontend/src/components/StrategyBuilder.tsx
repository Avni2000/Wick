import { useCallback, useEffect, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Connection,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStrategyStore } from '../store/strategyStore'
import { LogicNode, IndicatorNode, PriceNode, ActionNode, ValueNode } from './nodes/CustomNodes'
import NodePalette from './NodePalette'
import { generateStrategyCode } from '../utils/codeGenerator'

const nodeTypes = {
  logic: LogicNode,
  indicator: IndicatorNode,
  price: PriceNode,
  action: ActionNode,
  value: ValueNode,
}

export default function StrategyBuilder({
  onCodeGenerated,
  onBacktestResults
}: {
  onCodeGenerated: (code: string) => void
  onBacktestResults: (results: any) => void
}) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setStrategyCode, addNode } = useStrategyStore()
  const [showCode, setShowCode] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // Connection validation - prevent invalid connections
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    
    if (!sourceNode || !targetNode) return false

    // Action nodes can only receive inputs (no outputs)
    if (sourceNode.type === 'action') return false
    
    // Logic nodes must connect to action nodes or other logic nodes
    if (sourceNode.type === 'logic' && targetNode.type !== 'action' && targetNode.type !== 'logic') {
      return false
    }
    
    // Indicators and prices output to logic/action nodes
    if ((sourceNode.type === 'indicator' || sourceNode.type === 'price') && 
        targetNode.type !== 'logic' && targetNode.type !== 'action') {
      return false
    }

    // Prevent duplicate connections to the same handle
    const existingConnection = edges.find(
      e => e.source === connection.source && 
           e.target === connection.target && 
           e.targetHandle === connection.targetHandle
    )
    
    return !existingConnection
  }, [nodes, edges])

  const handleConnect = useCallback((connection: Connection) => {
    if (isValidConnection(connection)) {
      onConnect(connection)
    }
  }, [isValidConnection, onConnect])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()

    const data = event.dataTransfer.getData('application/reactflow')
    if (!data) return

    const nodeData = JSON.parse(data)
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    const newNode = {
      id: `${nodeData.type}_${Date.now()}`,
      type: nodeData.nodeType,
      position,
      data: { 
        label: nodeData.label, 
        type: nodeData.nodeType, 
        config: nodeData.config 
      },
    }

    addNode(newNode)
  }, [screenToFlowPosition, addNode])

  const handleGenerateCode = useCallback(() => {
    const code = generateStrategyCode(nodes, edges)
    setGeneratedCode(code)
    setStrategyCode(code)
    onCodeGenerated(code)
    setShowCode(true)
  }, [nodes, edges, onCodeGenerated, setStrategyCode])

  // Auto-generate code when nodes/edges change
  useEffect(() => {
    if (nodes.length > 0) {
      const code = generateStrategyCode(nodes, edges)
      setGeneratedCode(code)
      setStrategyCode(code)
      onCodeGenerated(code)
    }
  }, [nodes, edges, onCodeGenerated, setStrategyCode])

  const handleRunBacktest = async () => {
    if (!generatedCode) {
      alert('Please create a strategy first')
      return
    }

    const ticker = prompt('Enter ticker symbol:', 'AAPL')
    if (!ticker) return

    const startDate = prompt('Enter start date (YYYY-MM-DD):', '2023-01-01')
    if (!startDate) return

    const endDate = prompt('Enter end date (YYYY-MM-DD):', '2024-01-01')
    if (!endDate) return

    try {
      const response = await fetch('http://localhost:8000/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_code: generatedCode,
          ticker,
          start_date: startDate,
          end_date: endDate,
          cash: 10000,
          commission: 0.002,
        }),
      })

      const results = await response.json()

      if (results.error) {
        alert('Backtest error: ' + results.error)
      } else {
        onBacktestResults(results)
        alert('Backtest complete! Check Backtest Results tab.')
      }
    } catch (error) {
      alert('Failed to run backtest: ' + error)
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <NodePalette />

      <div ref={reactFlowWrapper} className="flex-1 relative min-h-0 bg-dark-bg">
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            className="h-full w-full"
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap className="bg-dark-surface" nodeColor="#374151" />

            <Panel position="top-right" className="space-x-2">
              <button
                onClick={handleGenerateCode}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-lg transition-colors"
              >
                Generate Code
              </button>
              <button
                onClick={handleRunBacktest}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow-lg transition-colors"
                disabled={!generatedCode}
              >
                Run Backtest
              </button>
              <button
                onClick={() => setShowCode(!showCode)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded shadow-lg transition-colors"
              >
                {showCode ? 'Hide' : 'Show'} Code
              </button>
            </Panel>
          </ReactFlow>

          {showCode && generatedCode && (
            <div className="absolute bottom-4 left-4 right-4 bg-dark-surface border border-dark-border rounded-lg p-4 max-h-96 overflow-auto">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-dark-text">Generated Strategy Code</h3>
                <button
                  onClick={() => setShowCode(false)}
                  className="text-dark-muted hover:text-dark-text"
                >
                  ✕
                </button>
              </div>
              <pre className="text-xs text-dark-text bg-dark-bg p-3 rounded overflow-x-auto">
                <code>{generatedCode}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
