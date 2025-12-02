"""
Simple Moving Average (SMA) Crossover Strategy

This is a classic trend-following strategy that uses two moving averages:
- Fast MA (shorter period) - reacts quickly to price changes
- Slow MA (longer period) - filters out noise

BUY SIGNAL: When fast MA crosses above slow MA (golden cross)
SELL SIGNAL: When fast MA crosses below slow MA (death cross)

Parameters you can customize:
- fast_period: Period for the fast moving average (default: 10)
- slow_period: Period for the slow moving average (default: 20)

... or anything, really! 
"""

from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd


class SMAcrossover(Strategy):
    # Define parameters with default values
    fast_period = 10
    slow_period = 20
    
    def init(self):
        # Calculate moving averages
        # self.data.Close is the pandas Series of closing prices
        self.fast_ma = self.I(lambda: pd.Series(self.data.Close).rolling(self.fast_period).mean())
        self.slow_ma = self.I(lambda: pd.Series(self.data.Close).rolling(self.slow_period).mean())
    
    def next(self):
        # If we don't already have a position
        if not self.position:
            # Buy when fast MA crosses above slow MA
            if crossover(self.fast_ma, self.slow_ma):
                self.buy()
        
        # If we have a position
        else:
            # Sell when fast MA crosses below slow MA
            if crossover(self.slow_ma, self.fast_ma):
                self.position.close()
