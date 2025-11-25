import { memo, useState } from 'react'
import { Handle, Position, type NodeProps, type Node, useReactFlow } from '@xyflow/react'
import { type NodeData } from '../../types/nodes'
import { COMPARISON_TYPES } from '../../types/nodes'
import { Network, TrendingUp, DollarSign, ShoppingCart, Hash, Info, X } from 'lucide-react'

// Indicator descriptions
const INDICATOR_DESCRIPTIONS: Record<string, string> = {
  'RSI': 'Relative Strength Index (RSI) measures momentum on a scale of 0-100. Values above 70 suggest overbought conditions, while values below 30 suggest oversold conditions.',
  'SMA': 'Simple Moving Average (SMA) calculates the average price over a specified period, smoothing out price data to identify trends.',
  'EMA': 'Exponential Moving Average (EMA) gives more weight to recent prices, making it more responsive to new information than SMA.',
  'MACD': 'Moving Average Convergence Divergence (MACD) shows the relationship between two moving averages, used to identify trend changes.',
  'Bollinger Bands': 'Bollinger Bands consist of a middle band (SMA) and two outer bands that measure volatility. Price touching the outer bands may indicate overbought/oversold conditions.'
}

// Simple wrapper for native tooltips
const TooltipWrapper = ({ children, content }: { children: React.ReactNode; content: string }) => {
  return (
    <div className="inline-block" title={content}>
      {children}
    </div>
  )
}

// Delete Button Component
const DeleteButton = ({ nodeId }: { nodeId: string }) => {
  const { deleteElements } = useReactFlow()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteElements({ nodes: [{ id: nodeId }] })
  }

  return (
    <button
      onClick={handleDelete}
      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
      title="Delete node"
    >
      <X className="w-3 h-3" />
    </button>
  )
}

// Logic Node (AND/OR)
export const LogicNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      {/* Left handles - inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-1"
        className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="input-2"
        className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
        style={{ top: '70%' }}
      />

      <div className="rounded-xl shadow-md border border-gray-300 min-w-[100px] transition-all hover:shadow-lg overflow-hidden">
        {/* Purple Header */}
        <div className="bg-purple-500 px-4 py-2.5">
          <div className="flex items-center justify-center gap-2">
            <Network className="w-4 h-4 text-white" />
            <div className="text-white font-semibold text-sm tracking-wide">{data.label}</div>
          </div>
        </div>
      </div>

      {/* Right handle - output */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
      />
    </div>
  )
})

LogicNode.displayName = 'LogicNode'

