export type NodeType = 'logic' | 'indicator' | 'price' | 'action' | 'value'

export interface NodeData extends Record<string, unknown> {
  label: string
  type: NodeType
  config?: any
  comparison?: string // For indicator/price nodes
  compareValue?: number | string // Value to compare against
}

// Logic node types
export const LOGIC_TYPES = {
  AND: 'and',
  OR: 'or',
} as const

// Indicator types
export const INDICATOR_TYPES = {
  RSI: 'rsi',
  SMA: 'sma',
  EMA: 'ema',
  MACD: 'macd',
  BB: 'bollinger_bands',
} as const

// Price types
export const PRICE_TYPES = {
  OPEN: 'open',
  HIGH: 'high',
  LOW: 'low',
  CLOSE: 'close',
} as const

// Action types
export const ACTION_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
} as const

// Comparison operators
export const COMPARISON_TYPES = {
  GREATER: '>',
  LESS: '<',
  EQUAL: '==',
  GREATER_EQUAL: '>=',
  LESS_EQUAL: '<=',
} as const

// Value node types
export const VALUE_TYPES = {
  NUMBER: 'number',
} as const

// Node configurations with default parameters
export const NODE_CONFIGS = {
  rsi: { period: 14, overbought: 70, oversold: 30 },
  sma: { period: 20 },
  ema: { period: 20 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger_bands: { period: 20, std: 2 },
}
