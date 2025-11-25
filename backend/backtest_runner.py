"""
Backtest runner - migrated from python/backtest_runner.py
Executes backtests using the backtesting.py library
"""
import json
import sys
from backtesting import Backtest, Strategy
import yfinance as yf
import pandas as pd
import numpy as np


def run_backtest(ticker: str, start: str, end: str, strategy_code: str, 
                 cash: float = 1000000.0, commission: float = 0.002) -> dict:
    """
    Run a backtest with the given parameters.
    
    Args:
        ticker: Stock symbol
        start: Start date (YYYY-MM-DD)
        end: End date (YYYY-MM-DD)
        strategy_code: Python strategy code to execute
        cash: Initial cash amount
        commission: Commission percentage (0.002 = 0.2%)
    
    Returns:
        Dictionary with backtest results
    """
    try:
        # Download data
        data = yf.download(ticker, start=start, end=end, progress=False)
        
        if data.empty:
            raise ValueError(f"No data available for {ticker} between {start} and {end}")
        
        # Prepare data for backtesting.py
        data.columns = [col[0] if isinstance(col, tuple) else col for col in data.columns]
        data = data[['Open', 'High', 'Low', 'Close', 'Volume']]
        
        # Execute strategy code to create Strategy class
        namespace = {
            'Strategy': Strategy,
            'pd': pd,
            'np': np
        }
        
        # Try to import TA-Lib if available
        try:
            import talib
            namespace['talib'] = talib
        except ImportError:
            pass  # TA-Lib is optional
        
        exec(strategy_code, namespace)
        
        # Get the strategy class (should be named 'WickStrategy')
        StrategyClass = namespace.get('WickStrategy')
        if not StrategyClass:
            raise ValueError("Strategy code must define a 'WickStrategy' class")
        
        # Run backtest
        bt = Backtest(data, StrategyClass, cash=cash, commission=commission)
        stats = bt.run()
        
        # Extract equity curve
        equity_curve = stats._equity_curve['Equity'].tolist()
        
        # Return formatted results
        return {
            'return': float(stats['Return [%]']),
            'sharpe_ratio': float(stats['Sharpe Ratio']) if not pd.isna(stats['Sharpe Ratio']) else 0.0,
            'max_drawdown': float(stats['Max. Drawdown [%]']),
            'num_trades': int(stats['# Trades']),
            'win_rate': float(stats['Win Rate [%]']) if not pd.isna(stats['Win Rate [%]']) else 0.0,
            'equity_curve': equity_curve
        }
        
    except Exception as e:
        raise Exception(f"Backtest failed: {str(e)}")


if __name__ == "__main__":
    # For standalone testing
    config = json.loads(sys.stdin.read())
    result = run_backtest(
        ticker=config['ticker'],
        start=config['start'],
        end=config['end'],
        strategy_code=config['strategy_code'],
        cash=config.get('cash', 1000000.0),
        commission=config.get('commission', 0.002)
    )
    print(json.dumps(result))
