import { type Node, type Edge } from '@xyflow/react'

export function generateStrategyCode(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return ''
  }

  // Find action nodes (entry points) and exit nodes
  const actionNodes = nodes.filter(n => n.type === 'action')
  const exitNodes = nodes.filter(n => n.type === 'exit')
  
  if (actionNodes.length === 0) {
    return '# No action nodes found. Add Buy or Sell nodes to create a strategy.'
  }

  // Build adjacency list for graph traversal (reversed: target -> sources)
  // Store both regular connections and comparison input connections separately
  const graph = new Map<string, string[]>()
  const compareInputs = new Map<string, string>() // nodeId -> source node for compare-input handle
  
  edges.forEach(edge => {
    // Track compare-input connections separately
    if (edge.targetHandle === 'compare-input') {
      compareInputs.set(edge.target, edge.source)
    } else {
      // Regular connections for logic flow
      if (!graph.has(edge.target)) {
        graph.set(edge.target, [])
      }
      graph.get(edge.target)!.push(edge.source)
    }
  })

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Generate expression for a node value with optional bar offset
  const generateExpression = (nodeId: string, barOffset?: number): string => {
    const node = nodeMap.get(nodeId)
    if (!node) return '0'

    const offset = barOffset ?? (node.data.barOffset as number || 0)
    const offsetStr = offset > 0 ? `[-${offset + 1}]` : '[-1]'

    switch (node.type) {
      case 'price': {
        const priceType = String(node.data.label).toLowerCase()
        if (priceType === 'volume') {
          return `self.data.Volume${offsetStr}`
        }
        return `self.data.${priceType.charAt(0).toUpperCase() + priceType.slice(1)}${offsetStr}`
      }

      case 'indicator': {
        const config = node.data.config as any || {}
        const label = String(node.data.label)
        
        // Extract indicator name (handle labels like "EMA 12", "RSI 14", etc.)
        const indicatorName = label.split(' ')[0]
        
        switch (indicatorName) {
          case 'RSI':
            return `self.rsi_${config.period || 14}${offsetStr}`
          case 'SMA':
            return `self.sma_${config.period || 20}${offsetStr}`
          case 'EMA':
            return `self.ema_${config.period || 20}${offsetStr}`
          case 'MACD':
            return `self.macd${offsetStr}`
          case 'Bollinger':
            return `self.bb_upper${offsetStr}`
          case 'ATR':
            return `self.atr_${config.period || 14}${offsetStr}`
          case 'Stochastic':
            return `self.stoch_k_${config.kPeriod || 14}${offsetStr}`
          case 'ADX':
            return `self.adx_${config.period || 14}${offsetStr}`
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

  // Generate crossover condition
  const generateCrossoverCondition = (nodeId: string, compareSourceId: string, crossType: 'above' | 'below'): string => {
    const currExpr = generateExpression(nodeId, 0)
    const prevExpr = generateExpression(nodeId, 1)
    const currCompare = generateExpression(compareSourceId, 0)
    const prevCompare = generateExpression(compareSourceId, 1)
    
    if (crossType === 'above') {
      return `(${prevExpr} <= ${prevCompare} and ${currExpr} > ${currCompare})`
    } else {
      return `(${prevExpr} >= ${prevCompare} and ${currExpr} < ${currCompare})`
    }
  }

  // Generate crossover condition against a static value
  const generateCrossoverValueCondition = (nodeId: string, compareValue: string, crossType: 'above' | 'below'): string => {
    const currExpr = generateExpression(nodeId, 0)
    const prevExpr = generateExpression(nodeId, 1)
    
    if (crossType === 'above') {
      return `(${prevExpr} <= ${compareValue} and ${currExpr} > ${compareValue})`
    } else {
      return `(${prevExpr} >= ${compareValue} and ${currExpr} < ${compareValue})`
    }
  }

  // Wrap condition with lookback logic ("within last N bars")
  const wrapWithLookback = (condition: string, lookback: number): string => {
    if (lookback <= 0) return condition
    return `any(${condition.replace(/\[-1\]/g, '[-i-1]').replace(/\[-2\]/g, '[-i-2]')} for i in range(${lookback}))`
  }

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
        const compareValue = String(node.data.compareValue || '0')
        const lookback = node.data.lookback as number || 0
        const expression = generateExpression(nodeId)
        
        // Check if comparing against another node via compare-input handle
        const compareSourceId = compareInputs.get(nodeId)
        
        let condition: string
        
        // Handle crossover conditions
        if (comparison === 'crosses_above') {
          if (compareSourceId) {
            condition = generateCrossoverCondition(nodeId, compareSourceId, 'above')
          } else {
            condition = generateCrossoverValueCondition(nodeId, compareValue, 'above')
          }
        } else if (comparison === 'crosses_below') {
          if (compareSourceId) {
            condition = generateCrossoverCondition(nodeId, compareSourceId, 'below')
          } else {
            condition = generateCrossoverValueCondition(nodeId, compareValue, 'below')
          }
        } else {
          // Standard comparison
          if (compareSourceId) {
            const compareExpr = generateExpression(compareSourceId)
            condition = `(${expression} ${comparison} ${compareExpr})`
          } else {
            condition = `(${expression} ${comparison} ${compareValue})`
          }
        }
        
        // Apply lookback if specified
        return lookback > 0 ? wrapWithLookback(condition, lookback) : condition
      }

      case 'logic': {
        const parents = graph.get(nodeId) || []
        
        // Handle NOT gate
        if (node.data.label === 'NOT') {
          if (parents.length === 0) return 'True'
          const innerCondition = generateNodeCondition(parents[0], new Set(visited))
          return `(not ${innerCondition})`
        }
        
        // Handle AND/OR gates
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

  // Generate indicator initializations
  const indicators = nodes.filter(n => n.type === 'indicator')
  const indicatorInits = indicators.map(node => {
    const config = node.data.config as any || {}
    const label = String(node.data.label)
    
    // Extract indicator name (handle labels like "EMA 12", "RSI 14", etc.)
    const indicatorName = label.split(' ')[0]
    
    switch (indicatorName) {
      case 'RSI':
        return `        self.rsi_${config.period || 14} = self.I(talib.RSI, self.data.Close, ${config.period || 14})`
      case 'SMA':
        return `        self.sma_${config.period || 20} = self.I(talib.SMA, self.data.Close, ${config.period || 20})`
      case 'EMA':
        return `        self.ema_${config.period || 20} = self.I(talib.EMA, self.data.Close, ${config.period || 20})`
      case 'MACD':
        return `        macd, signal, hist = self.I(talib.MACD, self.data.Close, ${config.fast || 12}, ${config.slow || 26}, ${config.signal || 9})\n        self.macd = macd\n        self.macd_signal = signal\n        self.macd_hist = hist`
      case 'Bollinger':
        return `        upper, middle, lower = self.I(talib.BBANDS, self.data.Close, ${config.period || 20}, ${config.std || 2}, ${config.std || 2})\n        self.bb_upper = upper\n        self.bb_middle = middle\n        self.bb_lower = lower`
      case 'ATR':
        return `        self.atr_${config.period || 14} = self.I(talib.ATR, self.data.High, self.data.Low, self.data.Close, ${config.period || 14})`
      case 'Stochastic':
        return `        self.stoch_k_${config.kPeriod || 14}, self.stoch_d_${config.kPeriod || 14} = self.I(talib.STOCH, self.data.High, self.data.Low, self.data.Close, fastk_period=${config.kPeriod || 14}, slowk_period=${config.dPeriod || 3}, slowd_period=${config.dPeriod || 3})`
      case 'ADX':
        return `        self.adx_${config.period || 14} = self.I(talib.ADX, self.data.High, self.data.Low, self.data.Close, ${config.period || 14})`
      default:
        return ''
    }
  }).filter(Boolean)

  // Generate buy/sell conditions with order sizing
  const buyNodes = actionNodes.filter(n => String(n.data.label).toLowerCase().includes('buy'))
  const sellNodes = actionNodes.filter(n => String(n.data.label).toLowerCase().includes('sell'))

  const generateBuyLogic = (node: Node) => {
    const parents = graph.get(node.id) || []
    let condition = 'True'
    if (parents.length > 0) {
      const conditions = parents.map(p => generateNodeCondition(p, new Set()))
      condition = conditions.length > 1 ? `(${conditions.join(' and ')})` : conditions[0]
    }
    
    const config = node.data.config as any || {}
    const orderType = config.orderType || 'all'
    const amount = config.amount || '100000'

    let sizeLogic = ''
    if (orderType === 'all') {
      sizeLogic = 'self.buy()'
    } else if (orderType === 'cash') {
      sizeLogic = `self.buy(size=max(1, ${amount} / self.data.Close[-1]))`
    } else if (orderType === 'shares') {
      sizeLogic = `self.buy(size=${amount})`
    } else if (orderType === 'percent') {
      sizeLogic = `self.buy(size=max(1, int((self.equity * ${amount} / 100) / self.data.Close[-1])))`
    }

    return { condition, sizeLogic }
  }

  const generateSellLogic = (node: Node) => {
    const parents = graph.get(node.id) || []
    let condition = 'True'
    if (parents.length > 0) {
      const conditions = parents.map(p => generateNodeCondition(p, new Set()))
      condition = conditions.length > 1 ? `(${conditions.join(' and ')})` : conditions[0]
    }
    
    const config = node.data.config as any || {}
    const orderType = config.orderType || 'all'
    const amount = config.amount || '100000'

    let sizeLogic = ''
    if (orderType === 'all') {
      sizeLogic = 'self.position.close()'
    } else if (orderType === 'shares') {
      sizeLogic = `self.sell(size=min(${amount}, self.position.size))`
    } else if (orderType === 'percent') {
      sizeLogic = `self.sell(size=self.position.size * ${amount} / 100)`
    } else {
      sizeLogic = 'self.position.close()'
    }

    return { condition, sizeLogic }
  }

  const buyLogics = buyNodes.map(generateBuyLogic)
  const sellLogics = sellNodes.map(generateSellLogic)

  // Generate exit node logic (Stop Loss, Take Profit, Trailing Stop)
  const generateExitLogic = () => {
    if (exitNodes.length === 0) return { initCode: '', nextCode: '' }
    
    const initLines: string[] = []
    const nextLines: string[] = []
    
    // Track entry price for exits
    initLines.push(`        self.entry_price = 0`)
    
    // Track if we need ATR for any exit
    let needsAtr = false
    let atrPeriod = 14
    
    exitNodes.forEach(node => {
      const config = node.data.config as any || {}
      const exitType = config.type || 'percent'
      const value = config.value || 2
      
      if (exitType === 'atr') {
        needsAtr = true
        atrPeriod = config.period || 14
      }
      
      switch (node.data.label) {
        case 'Stop Loss':
          if (exitType === 'percent') {
            nextLines.push(`            # Stop Loss (${value}%)`)
            nextLines.push(`            stop_price = self.entry_price * (1 - ${value} / 100)`)
            nextLines.push(`            if self.data.Close[-1] <= stop_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          } else if (exitType === 'fixed') {
            nextLines.push(`            # Stop Loss (fixed $${value})`)
            nextLines.push(`            stop_price = self.entry_price - ${value}`)
            nextLines.push(`            if self.data.Close[-1] <= stop_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          } else if (exitType === 'atr') {
            nextLines.push(`            # Stop Loss (${value}x ATR)`)
            nextLines.push(`            stop_price = self.entry_price - ${value} * self.exit_atr[-1]`)
            nextLines.push(`            if self.data.Close[-1] <= stop_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          }
          break
          
        case 'Take Profit':
          if (exitType === 'percent') {
            nextLines.push(`            # Take Profit (${value}%)`)
            nextLines.push(`            target_price = self.entry_price * (1 + ${value} / 100)`)
            nextLines.push(`            if self.data.Close[-1] >= target_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          } else if (exitType === 'fixed') {
            nextLines.push(`            # Take Profit (fixed $${value})`)
            nextLines.push(`            target_price = self.entry_price + ${value}`)
            nextLines.push(`            if self.data.Close[-1] >= target_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          } else if (exitType === 'atr') {
            nextLines.push(`            # Take Profit (${value}x ATR)`)
            nextLines.push(`            target_price = self.entry_price + ${value} * self.exit_atr[-1]`)
            nextLines.push(`            if self.data.Close[-1] >= target_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.entry_price = 0`)
          }
          break
          
        case 'Trailing Stop':
          initLines.push(`        self.trailing_stop_price = 0`)
          if (exitType === 'percent') {
            const trailValue = config.value || 2
            nextLines.push(`            # Trailing Stop (${trailValue}%)`)
            nextLines.push(`            new_stop = self.data.Close[-1] * (1 - ${trailValue} / 100)`)
            nextLines.push(`            if new_stop > self.trailing_stop_price:`)
            nextLines.push(`                self.trailing_stop_price = new_stop`)
            nextLines.push(`            if self.data.Close[-1] <= self.trailing_stop_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.trailing_stop_price = 0`)
            nextLines.push(`                self.entry_price = 0`)
          } else if (exitType === 'atr') {
            const multiplier = config.multiplier || 2
            nextLines.push(`            # Trailing Stop (${multiplier}x ATR)`)
            nextLines.push(`            new_stop = self.data.Close[-1] - ${multiplier} * self.exit_atr[-1]`)
            nextLines.push(`            if new_stop > self.trailing_stop_price:`)
            nextLines.push(`                self.trailing_stop_price = new_stop`)
            nextLines.push(`            if self.data.Close[-1] <= self.trailing_stop_price:`)
            nextLines.push(`                self.position.close()`)
            nextLines.push(`                self.trailing_stop_price = 0`)
            nextLines.push(`                self.entry_price = 0`)
          }
          break
      }
    })
    
    // Add ATR indicator for exits if needed
    if (needsAtr) {
      initLines.unshift(`        self.exit_atr = self.I(talib.ATR, self.data.High, self.data.Low, self.data.Close, ${atrPeriod})`)
    }
    
    return {
      initCode: initLines.length > 0 ? initLines.join('\n') : '',
      nextCode: nextLines.length > 0 ? `        if self.position:\n${nextLines.join('\n')}` : ''
    }
  }

  const exitLogic = generateExitLogic()

  // Generate buy/sell code blocks
  const buyCode = buyLogics.length > 0 
    ? buyLogics.map(({ condition, sizeLogic }) => 
        `        if ${condition}:\n            if not self.position:\n                ${sizeLogic}\n                self.entry_price = self.data.Close[-1]`
      ).join('\n        el')
    : ''

  const sellCode = sellLogics.length > 0
    ? sellLogics.map(({ condition, sizeLogic }) =>
        `        if ${condition}:\n            if self.position:\n                ${sizeLogic}\n                self.entry_price = 0`
      ).join('\n        el')
    : ''

  // Combine indicator inits with exit inits
  const allInits = [...indicatorInits]
  if (exitLogic.initCode) {
    allInits.push(exitLogic.initCode)
  }

  // Generate final strategy code
  return `from backtesting import Strategy
import talib

class WickStrategy(Strategy):
    def init(self):
${allInits.join('\n') || '        pass'}
    
    def next(self):
        # Exit logic (Stop Loss / Take Profit / Trailing Stop)
${exitLogic.nextCode || '        pass'}
        
        # Buy logic
${buyCode || '        pass'}
        
        # Sell logic
${sellCode || '        pass'}
`
}
