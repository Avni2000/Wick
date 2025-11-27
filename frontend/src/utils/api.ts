/**
 * API configuration for Wick frontend
 * In development, uses Vite proxy to localhost:8000
 * In production, uses relative /api paths served by the same server
 */

// Detect if we're in development mode (Vite dev server)
const isDev = import.meta.env.DEV

// API base URL - in dev mode uses localhost:8000, in production uses relative path
export const API_BASE = isDev ? 'http://localhost:8000' : ''

// WebSocket base URL
export const WS_BASE = isDev ? 'ws://localhost:8000' : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

// API endpoints
export const API = {
  chart: (ticker: string, period: string, interval: string) => 
    `${API_BASE}/api/chart/${ticker}?period=${period}&interval=${interval}`,
  search: (query: string) => 
    `${API_BASE}/api/search?q=${encodeURIComponent(query)}`,
  backtest: `${API_BASE}/api/backtest`,
  deploy: `${API_BASE}/api/deploy`,
  deploymentStop: (id: string) => `${API_BASE}/api/deploy/${id}`,
  deployments: `${API_BASE}/api/deployments`,
  deploymentHistory: (id: string) => `${API_BASE}/api/deployment/${id}/history`,
  ws: (clientId: string) => `${WS_BASE}/ws/${clientId}`,
}
