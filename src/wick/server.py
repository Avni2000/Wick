"""
Wick Server - FastAPI server with static file serving for the GUI
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
import json
from typing import Optional, Dict, List
import asyncio
from pathlib import Path
import os

from wick.backtest_runner import run_backtest
from wick.live_trader import LiveTrader
from wick.trade_journal import TradeJournal
from wick import file_manager
from wick import template_manager
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta


# Get the directory where static files are stored
PACKAGE_DIR = Path(__file__).parent
STATIC_DIR = PACKAGE_DIR / "static"


app = FastAPI(title="Wick Trading API")
journal = TradeJournal()


# CORS for development (allows Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
    interval: str = None


class DeploymentConfig(BaseModel):
    strategy_code: str
    ticker: str
    interval: str
    mode: str = "paper"


class ConfigUpdate(BaseModel):
    api_key: str


class StrategyFileCreate(BaseModel):
    filename: str
    content: str
    description: str = ""


class StrategyFileBacktest(BaseModel):
    filename: str
    ticker: str
    start_date: str
    end_date: str
    cash: float = 1000000.0
    commission: float = 0.002
    interval: str = None


# In-memory active deployments and traders
active_deployments: Dict[str, LiveTrader] = {}
websocket_connections: Dict[str, WebSocket] = {}


def get_config_path() -> Path:
    """Get the path to the configuration file."""
    config_dir = Path.home() / ".wick"
    config_dir.mkdir(exist_ok=True)
    return config_dir / "config.json"


def load_config() -> dict:
    """Load configuration from file."""
    config_path = get_config_path()
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    return {}


def save_config(config: dict):
    """Save configuration to file."""
    config_path = get_config_path()
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)


@app.get("/api")
async def api_root():
    return {"status": "Wick Trading API", "version": "0.1.0"}


@app.get("/api/chart/{ticker}")
async def get_chart_data(
    ticker: str,
    period: str = Query(default="1y", description="Valid periods: 1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max"),
    interval: str = Query(default="1d", description="Valid intervals: 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo")
):
    """Fetch OHLCV chart data for a ticker using yfinance."""
    
    interval_max_periods = {
        '1m': '7d', '2m': '60d', '5m': '60d', '15m': '60d', '30m': '60d',
        '60m': '730d', '1h': '730d', '1d': 'max', '5d': 'max',
        '1wk': 'max', '1mo': 'max', '3mo': 'max',
    }
    
    period_ordering = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    
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
            return {
                "success": False,
                "error": f"No data available for {ticker.upper()} with {interval} interval and {period} period."
            }
        
        candles = []
        for idx, row in df.iterrows():
            timestamp = int(idx.timestamp())
            candles.append({
                "time": timestamp,
                "open": round(row["Open"], 4),
                "high": round(row["High"], 4),
                "low": round(row["Low"], 4),
                "close": round(row["Close"], 4),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0
            })
        
        info = stock.info
        stock_info = {
            "name": info.get("shortName", ticker),
            "currency": info.get("currency", "USD"),
            "exchange": info.get("exchange", ""),
            "marketCap": info.get("marketCap"),
            "previousClose": info.get("previousClose"),
        }
        
        return {"success": True, "ticker": ticker.upper(), "info": stock_info, "candles": candles}
    except Exception as e:
        error_msg = str(e)
        if "possibly delisted" in error_msg.lower() or "no price data" in error_msg.lower():
            return {
                "success": False,
                "error": f"Invalid ticker '{ticker.upper()}' or no data available."
            }
        return {"success": False, "error": f"Failed to fetch data: {error_msg}"}


@app.get("/api/search")
async def search_tickers(q: str = Query(..., min_length=1, description="Search query")):
    """Search for tickers by name or symbol."""
    try:
        import requests
        
        url = f"https://query2.finance.yahoo.com/v1/finance/search"
        params = {
            "q": q, "quotesCount": 10, "newsCount": 0,
            "enableFuzzyQuery": True, "quotesQueryId": "tss_match_phrase_query"
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


@app.post("/api/backtest")
async def run_backtest_endpoint(config: BacktestConfig):
    """Execute a backtest with the given strategy and configuration."""
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


@app.get("/api/config")
async def get_config():
    """Get current configuration (API key will be masked)."""
    config = load_config()
    masked_config = {}
    
    if 'api_key' in config and config['api_key']:
        # Mask the API key for display
        key = config['api_key']
        if len(key) > 8:
            masked_config['api_key'] = key[:4] + "*" * (len(key) - 8) + key[-4:]
        else:
            masked_config['api_key'] = "*" * len(key)
    
    return {"success": True, "config": masked_config}


@app.post("/api/config")
async def update_config(config_update: ConfigUpdate):
    """Update API configuration."""
    try:
        config = load_config()
        config['api_key'] = config_update.api_key
        save_config(config)
        return {"success": True, "message": "Configuration updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Strategy File Management Endpoints

@app.get("/api/strategies")
async def list_strategies():
    """List all custom strategy files."""
    try:
        files = file_manager.list_strategy_files()
        return {"success": True, "files": files}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/strategies")
async def save_strategy(strategy: StrategyFileCreate):
    """Create or update a strategy file."""
    try:
        result = file_manager.save_strategy_file(
            strategy.filename, 
            strategy.content, 
            strategy.description
        )
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/strategies/templates")
async def list_templates():
    """List available strategy templates."""
    try:
        templates = template_manager.list_templates()
        return {"success": True, "templates": templates}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/strategies/templates/{filename}")
async def get_template(filename: str):
    """Get strategy template content."""
    try:
        content = template_manager.load_template(filename)
        return {"success": True, "content": content}
    except FileNotFoundError:
        return {"success": False, "error": "Template not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/strategies/{filename}")
async def get_strategy(filename: str):
    """Get strategy file content."""
    try:
        content = file_manager.load_strategy_file(filename)
        if content is None:
            return {"success": False, "error": "File not found"}
        return {"success": True, "content": content}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/api/strategies/{filename}")
async def delete_strategy(filename: str):
    """Delete a strategy file."""
    try:
        success = file_manager.delete_strategy_file(filename)
        if not success:
            return {"success": False, "error": "File not found"}
        return {"success": True, "message": "File deleted successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/strategies/{filename}/validate")
async def validate_strategy(filename: str):
    """Validate a strategy file."""
    try:
        content = file_manager.load_strategy_file(filename)
        if content is None:
            return {"success": False, "error": "File not found"}
        
        result = file_manager.validate_strategy_file(content)
        return {"success": True, "validation": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/strategies/backtest")
async def backtest_strategy_file(config: StrategyFileBacktest):
    """Run backtest for a strategy file."""
    try:
        # Load strategy content
        content = file_manager.load_strategy_file(config.filename)
        if content is None:
            # Check if it's a template
            try:
                content = template_manager.load_template(config.filename)
            except FileNotFoundError:
                return {"success": False, "error": "File not found"}
        
        # Run backtest
        results = run_backtest(
            ticker=config.ticker,
            start=config.start_date,
            end=config.end_date,
            strategy_code=content,
            cash=config.cash,
            commission=config.commission,
            interval=config.interval
        )
        
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/deploy")
async def deploy_strategy(config: DeploymentConfig):
    """Deploy a strategy for live/paper trading."""
    deployment_id = f"{config.ticker}_{config.interval}"
    
    if deployment_id in active_deployments:
        trader = active_deployments[deployment_id]
        trader.stop()
        journal.update_deployment_status(deployment_id, "stopped")
        del active_deployments[deployment_id]
    
    journal.create_deployment(
        deployment_id=deployment_id,
        strategy_name="WebStrategy",
        ticker=config.ticker,
        mode=config.mode
    )
    
    # Load API key from config if in live mode
    api_key = None
    if config.mode == "live":
        stored_config = load_config()
        api_key = stored_config.get('api_key')
        if not api_key:
            return {
                "success": False,
                "error": "API key not configured. Run 'wick config --set-api-key YOUR_KEY' or configure it in the GUI."
            }
    
    trader = LiveTrader(
        deployment_id=deployment_id,
        strategy_code=config.strategy_code,
        ticker=config.ticker,
        interval=config.interval,
        journal=journal,
        mode=config.mode,
        api_key=api_key
    )
    
    asyncio.create_task(trader.start())
    active_deployments[deployment_id] = trader
    
    return {
        "success": True,
        "deployment_id": deployment_id,
        "message": "Strategy deployed successfully"
    }


@app.delete("/api/deploy/{deployment_id}")
async def stop_deployment(deployment_id: str):
    """Stop an active deployment."""
    if deployment_id in active_deployments:
        trader = active_deployments[deployment_id]
        trader.stop()
        journal.update_deployment_status(deployment_id, "stopped")
        del active_deployments[deployment_id]
        return {"success": True, "message": "Deployment stopped"}
    return {"success": False, "error": "Deployment not found"}


@app.get("/api/deployments")
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


@app.get("/api/deployment/{deployment_id}/history")
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
        try:
            await websocket.send_json(data)
        except:
            pass
    
    for trader in active_deployments.values():
        trader.websocket_callback = send_update
    
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        if client_id in websocket_connections:
            del websocket_connections[client_id]


# Serve static files if they exist (production mode)
if STATIC_DIR.exists():
    # Mount static assets
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA for any non-API route."""
        # Don't intercept API or WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            return {"error": "Not found"}
        
        # Try to serve the exact file
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Fall back to index.html for SPA routing
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        return HTMLResponse("<h1>Wick GUI not found</h1><p>Static files are missing.</p>", status_code=404)
