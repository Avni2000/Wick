"""
MACD Trend Following Strategy

The MACD (Moving Average Convergence Divergence) is a trend-following momentum indicator.
It shows the relationship between two moving averages of a security's price.

Components:
- MACD Line: 12-day EMA - 26-day EMA
- Signal Line: 9-day EMA of MACD Line
- Histogram: MACD Line - Signal Line

BUY SIGNAL: When MACD line crosses above signal line
SELL SIGNAL: When MACD line crosses below signal line

Parameters you can customize:
- fast_period: Fast EMA period (default: 12)
- slow_period: Slow EMA period (default: 26)
- signal_period: Signal line EMA period (default: 9)

... or anything, really! 
"""

from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd


def MACD(close, fast=12, slow=26, signal=9):
    """Calculate MACD, Signal line, and Histogram"""
    fast_ema = close.ewm(span=fast).mean()
    slow_ema = close.ewm(span=slow).mean()
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=signal).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


class MACDTrendFollowing(Strategy):
    # Define parameters
    fast_period = 12
    slow_period = 26
    signal_period = 9
    
    def init(self):
        # Calculate MACD components
        close = pd.Series(self.data.Close, index=self.data.index)
        macd, signal, histogram = MACD(close, self.fast_period, self.slow_period, self.signal_period)
        
        self.macd = self.I(lambda: macd)
        self.signal = self.I(lambda: signal)
    
    def next(self):
        # If we don't have a position
        if not self.position:
            # Buy when MACD crosses above signal line (bullish trend)
            if crossover(self.macd, self.signal):
                self.buy()
        
        # If we have a position
        else:
            # Sell when MACD crosses below signal line (bearish trend)
            if crossover(self.signal, self.macd):
                self.position.close()
