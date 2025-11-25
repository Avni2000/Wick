# Wick Trading Backend

FastAPI backend for strategy backtesting and live paper trading.

## Setup

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and add your Public.com credentials (for live trading)

4. Run the server:
```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --reload --port 8000
```

## API Endpoints

- `POST /backtest` - Run a backtest
- `POST /deploy` - Deploy a strategy for paper/live trading
- `DELETE /deploy/{id}` - Stop a deployment
- `GET /deployments` - List active deployments
- `WebSocket /ws` - Real-time trading updates
