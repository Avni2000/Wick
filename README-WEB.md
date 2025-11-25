# Wick Web - Trading Strategy Platform

**Status:** Backend complete, Frontend scaffolded (in progress)

## What's Been Built

### ✅ Backend (Complete)
- FastAPI server with routes for `/backtest`, `/deploy`, `/deployments`
- WebSocket endpoint for real-time trading updates
- Backtest runner using `backtesting.py` library
- Live paper trader with minute-level execution
- SQLite trade journal for tracking deployments, orders, positions, logs
- All Python logic migrated from VS Code extension

### ✅ Frontend (Scaffolded)
- React + TypeScript + Vite project structure
- TailwindCSS configured with black/grey theme
- Main app layout with sidebar navigation
- Three tab system: Builder, Backtest Results, Live Dashboard

### 🚧 In Progress
- Strategy Builder component with React Flow
- Node types (Logic, Indicators, Price, Actions)
- Python code generation from visual flow
- Backtest integration and results display
- Live trading dashboard with WebSocket

## Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
# Server runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dev server runs on http://localhost:5173
```

## Next Steps

1. **Complete Strategy Builder**: Implement React Flow canvas with all node types
2. **Code Generation**: Convert node graph to Python strategy code
3. **Backtest UI**: Build form + results display with equity curve chart
4. **Live Dashboard**: WebSocket integration, position tracking, signal feed
5. **Testing**: End-to-end workflow from builder → backtest → deploy

## Architecture

```
Frontend (React)  ←→  Backend (FastAPI)  ←→  Python Services
   ↓                       ↓                       ↓
localStorage          SQLite DB          backtesting.py
                                         yfinance API
```

## API Endpoints

- `POST /backtest` - Run backtest with strategy code
- `POST /deploy` - Deploy strategy for paper trading
- `DELETE /deploy/{id}` - Stop deployment
- `GET /deployments` - List active deployments
- `GET /deployment/{id}/history` - Get full deployment history
- `WebSocket /ws/{client_id}` - Real-time updates

## Features

### Strategy Builder
- Visual node-based interface
- Logic nodes: AND, OR
- Indicators: RSI, SMA, EMA, MACD, Bollinger Bands
- Price nodes: Open, High, Low, Close
- Actions: Buy/Sell (All Cash, Shares)

### Backtesting
- Configure ticker, dates, cash, commission
- Returns: return %, Sharpe ratio, max drawdown, trades, win rate
- Equity curve visualization

### Live Paper Trading
- Minute-level execution
- Real-time signals (BUY/SELL/HOLD)
- Position tracking with P&L
- Trade journal with full history

## Tech Stack

**Frontend**: React, TypeScript, Vite, TailwindCSS, React Flow, Zustand, Lightweight Charts  
**Backend**: FastAPI, WebSockets, SQLite  
**Trading**: backtesting.py, yfinance, pandas, numpy

## MVP Scope

**In**: Visual builder, backtesting, paper trading, real-time updates  
**Out**: Cloud storage, auth, file management, settings, production deployment

Built for local development and testing only.
