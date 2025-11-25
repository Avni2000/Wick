import { memo, useState } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { type NodeData } from '../../types/nodes'
import { COMPARISON_TYPES } from '../../types/nodes'
import { Network, TrendingUp, DollarSign, ShoppingCart, Hash } from 'lucide-react'

// Logic Node (AND/OR)
export const LogicNode = memo(({ data }: NodeProps<Node<NodeData>>) => {
  return (
    <div className="relative group">
      {/* Left handles - inputs */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input-1"
        className="w-3 h-3 !bg-blue-500 border-2 border-blue-300 shadow-lg"
        style={{ top: '30%' }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="input-2" 
        className="w-3 h-3 !bg-blue-500 border-2 border-blue-300 shadow-lg"
        style={{ top: '70%' }}
      />
      
      <div className="px-5 py-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md border border-blue-200 min-w-[100px] transition-all hover:shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <Network className="w-4 h-4 text-blue-600" />
          <div className="text-blue-900 font-semibold text-center text-sm tracking-wide">{data.label}</div>
        </div>
      </div>
      
      {/* Right handle - output */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-blue-500 border-2 border-blue-300 shadow-lg"
      />
    </div>
  )
})

LogicNode.displayName = 'LogicNode'

// Indicator Node with built-in comparison
export const IndicatorNode = memo(({ data }: NodeProps<Node<NodeData>>) => {
  const [comparison, setComparison] = useState(data.comparison || '>')
  const [compareValue, setCompareValue] = useState(data.compareValue || '')
  
  const updateNodeData = (updates: Partial<NodeData>) => {
    // This will be handled by the store - for now just update local state
    if (updates.comparison !== undefined) setComparison(updates.comparison)
    if (updates.compareValue !== undefined) setCompareValue(updates.compareValue)
  }

  return (
    <div className="relative group">
      {/* Left handle - for chaining with other indicators/values */}
      <Handle 
        type="target" 
        position={Position.Left}
        id="compare-input"
        className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
        style={{ top: '50%' }}
      />
      
      <div className="px-4 py-3 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-md border border-purple-200 min-w-[180px] transition-all hover:shadow-lg">
        <div className="text-purple-900">
          <div className="flex items-center gap-2 mb-2.5">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <div className="font-semibold text-sm tracking-wide">{data.label}</div>
          </div>
          
          {/* Built-in comparison */}
          <div className="flex items-center gap-2 mt-2">
            <select 
              value={comparison}
              onChange={(e) => updateNodeData({ comparison: e.target.value })}
              className="bg-white text-purple-900 text-xs px-2 py-1.5 rounded-md border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-sm"
            >
              {Object.values(COMPARISON_TYPES).map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            
            <input 
              type="text"
              value={compareValue}
              onChange={(e) => updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              className="bg-white text-purple-900 text-xs px-2 py-1.5 rounded-md border border-purple-300 w-20 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-sm"
            />
          </div>
          
          {data.config && (
            <div className="text-xs mt-2.5 text-purple-700 opacity-75">
              {Object.entries(data.config).slice(0, 2).map(([key, value]) => (
                <div key={key}>{key}: {String(value)}</div>
              ))}
            </div>
          )}
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

IndicatorNode.displayName = 'IndicatorNode'

// Price Node with built-in comparison
export const PriceNode = memo(({ data }: NodeProps<Node<NodeData>>) => {
  const [comparison, setComparison] = useState(data.comparison || '>')
  const [compareValue, setCompareValue] = useState(data.compareValue || '')
  
  const updateNodeData = (updates: Partial<NodeData>) => {
    if (updates.comparison !== undefined) setComparison(updates.comparison)
    if (updates.compareValue !== undefined) setCompareValue(updates.compareValue)
  }

  return (
    <div className="relative group">
      {/* Left handle - for chaining */}
      <Handle 
        type="target" 
        position={Position.Left}
        id="compare-input"
        className="w-3 h-3 !bg-emerald-500 border-2 border-emerald-300 shadow-lg"
        style={{ top: '50%' }}
      />
      
      <div className="px-4 py-3 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl shadow-md border border-emerald-200 min-w-[160px] transition-all hover:shadow-lg">
        <div className="text-emerald-900">
          <div className="flex items-center gap-2 mb-2.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <div className="font-semibold text-sm tracking-wide">{data.label}</div>
          </div>
          
          {/* Built-in comparison */}
          <div className="flex items-center gap-2">
            <select 
              value={comparison}
              onChange={(e) => updateNodeData({ comparison: e.target.value })}
              className="bg-white text-emerald-900 text-xs px-2 py-1.5 rounded-md border border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm"
            >
              {Object.values(COMPARISON_TYPES).map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            
            <input 
              type="text"
              value={compareValue}
              onChange={(e) => updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              className="bg-white text-emerald-900 text-xs px-2 py-1.5 rounded-md border border-emerald-300 w-20 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm"
            />
          </div>
        </div>
      </div>
      
      {/* Right handle - output */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-emerald-500 border-2 border-emerald-300 shadow-lg"
      />
    </div>
  )
})

PriceNode.displayName = 'PriceNode'

// Action Node (Buy/Sell)
export const ActionNode = memo(({ data }: NodeProps<Node<NodeData>>) => {
  const isBuy = data.label.toLowerCase().includes('buy')
  
  return (
    <div className="relative group">
      {/* Left handle - input */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className={`w-3 h-3 border-2 shadow-lg ${isBuy ? '!bg-green-500 border-green-300' : '!bg-red-500 border-red-300'}`}
      />
      
      <div className={`px-6 py-3 rounded-xl shadow-md border min-w-[120px] transition-all hover:shadow-lg ${
        isBuy 
          ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' 
          : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
      }`}>
        <div className="flex items-center justify-center gap-2">
          <ShoppingCart className={`w-4 h-4 ${isBuy ? 'text-green-600' : 'text-red-600'}`} />
          <div className={`font-semibold text-center text-sm tracking-wide ${isBuy ? 'text-green-900' : 'text-red-900'}`}>
            {data.label}
          </div>
        </div>
        {data.config && (
          <div className={`text-xs mt-1.5 text-center opacity-75 ${isBuy ? 'text-green-700' : 'text-red-700'}`}>
            {data.config.amount || 'All Cash'}
          </div>
        )}
      </div>
    </div>
  )
})

ActionNode.displayName = 'ActionNode'

// Value Node - for entering raw numbers
export const ValueNode = memo(({ data }: NodeProps<Node<NodeData>>) => {
  const [value, setValue] = useState(data.compareValue || '0')
  
  return (
    <div className="relative group">
      <div className="px-4 py-2.5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl shadow-md border border-slate-200 min-w-[120px] transition-all hover:shadow-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <Hash className="w-4 h-4 text-slate-600" />
          <span className="text-xs font-medium text-slate-700">Value</span>
        </div>
        <input 
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bg-white text-slate-900 text-sm px-2 py-1.5 rounded-md border border-slate-300 w-full focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm"
          placeholder="Enter value"
        />
      </div>
      
      {/* Right handle - output */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-slate-500 border-2 border-slate-300 shadow-lg"
      />
    </div>
  )
})

ValueNode.displayName = 'ValueNode'
