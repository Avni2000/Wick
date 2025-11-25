from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from typing import Optional, Dict
import asyncio
from live_trader import LiveTrader
from trade_journal import TradeJournal

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
            commission=config.commission
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
