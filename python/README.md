# Python Backtesting Backend

This directory contains the Python backend for running strategy backtests.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

Note: TA-Lib requires system-level dependencies. On Ubuntu/Debian:
```bash
sudo apt-get install ta-lib
```

On macOS:
```bash
brew install ta-lib
```

## Usage

The backtest runner accepts JSON configuration via stdin and outputs JSON results:

```bash
echo '{
  "ticker": "AAPL",
  "start": "2020-01-01",
  "end": "2024-01-01",
  "strategy_code": "..."
}' | python3 backtest_runner.py
```

## Output Format

Success:
```json
{
  "return": 45.2,
  "sharpe": 1.23,
  "max_drawdown": -12.4,
  "num_trades": 47,
  "win_rate": 58.0,
  "equity_curve": [...]
}
```

Error:
```json
{
  "error": "Error message here"
}
```
