# Plan: Wick Web MVP - No-Code Strategy Builder

Transform VS Code extension to standalone web app. Focus: visual strategy builder, backtesting, and live paper trading. No cloud, auth, or file management.

## Tech Stack
- **Frontend:** React + TypeScript, Zustand, TailwindCSS, React Flow, TradingView Charts, Vite
- **Backend:** FastAPI, WebSockets, SQLite, yfinance, backtesting.py

## Core Features

### 1. Visual Strategy Builder
- React Flow with all node types: Logic (AND/OR), Indicators (RSI/SMA/EMA/MACD/BB), Price (OHLC), Actions (Buy/Sell)
- Real-time Python code generation
- localStorage for state (no file saving)

### 2. Backtesting
- FastAPI endpoint: POST `/backtest` with strategy code + config (ticker, dates, cash, commission)
- Use existing `backtest_runner.py` logic
- Return: return %, Sharpe ratio, max drawdown, trades, win rate, equity curve
- Display results in UI with charts

### 3. Live Paper Trading
- FastAPI endpoint: POST `/deploy` with strategy + ticker + interval
- Use existing `live_trader.py` with minute-level support
- WebSocket for real-time signals (BUY/SELL/HOLD), positions, P&L
- SQLite trade journal (deployments, orders, positions, logs)

### 4. UI Layout
- Split view: Strategy Builder (left) + Chart/Results (right)
- Minimal black/grey design
- Tabs: Builder, Backtest Results, Live Dashboard

## MVP Scope
**In:** Visual builder, code generation, backtesting, paper trading, real-time updates, trade journal  
**Out:** Cloud storage, auth, file management, settings panel, AI integration, production deployment