from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from typing import Optional, Dict, List
import asyncio
from live_trader import LiveTrader
from trade_journal import TradeJournal
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

app = FastAPI(title="Wick Trading API")
journal = TradeJournal()

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class BacktestConfig(BaseModel):
    strategy_code: str
    ticker: str
    start_date: str
    end_date: str
    cash: float = 1000000.0
    commission: float = 0.002
    interval: str = None  # Optional: if not provided, optimal is selected automatically

class DeploymentConfig(BaseModel):
    strategy_code: str
    ticker: str
    interval: str  # e.g., "1min", "5min", "1h"
    mode: str = "paper"  # paper or live

# In-memory active deployments and traders
active_deployments: Dict[str, LiveTrader] = {}
websocket_connections: Dict[str, WebSocket] = {}

@app.get("/")
async def root():
    return {"status": "Wick Trading API", "version": "1.0.0"}


@app.get("/chart/{ticker}")
async def get_chart_data(
    ticker: str,
    period: str = Query(default="1y", description="Valid periods: 1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max"),
    interval: str = Query(default="1d", description="Valid intervals: 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo")
):
    """Fetch OHLCV chart data for a ticker using yfinance."""
    
    # Map intervals to their maximum allowed periods for yfinance
    interval_max_periods = {
        '1m': '7d',
        '2m': '60d',
        '5m': '60d',
        '15m': '60d',
        '30m': '60d',
        '60m': '730d',
        '1h': '730d',
        '1d': 'max',
        '5d': 'max',
        '1wk': 'max',
        '1mo': 'max',
        '3mo': 'max',
    }
    
    # Period ordering for capping
    period_ordering = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    
    # Auto-cap period if it exceeds the maximum for this interval
    max_period_for_interval = interval_max_periods.get(interval, 'max')
    if max_period_for_interval != 'max' and period in period_ordering:
        max_idx = period_ordering.index(max_period_for_interval) if max_period_for_interval in period_ordering else len(period_ordering) - 1
        current_idx = period_ordering.index(period) if period in period_ordering else -1
        
        if current_idx > max_idx:
            period = max_period_for_interval
    
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval=interval)
        
        if df.empty:
            # Try to provide a helpful error message
            return {
                "success": False,
                "error": f"No data available for {ticker.upper()} with {interval} interval and {period} period. This ticker may be delisted or invalid."
            }
        
        # Convert to list of OHLCV candles for lightweight-charts
        candles = []
        for idx, row in df.iterrows():
            # Convert timestamp to Unix seconds
            timestamp = int(idx.timestamp())
            candles.append({
                "time": timestamp,
                "open": round(row["Open"], 4),
                "high": round(row["High"], 4),
                "low": round(row["Low"], 4),
                "close": round(row["Close"], 4),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0
            })
        
        # Get stock info for display
        info = stock.info
        stock_info = {
            "name": info.get("shortName", ticker),
            "currency": info.get("currency", "USD"),
            "exchange": info.get("exchange", ""),
            "marketCap": info.get("marketCap"),
            "previousClose": info.get("previousClose"),
        }
        
        return {
            "success": True,
            "ticker": ticker.upper(),
            "info": stock_info,
            "candles": candles
        }
    except Exception as e:
        error_msg = str(e)
        # Filter out verbose yfinance warnings
        if "possibly delisted" in error_msg.lower() or "no price data" in error_msg.lower():
            return {
                "success": False,
                "error": f"Invalid ticker '{ticker.upper()}' or no data available. Please check the symbol and try again."
            }
        return {"success": False, "error": f"Failed to fetch data: {error_msg}"}


@app.get("/search")
async def search_tickers(q: str = Query(..., min_length=1, description="Search query")):
    """Search for tickers by name or symbol."""
    try:
        # Use yfinance's search functionality
        import requests
        
        # Yahoo Finance search API
        url = f"https://query2.finance.yahoo.com/v1/finance/search"
        params = {
            "q": q,
            "quotesCount": 10,
            "newsCount": 0,
            "enableFuzzyQuery": True,
            "quotesQueryId": "tss_match_phrase_query"
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        
        response = requests.get(url, params=params, headers=headers)
        data = response.json()
        
        results = []
        for quote in data.get("quotes", []):
            if quote.get("quoteType") in ["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY"]:
                results.append({
                    "symbol": quote.get("symbol"),
                    "name": quote.get("shortname") or quote.get("longname", ""),
                    "exchange": quote.get("exchange", ""),
                    "type": quote.get("quoteType", "")
                })
        
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "error": str(e), "results": []}

@app.post("/backtest")
async def run_backtest(config: BacktestConfig):
    """Execute a backtest with the given strategy and configuration."""
    from backtest_runner import run_backtest
    
    try:
        results = run_backtest(
            ticker=config.ticker,
            start=config.start_date,
            end=config.end_date,
            strategy_code=config.strategy_code,
            cash=config.cash,
            commission=config.commission,
            interval=config.interval
        )
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "error": str(e)}
@app.post("/deploy")
async def deploy_strategy(config: DeploymentConfig):
    """Deploy a strategy for live/paper trading."""
    deployment_id = f"{config.ticker}_{config.interval}"
    
    # Stop existing deployment if it exists
    if deployment_id in active_deployments:
        trader = active_deployments[deployment_id]
        trader.stop()
        journal.update_deployment_status(deployment_id, "stopped")
        del active_deployments[deployment_id]
    
    # Create deployment in database
    journal.create_deployment(
        deployment_id=deployment_id,
        strategy_name="WebStrategy",
        ticker=config.ticker,
        mode=config.mode
    )
    
    # Create and start live trader
    trader = LiveTrader(
        deployment_id=deployment_id,
        strategy_code=config.strategy_code,
        ticker=config.ticker,
        interval=config.interval,
        journal=journal
    )
    
    # Start trading in background
    asyncio.create_task(trader.start())
    active_deployments[deployment_id] = trader
    
    return {
        "success": True,
        "deployment_id": deployment_id,
        "message": "Strategy deployed successfully"
    }

@app.delete("/deploy/{deployment_id}")
async def stop_deployment(deployment_id: str):
    """Stop an active deployment."""
    if deployment_id in active_deployments:
        trader = active_deployments[deployment_id]
        trader.stop()
        journal.update_deployment_status(deployment_id, "stopped")
        del active_deployments[deployment_id]
        return {"success": True, "message": "Deployment stopped"}
    return {"success": False, "error": "Deployment not found"}

@app.get("/deployments")
async def get_deployments():
    """Get all active deployments."""
    result = {}
    for deployment_id, trader in active_deployments.items():
        history = journal.get_deployment_history(deployment_id)
        result[deployment_id] = {
            "ticker": trader.ticker,
            "interval": trader.interval,
            "status": "running",
            "position": history["position"],
            "recent_logs": history["logs"][:5]
        }
    return {"deployments": result}

@app.get("/deployment/{deployment_id}/history")
async def get_deployment_history(deployment_id: str):
    """Get full history for a deployment."""
    history = journal.get_deployment_history(deployment_id)
    return {"success": True, "history": history}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket for real-time trading updates."""
    await websocket.accept()
    websocket_connections[client_id] = websocket
    
    async def send_update(data: dict):
        """Callback for traders to send updates"""
        try:
            await websocket.send_json(data)
        except:
            pass
    
    # Attach callback to all active traders
    for trader in active_deployments.values():
        trader.websocket_callback = send_update
    
    try:
        while True:
            # Keep connection alive and listen for client messages
            data = await websocket.receive_text()
            # Handle any client requests if needed
            
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected")
        if client_id in websocket_connections:
            del websocket_connections[client_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
