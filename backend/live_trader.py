"""
Simplified Live Trader for web backend
Executes paper trading strategies with real-time signals
"""
import asyncio
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from backtesting import Strategy, Backtest
from typing import Dict, Optional
from trade_journal import TradeJournal


class LiveTrader:
    """Execute paper trading strategies with minute-level updates"""
    
    def __init__(self, deployment_id: str, strategy_code: str, ticker: str, 
                 interval: str = "1min", journal: TradeJournal = None):
        self.deployment_id = deployment_id
        self.strategy_code = strategy_code
        self.ticker = ticker
        self.interval = interval
        self.journal = journal or TradeJournal()
        self.running = False
        self.position_size = 10000.0  # $10k default position
        
    async def start(self, websocket_callback=None):
        """Start live trading loop"""
        self.running = True
        self.websocket_callback = websocket_callback
        
        while self.running:
            try:
                signal = await self.evaluate_strategy()
                
                if signal != "HOLD":
                    await self.execute_trade(signal)
                
                # Send update via WebSocket
                if self.websocket_callback:
                    await self.websocket_callback({
                        "type": "signal",
                        "deployment_id": self.deployment_id,
                        "ticker": self.ticker,
                        "signal": signal,
                        "timestamp": datetime.now().isoformat()
                    })
                
                # Wait based on interval
                await asyncio.sleep(self._get_sleep_seconds())
                
            except Exception as e:
                print(f"Error in live trading loop: {e}")
                self.journal.log_execution(self.deployment_id, "ERROR", str(e), success=False)
                await asyncio.sleep(60)
    
    def stop(self):
        """Stop the trading loop"""
        self.running = False
    
    async def evaluate_strategy(self) -> str:
        """
        Evaluate strategy against current market data
        Returns: "BUY", "SELL", or "HOLD"
        """
        # Fetch recent data
        data = self._fetch_data()
        
        # Load and run strategy
        strategy_class = self._load_strategy_class()
        bt = Backtest(data, strategy_class, cash=100000, commission=0.002)
        stats = bt.run()
        
        # Check current position
        position = self.journal.get_position(self.deployment_id)
        has_position = position and position["quantity"] > 0
        
        # Analyze trades to determine signal
        trades = stats._trades
        
        if len(trades) > 0:
            # Check if last trade is still open (exit time is NaN or None)
            last_trade = trades.iloc[-1]
            is_trade_open = pd.isna(last_trade.get('ExitTime'))
            
            if is_trade_open and not has_position:
                return "BUY"
            elif not is_trade_open and has_position:
                return "SELL"
        
        return "HOLD"
    
    async def execute_trade(self, signal: str):
        """Execute paper trade"""
        current_price = self._get_current_price()
        
        if signal == "BUY":
            quantity = self.position_size / current_price
            
            order_id = self.journal.log_order(
                deployment_id=self.deployment_id,
                symbol=self.ticker,
                side="BUY",
                order_type="MARKET",
                quantity=quantity,
                amount=self.position_size,
                status="filled",
                paper_trade=True
            )
            
            self.journal.update_order_status(order_id, "filled", current_price)
            self.journal.update_position(self.deployment_id, self.ticker, quantity, current_price)
            
            message = f"BUY {quantity:.4f} shares @ ${current_price:.2f}"
            self.journal.log_execution(self.deployment_id, "BUY", message, success=True)
            
            if self.websocket_callback:
                await self.websocket_callback({
                    "type": "order_filled",
                    "side": "BUY",
                    "quantity": quantity,
                    "price": current_price,
                    "ticker": self.ticker
                })
        
        elif signal == "SELL":
            position = self.journal.get_position(self.deployment_id)
            if position:
                quantity = position["quantity"]
                
                order_id = self.journal.log_order(
                    deployment_id=self.deployment_id,
                    symbol=self.ticker,
                    side="SELL",
                    order_type="MARKET",
                    quantity=quantity,
                    status="filled",
                    paper_trade=True
                )
                
                self.journal.update_order_status(order_id, "filled", current_price)
                self.journal.update_position(self.deployment_id, self.ticker, 0)
                
                pnl = (current_price - position["avg_price"]) * quantity
                message = f"SELL {quantity:.4f} shares @ ${current_price:.2f} (P&L: ${pnl:.2f})"
                self.journal.log_execution(self.deployment_id, "SELL", message, success=True)
                
                if self.websocket_callback:
                    await self.websocket_callback({
                        "type": "order_filled",
                        "side": "SELL",
                        "quantity": quantity,
                        "price": current_price,
                        "pnl": pnl,
                        "ticker": self.ticker
                    })
    
    def _fetch_data(self) -> pd.DataFrame:
        """Fetch recent market data"""
        end = datetime.now()
        start = end - timedelta(days=60)
        
        data = yf.download(self.ticker, start=start, end=end, progress=False)
        
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        
        data = data[['Open', 'High', 'Low', 'Close', 'Volume']]
        return data.dropna()
    
    def _load_strategy_class(self):
        """Load strategy class from code"""
        exec_globals = {'Strategy': Strategy, 'pd': pd}
        exec(self.strategy_code, exec_globals)
        
        # Find strategy class
        for name, obj in exec_globals.items():
            if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy:
                return obj
        
        raise ValueError("No Strategy class found in strategy code")
    
    def _get_current_price(self) -> float:
        """Get current market price"""
        ticker = yf.Ticker(self.ticker)
        data = ticker.history(period="1d", interval="1m")
        return float(data['Close'].iloc[-1])
    
    def _get_sleep_seconds(self) -> int:
        """Get sleep duration based on interval"""
        intervals = {
            "1min": 60,
            "5min": 300,
            "15min": 900,
            "1h": 3600
        }
        return intervals.get(self.interval, 60)
