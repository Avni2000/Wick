import { type Node, type Edge } from '@xyflow/react'

export function generateStrategyCode(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return ''
  }

  // Find action nodes (entry points)
  const actionNodes = nodes.filter(n => n.type === 'action')
  
  if (actionNodes.length === 0) {
    return '# No action nodes found. Add Buy or Sell nodes to create a strategy.'
  }

  // Build adjacency list for graph traversal (reversed: target -> sources)
  const graph = new Map<string, string[]>()
  edges.forEach(edge => {
    if (!graph.has(edge.target)) {
      graph.set(edge.target, [])
    }
    graph.get(edge.target)!.push(edge.source)
  })

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Generate condition for a node with built-in comparison
  const generateNodeCondition = (nodeId: string, visited = new Set<string>()): string => {
    if (visited.has(nodeId)) return 'True'
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return 'True'

    switch (node.type) {
      case 'indicator':
      case 'price': {
        // These nodes have built-in comparisons
        const comparison = node.data.comparison as string || '>'
        const compareValue = node.data.compareValue || '0'
        const expression = generateExpression(nodeId)
        
        // Check if comparing against another node (left input)
        const parents = graph.get(nodeId) || []
        if (parents.length > 0) {
          const compareNode = parents[0]
          const compareExpr = generateExpression(compareNode)
          return `(${expression} ${comparison} ${compareExpr})`
        }
        
        return `(${expression} ${comparison} ${compareValue})`
      }

      case 'logic': {
        const parents = graph.get(nodeId) || []
        if (parents.length === 0) return 'True'
        
        // For AND/OR nodes, combine conditions from all inputs
        const conditions = parents.map(p => generateNodeCondition(p, new Set(visited)))
        const operator = node.data.label === 'AND' ? ' and ' : ' or '
        return `(${conditions.join(operator)})`
      }

      default:
        return 'True'
    }
  }

  const generateExpression = (nodeId: string): string => {
    const node = nodeMap.get(nodeId)
    if (!node) return '0'

    switch (node.type) {
      case 'price': {
        const priceType = String(node.data.label).toLowerCase()
        return `self.data.${priceType.charAt(0).toUpperCase() + priceType.slice(1)}`
      }

      case 'indicator': {
        const config = node.data.config as any || {}
        
        switch (node.data.label) {
          case 'RSI':
            return `self.rsi_${config.period || 14}`
          case 'SMA':
            return `self.sma_${config.period || 20}`
          case 'EMA':
            return `self.ema_${config.period || 20}`
          case 'MACD':
            return `self.macd`
          case 'Bollinger Bands':
            return `self.bb_upper`
          default:
            return '0'
        }
      }

      case 'value': {
        return String(node.data.compareValue || '0')
      }

      default:
        return '0'
    }
  }

  // Generate indicator initializations
  const indicators = nodes.filter(n => n.type === 'indicator')
  const indicatorInits = indicators.map(node => {
    const config = node.data.config as any || {}
    
    switch (node.data.label) {
      case 'RSI':
        return `        self.rsi_${config.period || 14} = self.I(talib.RSI, self.data.Close, ${config.period || 14})`
      case 'SMA':
        return `        self.sma_${config.period || 20} = self.I(talib.SMA, self.data.Close, ${config.period || 20})`
      case 'EMA':
        return `        self.ema_${config.period || 20} = self.I(talib.EMA, self.data.Close, ${config.period || 20})`
      case 'MACD':
        return `        macd, signal, hist = self.I(talib.MACD, self.data.Close, ${config.fast || 12}, ${config.slow || 26}, ${config.signal || 9})\n        self.macd = macd`
      case 'Bollinger Bands':
        return `        upper, middle, lower = self.I(talib.BBANDS, self.data.Close, ${config.period || 20}, ${config.std || 2}, ${config.std || 2})\n        self.bb_upper = upper\n        self.bb_middle = middle\n        self.bb_lower = lower`
      default:
        return ''
    }
  }).filter(Boolean)

  // Generate buy/sell conditions
  const buyNodes = actionNodes.filter(n => String(n.data.label).toLowerCase().includes('buy'))
  const sellNodes = actionNodes.filter(n => String(n.data.label).toLowerCase().includes('sell'))

  const buyCondition = buyNodes.length > 0
    ? buyNodes.map(n => generateNodeCondition(n.id)).join(' or ')
    : 'False'

  const sellCondition = sellNodes.length > 0
    ? sellNodes.map(n => generateNodeCondition(n.id)).join(' or ')
    : 'False'

  // Generate final strategy code
  return `from backtesting import Strategy
import talib

class CustomStrategy(Strategy):
    def init(self):
${indicatorInits.join('\n') || '        pass'}
    
    def next(self):
        # Buy condition
        if ${buyCondition}:
            if not self.position:
                self.buy()
        
        # Sell condition
        if ${sellCondition}:
            if self.position:
                self.position.close()
`
}
