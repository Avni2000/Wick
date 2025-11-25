import { memo, useState } from 'react'
import { Handle, Position, type NodeProps, type Node, useReactFlow } from '@xyflow/react'
import { type NodeData } from '../../types/nodes'
import { COMPARISON_TYPES } from '../../types/nodes'
import { Network, TrendingUp, DollarSign, ShoppingCart, Hash, Info, X, Shield, Ban } from 'lucide-react'
import { useInfoPanel } from '../../contexts/InfoPanelContext'

// Utility function to format descriptions with bold headers
const formatDescription = (text: string): string => {
  const keywords = ['Parameter:', 'Parameters:', 'Returns:', 'Signals:', 'Description:', 'Common Periods:', 'Vs SMA:', 'Usage:', 'Interpretation:', 'Triggers:', 'Values:']
  let formatted = text
  
  keywords.forEach(keyword => {
    const regex = new RegExp(`(${keyword})`, 'g')
    formatted = formatted.replace(regex, `<strong>$1</strong>`)
  })
  
  return formatted
}

// Indicator descriptions
const INDICATOR_DESCRIPTIONS: Record<string, string> = {
  'RSI': 'Relative Strength Index (RSI)\n\nParameter: period\nNumber of bars/days to calculate over (default: 14).\n\nReturns:\nValue from 0-100 indicating momentum strength.\n\nSignals:\n> 70 = Overbought (may drop soon)\n< 30 = Oversold (may bounce soon)\n\nDescription:\nRelative Strength Index measures how fast and how much price has moved. High values mean price rose quickly (potentially overextended), low values mean price fell quickly.',
  'SMA': 'Simple Moving Average (SMA)\n\nParameter: period\nNumber of bars/days to average (default: 20).\n\nReturns:\nThe average closing price over the period.\n\nCommon Periods:\n5-10 = Short-term trends\n20-50 = Medium-term trends\n100-200 = Long-term trends\n\nDescription:\nSimple Moving Average smooths price data by averaging closing prices. Useful for identifying trend direction - price above SMA suggests uptrend, below suggests downtrend.',
  'EMA': 'Exponential Moving Average (EMA)\n\nParameter: period\nNumber of bars/days for calculation (default: 20).\n\nReturns:\nWeighted average giving more importance to recent prices.\n\nVs SMA:\nReacts faster to price changes\nBetter for short-term trading\nMore sensitive to recent moves\n\nDescription:\nExponential Moving Average weighs recent prices more heavily than older prices, making it more responsive to new information than SMA.',
  'MACD': 'Moving Average Convergence Divergence (MACD)\n\nParameters:\nfastPeriod - Fast EMA period (default: 12)\nslowPeriod - Slow EMA period (default: 26)\nsignalPeriod - Signal line period (default: 9)\n\nReturns:\nMACD line, Signal line, and Histogram.\n\nSignals:\nMACD crosses above Signal = Bullish\nMACD crosses below Signal = Bearish\nHistogram growing = Momentum increasing\n\nDescription:\nShows the relationship between two moving averages. Used to spot momentum shifts and potential trend reversals.',
  'Bollinger Bands': 'Bollinger Bands\n\nParameters:\nperiod - SMA period for middle band (default: 20)\nstdDev - Standard deviations for outer bands (default: 2)\n\nReturns:\nUpper Band, Middle Band (SMA), Lower Band.\n\nSignals:\nPrice at Upper Band = Potentially overbought\nPrice at Lower Band = Potentially oversold\nBands narrowing = Low volatility, breakout may come\n\nDescription:\nVolatility bands that expand and contract based on market conditions. Price tends to stay within the bands ~95% of the time.',
  'ATR': 'Average True Range (ATR)\n\nParameter: period\nNumber of bars/days to average (default: 14).\n\nReturns:\nAverage price range in dollar terms.\n\nUsage:\nHigher ATR = More volatile, use wider stops\nLower ATR = Less volatile, tighter stops okay\nMultiply by 1.5-3x for stop loss distance\n\nDescription:\nAverage True Range measures how much price typically moves per day. Essential for position sizing and setting realistic stop losses.',
  'Stochastic': 'Stochastic Oscillator\n\nParameters:\nkPeriod - %K lookback period (default: 14)\ndPeriod - %D smoothing period (default: 3)\n\nReturns:\n%K (fast line) and %D (slow line), both 0-100.\n\nSignals:\n> 80 = Overbought zone\n< 20 = Oversold zone\n%K crosses above %D = Bullish\n%K crosses below %D = Bearish\n\nDescription:\nCompares current close to recent price range. Best used in sideways/ranging markets rather than strong trends.',
  'ADX': 'Average Directional Index (ADX)\n\nParameter: period\nNumber of bars/days to calculate (default: 14).\n\nReturns:\nValue from 0-100 indicating trend strength (not direction).\n\nInterpretation:\n0-20 = Weak or no trend (avoid trend strategies)\n20-40 = Developing trend\n40-60 = Strong trend\n60+ = Very strong trend\n\nDescription:\nMeasures HOW STRONG a trend is, not which direction. Use to filter out choppy markets where trend-following fails.'
}