// Indicator Node with built-in comparison
export const IndicatorNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const [comparison, setComparison] = useState(data.comparison || '>')
  const [compareValue, setCompareValue] = useState(data.compareValue || '')
  const [config, setConfig] = useState(data.config || {})
  const { getEdges, getNode } = useReactFlow()

  // Find if there's a node connected to our left input
  const getConnectedNodeLabel = () => {
    const edges = getEdges()
    const connectedEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'compare-input')
    if (connectedEdge) {
      const sourceNode = getNode(connectedEdge.source)
      return sourceNode?.data?.label || ''
    }
    return ''
  }

  const connectedNodeLabel = getConnectedNodeLabel()
  const displayValue = connectedNodeLabel ? `${comparison} ${connectedNodeLabel}` : compareValue

  const updateNodeData = (updates: Partial<NodeData>) => {
    // This will be handled by the store - for now just update local state
    if (updates.comparison !== undefined) setComparison(updates.comparison)
    if (updates.compareValue !== undefined) setCompareValue(updates.compareValue)
    if (updates.config !== undefined) setConfig(updates.config)
  }

  const updateConfig = (key: string, value: number) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    // Update parent node data
    Object.assign(data, { config: newConfig })
  }

  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      {/* Left handle - for chaining with other indicators/values */}
      <Handle
        type="target"
        position={Position.Left}
        id="compare-input"
        className="w-3 h-3 !bg-red-500 border-2 border-red-300 shadow-lg"
        style={{ top: '50%' }}
      />

      <div className="rounded-xl shadow-md border border-gray-300 min-w-[200px] transition-all hover:shadow-lg overflow-hidden">
        {/* Red Header */}
        <div className="bg-red-500 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-white" />
            <div className="font-semibold text-sm tracking-wide text-white">{data.label}</div>
            <TooltipWrapper content={INDICATOR_DESCRIPTIONS[data.label] || 'Technical indicator'}>
              <Info className="w-3.5 h-3.5 text-white cursor-help hover:text-red-100 transition-colors" />
            </TooltipWrapper>
          </div>
        </div>

        {/* Grey Body */}
        <div className="bg-gray-50 px-4 py-3">
          {/* Editable configuration */}
          {config && Object.keys(config).length > 0 && (
            <div className="space-y-1.5 mb-2.5">
              {Object.entries(config).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 capitalize w-20">{key}:</span>
                  <input
                    type="number"
                    value={value as number}
                    onChange={(e) => updateConfig(key, parseInt(e.target.value) || 0)}
                    className="bg-white text-gray-900 text-xs px-2 py-1 rounded border border-gray-300 w-16 focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Built-in comparison */}
          <div className="flex items-center gap-2 mt-2">
            <select
              value={comparison}
              onChange={(e) => updateNodeData({ comparison: e.target.value })}
              className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400 shadow-sm"
            >
              {Object.values(COMPARISON_TYPES).map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            <input
              type="text"
              value={connectedNodeLabel ? displayValue : compareValue}
              onChange={(e) => !connectedNodeLabel && updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              disabled={!!connectedNodeLabel}
              className={`bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 w-20 focus:outline-none focus:ring-2 focus:ring-red-400 shadow-sm ${connectedNodeLabel ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Right handle - output */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-red-500 border-2 border-red-300 shadow-lg"
      />
    </div>
  )
})

IndicatorNode.displayName = 'IndicatorNode'

// Price Node with built-in comparison
export const PriceNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const [comparison, setComparison] = useState(data.comparison || '>')
  const [compareValue, setCompareValue] = useState(data.compareValue || '')
  const { getEdges, getNode } = useReactFlow()

  // Find if there's a node connected to our left input
  const getConnectedNodeLabel = () => {
    const edges = getEdges()
    const connectedEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'compare-input')
    if (connectedEdge) {
      const sourceNode = getNode(connectedEdge.source)
      return sourceNode?.data?.label || ''
    }
    return ''
  }

  const connectedNodeLabel = getConnectedNodeLabel()
  const displayValue = connectedNodeLabel ? `${comparison} ${connectedNodeLabel}` : compareValue

  const updateNodeData = (updates: Partial<NodeData>) => {
    if (updates.comparison !== undefined) setComparison(updates.comparison)
    if (updates.compareValue !== undefined) setCompareValue(updates.compareValue)
  }

  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      {/* Left handle - for chaining */}
      <Handle
        type="target"
        position={Position.Left}
        id="compare-input"
        className="w-3 h-3 !bg-green-500 border-2 border-green-300 shadow-lg"
        style={{ top: '50%' }}
      />

      <div className="rounded-xl shadow-md border border-gray-300 min-w-[160px] transition-all hover:shadow-lg overflow-hidden">
        {/* Green Header */}
        <div className="bg-green-500 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-white" />
            <div className="font-semibold text-sm tracking-wide text-white">{data.label}</div>
          </div>
        </div>

        {/* Grey Body */}
        <div className="bg-gray-50 px-4 py-3">
          {/* Built-in comparison */}
          <div className="flex items-center gap-2">
            <select
              value={comparison}
              onChange={(e) => updateNodeData({ comparison: e.target.value })}
              className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-sm"
            >
              {Object.values(COMPARISON_TYPES).map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            <input
              type="text"
              value={connectedNodeLabel ? displayValue : compareValue}
              onChange={(e) => !connectedNodeLabel && updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              disabled={!!connectedNodeLabel}
              className={`bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 w-20 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-sm ${connectedNodeLabel ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Right handle - output */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-green-500 border-2 border-green-300 shadow-lg"
      />
    </div>
  )
})

PriceNode.displayName = 'PriceNode'

// Action Node (Buy/Sell)
export const ActionNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const isBuy = data.label.toLowerCase().includes('buy')
  const [orderType, setOrderType] = useState(data.config?.orderType || 'all')
  const [amount, setAmount] = useState(data.config?.amount || '100000')

  const updateConfig = (type: string, value: string) => {
    const newConfig = { ...data.config, orderType: type, amount: value }
    Object.assign(data, { config: newConfig })
    if (type === 'all') {
      setOrderType('all')
    } else {
      setOrderType(type)
      setAmount(value)
    }
  }

  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      {/* Left handle - input */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-yellow-500 border-2 border-yellow-300 shadow-lg"
      />

      <div className="rounded-xl shadow-md border border-gray-300 min-w-[180px] transition-all hover:shadow-lg overflow-hidden">
        {/* Yellow Header */}
        <div className="bg-yellow-500 px-5 py-2.5">
          <div className="flex items-center justify-center gap-2">
            <ShoppingCart className="w-4 h-4 text-white" />
            <div className="font-semibold text-center text-sm tracking-wide text-white">
              {data.label}
            </div>
          </div>
        </div>

        {/* Grey Body */}
        <div className="bg-gray-50 px-4 py-3 space-y-2">
          <div className="flex flex-col gap-2">
            <select
              value={orderType}
              onChange={(e) => {
                const type = e.target.value
                setOrderType(type)
                updateConfig(type, amount)
              }}
              className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-sm w-full"
            >
              <option value="all">{isBuy ? 'All Cash' : 'All Shares'}</option>
              <option value="cash">Fixed Cash Amount</option>
              <option value="shares">Number of Shares</option>
              <option value="percent">Percentage of Portfolio</option>
            </select>

            {orderType !== 'all' && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    updateConfig(orderType, e.target.value)
                  }}
                  className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-sm flex-1"
                  placeholder={
                    orderType === 'cash' ? '100000' :
                    orderType === 'shares' ? '100' :
                    '50'
                  }
                />
                <span className="text-xs text-gray-600">
                  {orderType === 'cash' ? '$' :
                   orderType === 'shares' ? 'sh' :
                   '%'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

ActionNode.displayName = 'ActionNode'

// Value Node - for entering raw numbers
export const ValueNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const [value, setValue] = useState(data.compareValue || '0')

  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      <div className="rounded-xl shadow-md border border-gray-300 min-w-[120px] transition-all hover:shadow-lg overflow-hidden">
        {/* Grey Header */}
        <div className="bg-gray-400 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-white" />
            <span className="text-sm font-semibold text-white">Value</span>
          </div>
        </div>

        {/* Light Grey Body */}
        <div className="bg-gray-50 px-4 py-3">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-white text-gray-900 text-sm px-2 py-1.5 rounded-md border border-gray-300 w-full focus:outline-none focus:ring-2 focus:ring-gray-400 shadow-sm"
            placeholder="Enter value"
          />
        </div>
      </div>

      {/* Right handle - output */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400 border-2 border-gray-300 shadow-lg"
      />
    </div>
  )
})

ValueNode.displayName = 'ValueNode'
