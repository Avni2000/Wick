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
from datetime import datetime

# Interval options with their constraints (must match WickChart.tsx INTERVAL_OPTIONS)
INTERVAL_CONFIG = [
    {'value': '1m', 'maxPeriod': '7d', 'days': 7},
    {'value': '2m', 'maxPeriod': '60d', 'days': 60},
    {'value': '5m', 'maxPeriod': '60d', 'days': 60},
    {'value': '15m', 'maxPeriod': '60d', 'days': 60},
    {'value': '30m', 'maxPeriod': '60d', 'days': 60},
    {'value': '1h', 'maxPeriod': '730d', 'days': 730},
    {'value': '1d', 'maxPeriod': 'max', 'days': float('inf')},
    {'value': '1wk', 'maxPeriod': 'max', 'days': float('inf')},
    {'value': '1mo', 'maxPeriod': 'max', 'days': float('inf')},
]


def get_optimal_interval(start: str, end: str, target_interval: str = None) -> str:
    """
    Select the optimal interval for the given date range to minimize granularity.
    
    Args:
        start: Start date (YYYY-MM-DD)
        end: End date (YYYY-MM-DD)
        target_interval: If specified, use this interval if it supports the range
    
    Returns:
        The optimal interval string (e.g., '1h', '1d', '1wk')
    """
    try:
        start_date = datetime.strptime(start, '%Y-%m-%d')
        end_date = datetime.strptime(end, '%Y-%m-%d')
        days_diff = (end_date - start_date).days
    except ValueError:
        return '1d'  # Default to daily if parsing fails
    
    # If target interval is specified, verify it supports the range
    if target_interval:
        for config in INTERVAL_CONFIG:
            if config['value'] == target_interval:
                if days_diff <= config['days']:
                    return target_interval
                break
    
    # Find the interval with finest granularity that supports the date range
    # Iterate through intervals from finest to coarsest
    best_interval = '1mo'  # Default to monthly
    for config in INTERVAL_CONFIG:
        if days_diff <= config['days']:
            best_interval = config['value']
            break  # Found the finest interval that fits
    
    return best_interval


def run_backtest(ticker: str, start: str, end: str, strategy_code: str, 
                 cash: float = 1000000.0, commission: float = 0.002, 
                 interval: str = None) -> dict:
    """
    Run a backtest with the given parameters.
    
    Args:
        ticker: Stock symbol
        start: Start date (YYYY-MM-DD)
        end: End date (YYYY-MM-DD)
        strategy_code: Python strategy code to execute
        cash: Initial cash amount
        commission: Commission percentage (0.002 = 0.2%)
        interval: Data interval (e.g., '1h', '1d', '1wk'). If None, optimal is selected.
    
    Returns:
        Dictionary with backtest results
    """
    try:
        # Get optimal interval if not specified
        if interval is None:
            interval = get_optimal_interval(start, end)
        else:
            # Verify requested interval supports the date range
            interval = get_optimal_interval(start, end, target_interval=interval)
        
        # Download data with the selected interval
        data = yf.download(ticker, start=start, end=end, interval=interval, progress=False)
        
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
        
        # Extract trade details
        trades = []
        if hasattr(stats, '_trades') and stats._trades is not None and len(stats._trades) > 0:
            for _, trade in stats._trades.iterrows():
                entry_time = trade['EntryTime']
                exit_time = trade['ExitTime']
                
                # Format timestamps
                entry_str = entry_time.strftime('%Y-%m-%d %H:%M') if hasattr(entry_time, 'strftime') else str(entry_time)
                exit_str = exit_time.strftime('%Y-%m-%d %H:%M') if hasattr(exit_time, 'strftime') else str(exit_time)
                
                # Convert to unix timestamps for chart plotting
                entry_unix = int(entry_time.timestamp()) if hasattr(entry_time, 'timestamp') else 0
                exit_unix = int(exit_time.timestamp()) if hasattr(exit_time, 'timestamp') else 0
                
                trades.append({
                    'entry_time': entry_str,
                    'entry_unix': entry_unix,
                    'exit_time': exit_str,
                    'exit_unix': exit_unix,
                    'entry_price': float(trade['EntryPrice']),
                    'exit_price': float(trade['ExitPrice']),
                    'size': int(trade['Size']),
                    'pnl': float(trade['PnL']),
                    'return_pct': float(trade['ReturnPct']) * 100,
                    'entry_bar': int(trade['EntryBar']),
                    'exit_bar': int(trade['ExitBar']),
                    'duration': str(trade['Duration']) if pd.notna(trade['Duration']) else 'N/A'
                })

        # Extract equity curve with dates
        equity_curve_df = stats._equity_curve
        equity_curve = []
        for idx, equity_value in equity_curve_df['Equity'].items():
            # Convert timestamp to ISO format string
            date_str = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)
            equity_curve.append({
                'time': date_str,
                'value': float(equity_value)
            })
        
        # Calculate start and end values
        start_value = float(equity_curve_df['Equity'].iloc[0]) if len(equity_curve_df) > 0 else cash
        end_value = float(equity_curve_df['Equity'].iloc[-1]) if len(equity_curve_df) > 0 else cash
        
        # Return formatted results
        return {
            'return_pct': float(stats['Return [%]']),
            'sharpe_ratio': float(stats['Sharpe Ratio']) if not pd.isna(stats['Sharpe Ratio']) else 0.0,
            'max_drawdown': float(stats['Max. Drawdown [%]']),
            'num_trades': int(stats['# Trades']),
            'win_rate': float(stats['Win Rate [%]']) if not pd.isna(stats['Win Rate [%]']) else 0.0,
            'equity_curve': equity_curve,
            'start_value': start_value,
            'end_value': end_value,
            'trades': trades,
            'interval': interval  # Include the interval used for reference
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
