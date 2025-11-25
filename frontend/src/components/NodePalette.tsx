import { useStrategyStore } from '../store/strategyStore'
import { type Node } from '@xyflow/react'
import { LOGIC_TYPES, INDICATOR_TYPES, PRICE_TYPES, ACTION_TYPES, VALUE_TYPES, NODE_CONFIGS } from '../types/nodes'

export default function NodePalette() {
  const addNode = useStrategyStore((state) => state.addNode)

  const createNode = (type: string, label: string, nodeType: 'logic' | 'indicator' | 'price' | 'action' | 'value', config?: any, position?: { x: number; y: number }): Node => {
    const id = `${type}_${Date.now()}`
    return {
      id,
      type: nodeType,
      position: position || { x: Math.random() * 300 + 50, y: Math.random() * 300 + 50 },
      data: { label, type: nodeType, config },
    }
  }

  const onDragStart = (event: React.DragEvent, node: { type: string; label: string; nodeType: 'logic' | 'indicator' | 'price' | 'action' | 'value'; config?: any }) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(node))
    event.dataTransfer.effectAllowed = 'move'
  }

  const nodeCategories = [
    {
      name: 'Logic',
      nodes: [
        { type: LOGIC_TYPES.AND, label: 'AND', nodeType: 'logic' as const },
        { type: LOGIC_TYPES.OR, label: 'OR', nodeType: 'logic' as const },
      ],
    },
    {
      name: 'Indicators',
      nodes: [
        { type: INDICATOR_TYPES.RSI, label: 'RSI', nodeType: 'indicator' as const, config: NODE_CONFIGS.rsi },
        { type: INDICATOR_TYPES.SMA, label: 'SMA', nodeType: 'indicator' as const, config: NODE_CONFIGS.sma },
        { type: INDICATOR_TYPES.EMA, label: 'EMA', nodeType: 'indicator' as const, config: NODE_CONFIGS.ema },
        { type: INDICATOR_TYPES.MACD, label: 'MACD', nodeType: 'indicator' as const, config: NODE_CONFIGS.macd },
        { type: INDICATOR_TYPES.BB, label: 'Bollinger Bands', nodeType: 'indicator' as const, config: NODE_CONFIGS.bollinger_bands },
      ],
    },
    {
      name: 'Price',
      nodes: [
        { type: PRICE_TYPES.OPEN, label: 'Open', nodeType: 'price' as const },
        { type: PRICE_TYPES.HIGH, label: 'High', nodeType: 'price' as const },
        { type: PRICE_TYPES.LOW, label: 'Low', nodeType: 'price' as const },
        { type: PRICE_TYPES.CLOSE, label: 'Close', nodeType: 'price' as const },
      ],
    },
    {
      name: 'Values',
      nodes: [
        { type: VALUE_TYPES.NUMBER, label: 'Number', nodeType: 'value' as const },
      ],
    },
    {
      name: 'Actions',
      nodes: [
        { type: ACTION_TYPES.BUY, label: 'Buy', nodeType: 'action' as const, config: { amount: 'All Cash' } },
        { type: ACTION_TYPES.SELL, label: 'Sell', nodeType: 'action' as const, config: { amount: 'All Shares' } },
      ],
    },
  ]

  return (
    <div className="w-64 bg-dark-surface border-r border-dark-border p-4 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-dark-text">Node Palette</h3>
      <p className="text-xs text-dark-muted mb-4">Drag nodes onto the canvas</p>
      
      {nodeCategories.map((category) => (
        <div key={category.name} className="mb-6">
          <h4 className="text-sm font-medium text-dark-muted mb-2">{category.name}</h4>
          <div className="space-y-2">
            {category.nodes.map((node) => (
              <div
                key={node.type}
                draggable
                onDragStart={(e) => onDragStart(e, node)}
                onClick={() => addNode(createNode(node.type, node.label, node.nodeType, 'config' in node ? node.config : undefined))}
                className="w-full px-3 py-2 text-sm bg-dark-bg hover:bg-dark-border rounded border border-dark-border text-left text-dark-text transition-colors cursor-grab active:cursor-grabbing"
              >
                {node.label}
              </div>
            ))}
          </div>
        </div>
      ))}
      
      <div className="mt-6 pt-4 border-t border-dark-border">
        <button
          onClick={() => useStrategyStore.getState().resetFlow()}
          className="w-full px-3 py-2 text-sm bg-red-600/20 hover:bg-red-600/30 rounded border border-red-600/50 text-red-400 transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>
  )
}
