export type NodeType = 'logic' | 'indicator' | 'price' | 'action' | 'value' | 'exit'

export interface NodeData extends Record<string, unknown> {
  label: string
  type: NodeType
  config?: any
  comparison?: string // For indicator/price nodes
  compareValue?: number | string // Value to compare against
  lookback?: number // For "within last N bars" conditions
  barOffset?: number // For previous bar reference [0], [1], [2], etc.
}

// Logic node types
export const LOGIC_TYPES = {
  AND: 'and',
  OR: 'or',
  NOT: 'not',
} as const

// Indicator types
export const INDICATOR_TYPES = {
  RSI: 'rsi',
  SMA: 'sma',
  EMA: 'ema',
  MACD: 'macd',
  BB: 'bollinger_bands',
  ATR: 'atr',
  STOCHASTIC: 'stochastic',
  ADX: 'adx',
} as const

// Price types
export const PRICE_TYPES = {
  OPEN: 'open',
  HIGH: 'high',
  LOW: 'low',
  CLOSE: 'close',
  VOLUME: 'volume',
  INTRADAY_PRICE: 'intraday_price',
} as const

// Action types
export const ACTION_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
} as const

// Exit types (stop loss, take profit)
export const EXIT_TYPES = {
  STOP_LOSS: 'stop_loss',
  TAKE_PROFIT: 'take_profit',
  TRAILING_STOP: 'trailing_stop',
} as const

// Comparison operators
export const COMPARISON_TYPES = {
  GREATER: '>',
  LESS: '<',
  EQUAL: '==',
  GREATER_EQUAL: '>=',
  LESS_EQUAL: '<=',
  CROSSES_ABOVE: 'crosses_above',
  CROSSES_BELOW: 'crosses_below',
} as const

// Value node types
export const VALUE_TYPES = {
  NUMBER: 'number',
} as const

// Node configurations with default parameters
export const NODE_CONFIGS = {
  rsi: { period: 14 },
  sma: { period: 20 },
  ema: { period: 20 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger_bands: { period: 20, std: 2 },
  atr: { period: 14 },
  stochastic: { k_period: 14, d_period: 3, slowing: 3 },
  adx: { period: 14 },
  stop_loss: { type: 'percent', value: 2 },
  take_profit: { type: 'percent', value: 5 },
  trailing_stop: { type: 'atr', multiplier: 2, period: 14 },
  intraday_price: { interval: '1h' },
}