// Exit descriptions
const EXIT_DESCRIPTIONS: Record<string, string> = {
  'Stop Loss': 'Parameters:\ntype - How the stop is calculated (Percentage, Fixed Price, or ATR Multiple)\nvalue - The threshold that triggers the stop\n\nTriggers:\nSell order when price drops below entry price minus stop amount.\n\nDescription:\nA risk management tool that automatically exits your position if the price falls too far. Protects against large losses by setting a maximum acceptable loss per trade.',
  'Take Profit': 'Parameters:\ntype - How the target is calculated (Percentage, Fixed Price, or ATR Multiple)\nvalue - The profit threshold that triggers the exit\n\nTriggers:\nSell order when price rises above entry price plus target amount.\n\nDescription:\nAutomatically locks in gains when your position reaches a profit target. Ensures you capture profits before a potential reversal.',
  'Trailing Stop': 'Parameters:\ntype - How the trail distance is calculated (Percentage or ATR Multiple)\nvalue/multiplier - The distance the stop trails behind the highest price\n\nTriggers:\nSell order when price drops from its highest point by the trail amount.\n\nDescription:\nA dynamic stop loss that follows the price upward but never moves down. Lets winners run while protecting accumulated gains. The stop only moves up as price makes new highs.'
}

// Tooltip descriptions
const TOOLTIP_DESCRIPTIONS: Record<string, string> = {
  'within': 'Parameter: within\nNumber of recent bars/days to scan.\n\nValues:\n- = Only check current bar\n3 = Within last 3 days\n5 = Within last 5 days\n10 = Within last 10 days\n20 = Within last 20 days\n\nReturns:\ntrue if condition was met on ANY of the checked bars.\n\nDescription:\nAdds flexibility to your entry timing. Instead of requiring the condition to be true RIGHT NOW, it checks if it was true recently. Useful when you don\'t need perfect timing.'
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

// Logic Node (AND/OR/NOT)
export const LogicNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const isNot = data.label === 'NOT'
  
  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      {/* Left handles - inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-1"
        className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
        style={{ top: isNot ? '50%' : '30%' }}
      />
      {!isNot && (
        <Handle
          type="target"
          position={Position.Left}
          id="input-2"
          className="w-3 h-3 !bg-purple-500 border-2 border-purple-300 shadow-lg"
          style={{ top: '70%' }}
        />
      )}

      <div className="shadow-md border border-gray-300 min-w-[100px] transition-all hover:shadow-lg overflow-hidden">
        {/* Purple Header */}
        <div className="bg-purple-500 px-4 py-2.5">
          <div className="flex items-center justify-center gap-2">
            {isNot ? <Ban className="w-4 h-4 text-white" /> : <Network className="w-4 h-4 text-white" />}
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
  const [compareValue, setCompareValue] = useState<string | number>(data.compareValue || '')
  const [config, setConfig] = useState(data.config || {})
  const [barOffset, setBarOffset] = useState(data.barOffset || 0)
  const [lookback, setLookback] = useState(data.lookback || 0)
  const { getEdges, getNode } = useReactFlow()
  const { showInfo, hideInfo } = useInfoPanel()

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
  
  // Format comparison display
  const getComparisonLabel = (op: string) => {
    if (op === 'crosses_above') return '↗ crosses above'
    if (op === 'crosses_below') return '↘ crosses below'
    return op
  }

  const updateNodeData = (updates: Partial<NodeData>) => {
    if (updates.comparison !== undefined) {
      setComparison(updates.comparison)
      Object.assign(data, { comparison: updates.comparison })
    }
    if (updates.compareValue !== undefined) {
      setCompareValue(updates.compareValue)
      Object.assign(data, { compareValue: updates.compareValue })
    }
    if (updates.config !== undefined) setConfig(updates.config)
    if (updates.barOffset !== undefined) {
      setBarOffset(updates.barOffset as number)
      Object.assign(data, { barOffset: updates.barOffset })
    }
    if (updates.lookback !== undefined) {
      setLookback(updates.lookback as number)
      Object.assign(data, { lookback: updates.lookback })
    }
  }

  const updateConfig = (key: string, value: number) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
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

      <div className="shadow-md border border-gray-300 min-w-[200px] transition-all hover:shadow-lg overflow-hidden">
        {/* Red Header */}
        <div className="bg-red-500 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-white" />
            <div className="font-semibold text-sm tracking-wide text-white">{data.label}</div>
            <div
              onMouseEnter={() => showInfo(data.label, formatDescription(INDICATOR_DESCRIPTIONS[data.label] || 'Technical indicator'))}
              onMouseLeave={hideInfo}
              className="inline-flex"
            >
              <Info className="w-3.5 h-3.5 text-white cursor-pointer hover:text-red-100 transition-colors" />
            </div>
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
                <option key={op} value={op}>{getComparisonLabel(op)}</option>
              ))}
            </select>

            <input
              type="text"
              value={(connectedNodeLabel || String(compareValue)) as string | number}
              onChange={(e) => !connectedNodeLabel && updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              disabled={!!connectedNodeLabel}
              className={`bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 w-20 focus:outline-none focus:ring-2 focus:ring-red-400 shadow-sm ${connectedNodeLabel ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Bar offset and lookback */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Bar:</span>
              <select
                value={barOffset}
                onChange={(e) => updateNodeData({ barOffset: parseInt(e.target.value) })}
                className="bg-white text-gray-900 text-xs px-1 py-1 rounded border border-gray-300 w-14"
              >
                <option value={0}>Now</option>
                <option value={1}>-1</option>
                <option value={2}>-2</option>
                <option value={3}>-3</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Within:</span>
              <select
                value={lookback}
                onChange={(e) => updateNodeData({ lookback: parseInt(e.target.value) })}
                className="bg-white text-gray-900 text-xs px-1 py-1 rounded border border-gray-300 w-14"
                title={formatDescription(TOOLTIP_DESCRIPTIONS['within']).replace(/\n/g, '&#10;')}
              >
                <option value={0}>-</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
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
  const [compareValue, setCompareValue] = useState<string | number>(data.compareValue || '')
  const [barOffset, setBarOffset] = useState(data.barOffset || 0)
  const [lookback, setLookback] = useState(data.lookback || 0)
  const { getEdges, getNode } = useReactFlow()

  // Format comparison display
  const getComparisonLabel = (op: string) => {
    if (op === 'crosses_above') return '↗ crosses above'
    if (op === 'crosses_below') return '↘ crosses below'
    return op
  }

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

  const updateNodeData = (updates: Partial<NodeData>) => {
    if (updates.comparison !== undefined) {
      setComparison(updates.comparison)
      Object.assign(data, { comparison: updates.comparison })
    }
    if (updates.compareValue !== undefined) {
      setCompareValue(updates.compareValue)
      Object.assign(data, { compareValue: updates.compareValue })
    }
    if (updates.barOffset !== undefined) {
      setBarOffset(updates.barOffset as number)
      Object.assign(data, { barOffset: updates.barOffset })
    }
    if (updates.lookback !== undefined) {
      setLookback(updates.lookback as number)
      Object.assign(data, { lookback: updates.lookback })
    }
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

      <div className="shadow-md border border-gray-300 min-w-[160px] transition-all hover:shadow-lg overflow-hidden">
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
                <option key={op} value={op}>{getComparisonLabel(op)}</option>
              ))}
            </select>

            <input
              type="text"
              value={(connectedNodeLabel || String(compareValue)) as string | number}
              onChange={(e) => !connectedNodeLabel && updateNodeData({ compareValue: e.target.value })}
              placeholder="value"
              disabled={!!connectedNodeLabel}
              className={`bg-white text-gray-900 text-xs px-2 py-1.5 rounded-md border border-gray-300 w-20 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-sm ${connectedNodeLabel ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Bar offset and lookback */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Bar:</span>
              <select
                value={barOffset}
                onChange={(e) => updateNodeData({ barOffset: parseInt(e.target.value) })}
                className="bg-white text-gray-900 text-xs px-1 py-1 rounded border border-gray-300 w-14"
              >
                <option value={0}>Now</option>
                <option value={1}>-1</option>
                <option value={2}>-2</option>
                <option value={3}>-3</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Within:</span>
              <select
                value={lookback}
                onChange={(e) => updateNodeData({ lookback: parseInt(e.target.value) })}
                className="bg-white text-gray-900 text-xs px-1 py-1 rounded border border-gray-300 w-14"
                title={formatDescription(TOOLTIP_DESCRIPTIONS['within']).replace(/\n/g, '&#10;')}
              >
                <option value={0}>-</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
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

      <div className="shadow-md border border-gray-300 min-w-[180px] transition-all hover:shadow-lg overflow-hidden">
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
      <div className="shadow-md border border-gray-300 min-w-[120px] transition-all hover:shadow-lg overflow-hidden">
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

// Exit Node (Stop Loss, Take Profit, Trailing Stop)
export const ExitNode = memo(({ data, id }: NodeProps<Node<NodeData>>) => {
  const [config, setConfig] = useState(data.config || {})
  const { showInfo, hideInfo } = useInfoPanel()
  
  const isStopLoss = data.label === 'Stop Loss'
  const isTakeProfit = data.label === 'Take Profit'
  const isTrailingStop = data.label === 'Trailing Stop'

  const updateConfig = (key: string, value: string | number) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    Object.assign(data, { config: newConfig })
  }

  return (
    <div className="relative group">
      <DeleteButton nodeId={id} />
      
      <div className="shadow-md border border-gray-300 min-w-[200px] transition-all hover:shadow-lg overflow-hidden">
        {/* Orange Header */}
        <div className="bg-orange-500 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-white" />
            <div className="font-semibold text-sm tracking-wide text-white">{data.label}</div>
            <div
              onMouseEnter={() => showInfo(data.label, formatDescription(EXIT_DESCRIPTIONS[data.label] || 'Risk management exit'))}
              onMouseLeave={hideInfo}
              className="inline-flex"
            >
              <Info className="w-3.5 h-3.5 text-white cursor-pointer hover:text-orange-100 transition-colors" />
            </div>
          </div>
        </div>

        {/* Grey Body */}
        <div className="bg-gray-50 px-4 py-3 space-y-2">
          {(isStopLoss || isTakeProfit) && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">Type:</span>
                <select
                  value={config.type || 'percent'}
                  onChange={(e) => updateConfig('type', e.target.value)}
                  className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                >
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed Price</option>
                  <option value="atr">ATR Multiple</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">Value:</span>
                <input
                  type="number"
                  value={config.value || (isStopLoss ? 2 : 5)}
                  onChange={(e) => updateConfig('value', parseFloat(e.target.value))}
                  className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                  step="0.1"
                />
                <span className="text-xs text-gray-500">
                  {config.type === 'percent' ? '%' : config.type === 'atr' ? 'x ATR' : '$'}
                </span>
              </div>
              {config.type === 'atr' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-12">Period:</span>
                  <input
                    type="number"
                    value={config.period || 14}
                    onChange={(e) => updateConfig('period', parseInt(e.target.value))}
                    className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                  />
                </div>
              )}
            </>
          )}

          {isTrailingStop && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">Type:</span>
                <select
                  value={config.type || 'atr'}
                  onChange={(e) => updateConfig('type', e.target.value)}
                  className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                >
                  <option value="percent">Percentage</option>
                  <option value="atr">ATR Multiple</option>
                </select>
              </div>
              {config.type === 'atr' ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-12">Multi:</span>
                    <input
                      type="number"
                      value={config.multiplier || 2}
                      onChange={(e) => updateConfig('multiplier', parseFloat(e.target.value))}
                      className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                      step="0.1"
                    />
                    <span className="text-xs text-gray-500">x ATR</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-12">Period:</span>
                    <input
                      type="number"
                      value={config.period || 14}
                      onChange={(e) => updateConfig('period', parseInt(e.target.value))}
                      className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-12">Value:</span>
                  <input
                    type="number"
                    value={config.value || 2}
                    onChange={(e) => updateConfig('value', parseFloat(e.target.value))}
                    className="bg-white text-gray-900 text-xs px-2 py-1.5 rounded border border-gray-300 flex-1"
                    step="0.1"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})

ExitNode.displayName = 'ExitNode'
