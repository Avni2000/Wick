#!/usr/bin/env python3
"""
Backtest Runner for Wick Strategy Builder
Accepts strategy code and configuration via stdin, runs backtest, outputs JSON results
"""

import sys
import json
import yfinance as yf
from backtesting import Backtest, Strategy
import pandas as pd
try:
    import talib
except ImportError:
    talib = None

def main():
    try:
        # Read config from stdin
        input_data = sys.stdin.read()
        config = json.loads(input_data)
        
        ticker = config['ticker']
        start = config['start']
        end = config['end']
        strategy_code = config['strategy_code']
        
        # Download data
        data = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
        
        if data.empty:
            print(json.dumps({
                'error': f'No data available for {ticker} in the specified date range'
            }))
            sys.exit(1)
        
        # Ensure proper column names for backtesting.py (expects capitalized names)
        # Handle both single-level and multi-level column indices
        if isinstance(data.columns, pd.MultiIndex):
            # For multi-index, get the first level
            data.columns = data.columns.get_level_values(0)
        
        # Capitalize column names (handle both string and Index)
        data.columns = [str(col).capitalize() for col in data.columns]
        
        # Execute strategy code to define strategy class
        exec_globals = {'Strategy': Strategy, 'Backtest': Backtest, 'pd': pd}
        if talib:
            exec_globals['talib'] = talib
        exec(strategy_code, exec_globals)
        
        # Find the strategy class dynamically
        strategy_class = None
        for name, obj in exec_globals.items():
            if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy:
                strategy_class = obj
                break
        
        if not strategy_class:
            # Fallback to checking for specific names if dynamic lookup fails
            strategy_class = exec_globals.get('RSIStrategy') or exec_globals.get('FlowStrategy')

        if not strategy_class:
            print(json.dumps({'error': 'No valid Strategy class found in generated code'}))
            sys.exit(1)
        
        # Run backtest with trade finalization enabled
        bt = Backtest(data, strategy_class, cash=10000, commission=.002, finalize_trades=True)
        stats = bt.run()
        
        # Extract equity curve
        equity_curve = []
        if hasattr(stats, '_equity_curve') and stats._equity_curve is not None:
            equity_df = stats._equity_curve['Equity']
            for timestamp, value in equity_df.items():
                equity_curve.append({
                    'time': int(timestamp.timestamp()),
                    'value': float(value)
                })
        
        # Return results as JSON
        results = {
            'return': float(stats['Return [%]']),
            'sharpe': float(stats['Sharpe Ratio']) if pd.notna(stats['Sharpe Ratio']) else 0.0,
            'max_drawdown': float(stats['Max. Drawdown [%]']),
            'num_trades': int(stats['# Trades']),
            'win_rate': float(stats['Win Rate [%]']) if pd.notna(stats['Win Rate [%]']) else 0.0,
            'equity_curve': equity_curve
        }
        
        print(json.dumps(results))
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(json.dumps({
            'error': str(e),
            'traceback': error_details
        }), file=sys.stderr)
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
