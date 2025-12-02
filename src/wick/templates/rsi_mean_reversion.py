"""
RSI Mean Reversion Strategy

This strategy uses the Relative Strength Index (RSI) to identify overbought 
and oversold conditions, then trades the expected reversion to the mean.

RSI ranges from 0 to 100:
- RSI > 70: Overbought (potential sell signal)
- RSI < 30: Oversold (potential buy signal)

BUY SIGNAL: When RSI crosses below the oversold threshold (30)
SELL SIGNAL: When RSI crosses above the overbought threshold (70)

Parameters you can customize:
- rsi_period: Period for RSI calculation (default: 14)
- oversold_threshold: RSI level considered oversold (default: 30)
- overbought_threshold: RSI level considered overbought (default: 70)

... or anything, really! 
"""

from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd


def RSI(series, period=14):
    """Calculate Relative Strength Index"""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


class RSIMeanReversion(Strategy):
    # Define parameters
    rsi_period = 14
    oversold_threshold = 30
    overbought_threshold = 70
    
    def init(self):
        # Calculate RSI
        close = pd.Series(self.data.Close)
        self.rsi = self.I(RSI, close, self.rsi_period)
    
    def next(self):
        # If we don't have a position
        if not self.position:
            # Buy when RSI crosses below oversold threshold (potential bounce)
            if self.rsi[-1] < self.oversold_threshold:
                self.buy()
        
        # If we have a position
        else:
            # Sell when RSI crosses above overbought threshold
            if self.rsi[-1] > self.overbought_threshold:
                self.position.close()
