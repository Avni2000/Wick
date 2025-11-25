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
import dagre from 'dagre'
import { useStrategyStore } from '../store/strategyStore'
import { LogicNode, IndicatorNode, PriceNode, ActionNode, ExitNode } from './nodes/CustomNodes'
import NodePalette from './NodePalette'
import { generateStrategyCode } from '../utils/codeGenerator'
import { InfoPanelProvider } from '../contexts/InfoPanelContext'

const nodeTypes = {
  logic: LogicNode,
  indicator: IndicatorNode,
  price: PriceNode,
  action: ActionNode,
  exit: ExitNode,
}

export default function StrategyBuilder({
  onCodeGenerated,
  onBacktestResults,
  onSwitchTab
}: {
  onCodeGenerated: (code: string) => void
  onBacktestResults: (results: any) => void
  onSwitchTab?: (tab: 'builder' | 'backtest' | 'live') => void
}) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setStrategyCode, addNode, setNodes } = useStrategyStore()
  const [showCode, setShowCode] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const [showBacktestModal, setShowBacktestModal] = useState(false)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [infoPanelContent, setInfoPanelContent] = useState({ title: '', description: '' })
  const [backtestConfig, setBacktestConfig] = useState({
    ticker: 'AAPL',
    startDate: '2020-01-01',
    endDate: new Date().toISOString().split('T')[0],
    cash: 1000000,
    commission: 0.002
  })
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const hideInfoTimeout = useRef<number | null>(null)

  const handleShowInfo = (title: string, description: string) => {
    if (hideInfoTimeout.current) {
      clearTimeout(hideInfoTimeout.current)
      hideInfoTimeout.current = null
    }
    setInfoPanelContent({ title, description })
    setShowInfoPanel(true)
  }

  const handleHideInfo = () => {
    hideInfoTimeout.current = window.setTimeout(() => {
      setShowInfoPanel(false)
    }, 200) // 200ms delay to allow moving mouse to panel
  }

  // Auto-layout function using dagre
  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return

    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    
    // Configure graph layout: left-to-right flow with better spacing
    dagreGraph.setGraph({ 
      rankdir: 'LR',  // Left to Right
      nodesep: 100,   // Vertical spacing between nodes in same column
      ranksep: 250,   // Horizontal spacing between columns
      marginx: 100,
      marginy: 100,
      ranker: 'longest-path', // Better balancing for tree structures
    })

    // Get actual node dimensions based on node type
    const getNodeDimensions = (node: any) => {
      // Logic nodes are smaller
      if (node.type === 'logic') {
        return { width: 120, height: 60 }
      }
      // Action nodes are medium
      if (node.type === 'action') {
        return { width: 200, height: 120 }
      }
      // Exit nodes
      if (node.type === 'exit') {
        return { width: 200, height: 140 }
      }
      // Indicator and Price nodes are tallest (with all the controls)
      return { width: 240, height: 220 }
    }

    // Calculate node depths to ensure balanced tree layout
    const getNodeDepth = (nodeId: string, visited = new Set<string>()): number => {
      if (visited.has(nodeId)) return 0
      visited.add(nodeId)
      
      const outgoingEdges = edges.filter(e => e.source === nodeId)
      if (outgoingEdges.length === 0) return 0
      
      return 1 + Math.max(...outgoingEdges.map(e => getNodeDepth(e.target, visited)))
    }

    // Group nodes that should be at the same rank (feeding into same targets)
    const targetGroups = new Map<string, Set<string>>()
    edges.forEach(edge => {
      if (!targetGroups.has(edge.target)) {
        targetGroups.set(edge.target, new Set())
      }
      targetGroups.get(edge.target)!.add(edge.source)
    })

    // Add nodes to dagre graph with their actual dimensions
    nodes.forEach((node) => {
      const { width, height } = getNodeDimensions(node)
      const depth = getNodeDepth(node.id)
      dagreGraph.setNode(node.id, { width, height, rank: -depth }) // Negative depth for left-to-right
    })

    // Add edges to dagre graph
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target)
    })

    // Calculate layout
    dagre.layout(dagreGraph)

    // Apply new positions to nodes
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id)
      const { width, height } = getNodeDimensions(node)
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        },
      }
    })

    setNodes(layoutedNodes)
    
    // Fit view after layout with padding
    setTimeout(() => {
      fitView({ padding: 0.15, duration: 400 })
    }, 10)
  }, [nodes, edges, setNodes, fitView])

  // Connection validation - prevent invalid connections
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)

    if (!sourceNode || !targetNode) return false

    // Action nodes can only receive inputs (no outputs)
    if (sourceNode.type === 'action') return false

    // Action nodes can only have ONE input connection
    if (targetNode.type === 'action') {
      const existingInputs = edges.filter(e => e.target === connection.target)
      if (existingInputs.length > 0) {
        return false // Already has an input, reject new connection
      }
    }

    // Logic nodes must connect to action nodes or other logic nodes
    if (sourceNode.type === 'logic' && targetNode.type !== 'action' && targetNode.type !== 'logic') {
      return false
    }

    // Indicators and prices can output to:
    // - Logic nodes
    // - Action nodes
    // - Other indicators/prices (for comparison)
    if ((sourceNode.type === 'indicator' || sourceNode.type === 'price') &&
      targetNode.type !== 'logic' &&
      targetNode.type !== 'action' &&
      targetNode.type !== 'indicator' &&
      targetNode.type !== 'price') {
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

    try {
      const response = await fetch('http://localhost:8000/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_code: generatedCode,
          ticker: backtestConfig.ticker,
          start_date: backtestConfig.startDate,
          end_date: backtestConfig.endDate,
          cash: backtestConfig.cash,
          commission: backtestConfig.commission,
        }),
      })

      const data = await response.json()

      // Backend returns {success: boolean, results: {...}} or {success: boolean, error: string}
      if (!data.success || data.error) {
        alert('Backtest error: ' + (data.error || 'Unknown error'))
      } else {
        // Extract the actual results from the wrapper
        onBacktestResults(data.results)
        setShowBacktestModal(false)
        onSwitchTab?.('backtest')
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
          <InfoPanelProvider value={{
            showInfo: handleShowInfo,
            hideInfo: handleHideInfo
          }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
              minZoom={0.1}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              translateExtent={[[-5000, -5000], [5000, 5000]]}
              nodeExtent={[[-5000, -5000], [5000, 5000]]}
              deleteKeyCode={['Backspace', 'Delete']}
              edgesReconnectable={true}
              reconnectRadius={20}
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#6b7280', strokeWidth: 2 },
              }}
              className="h-full w-full"
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap className="bg-dark-surface" nodeColor="#374151" />

              <Panel position="top-right" className="space-x-2">
                <button
                  onClick={handleAutoLayout}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded shadow-lg transition-colors"
                  title="Automatically arrange nodes in a left-to-right flow"
                >
                  Auto Layout
                </button>
                <button
                  onClick={handleGenerateCode}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-lg transition-colors"
                >
                  Generate Code
                </button>
                <button
                  onClick={() => setShowBacktestModal(true)}
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

              {/* Info Panel */}
              {showInfoPanel && (
                <div className="absolute top-16 right-4 z-50">
                  <div
                    className="bg-dark-surface border border-dark-border rounded-lg p-4 w-80 shadow-xl"
                    onMouseEnter={() => {
                      if (hideInfoTimeout.current) {
                        clearTimeout(hideInfoTimeout.current)
                        hideInfoTimeout.current = null
                      }
                    }}
                    onMouseLeave={handleHideInfo}
                  >
                    <h3 className="text-sm font-semibold text-dark-text mb-2">{infoPanelContent.title}</h3>
                    <div 
                      className="text-xs text-dark-muted leading-relaxed whitespace-pre-line"
                      dangerouslySetInnerHTML={{ __html: infoPanelContent.description }}
                    />
                  </div>
                </div>
              )}
            </ReactFlow>
          </InfoPanelProvider>

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

          {/* Backtest Configuration Modal */}
          {showBacktestModal && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-dark-text">Backtest Configuration</h2>
                  <button
                    onClick={() => setShowBacktestModal(false)}
                    className="text-dark-muted hover:text-dark-text transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-text mb-1">Ticker Symbol</label>
                    <input
                      type="text"
                      value={backtestConfig.ticker}
                      onChange={(e) => setBacktestConfig({ ...backtestConfig, ticker: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="AAPL"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-text mb-1">Start Date</label>
                      <input
                        type="date"
                        value={backtestConfig.startDate}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, startDate: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-text mb-1">End Date</label>
                      <input
                        type="date"
                        value={backtestConfig.endDate}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, endDate: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-text mb-1">
                      Initial Cash: ${backtestConfig.cash.toLocaleString()}
                    </label>
                    <input
                      type="range"
                      min="10000"
                      max="10000000"
                      step="10000"
                      value={backtestConfig.cash}
                      onChange={(e) => setBacktestConfig({ ...backtestConfig, cash: Number(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-dark-muted mt-1">
                      <span>$10K</span>
                      <span>$10M</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-text mb-1">
                      Commission: {(backtestConfig.commission * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="0.01"
                      step="0.0001"
                      value={backtestConfig.commission}
                      onChange={(e) => setBacktestConfig({ ...backtestConfig, commission: Number(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-dark-muted mt-1">
                      <span>0%</span>
                      <span>1%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowBacktestModal(false)}
                    className="flex-1 px-4 py-2 bg-dark-border hover:bg-dark-border/70 text-dark-text rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRunBacktest}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors font-medium"
                  >
                    Run Backtest
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
