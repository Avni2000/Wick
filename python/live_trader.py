#!/usr/bin/env python3
"""
Live Trader
Main engine for executing trading strategies in real-time or paper mode
Uses backtesting.py Strategy classes for consistency with backtesting
"""

import sys
import json
import argparse
import yfinance as yf
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Optional
from backtesting import Strategy, Backtest
import os
import time
import warnings
from dotenv import load_dotenv

# Suppress backtesting.py warnings about open trades
warnings.filterwarnings("ignore", category=UserWarning, module="backtesting")

from public_api_client import PublicAPIClient
from trade_journal import TradeJournal


class LiveTrader:
    """Executes trading strategies against live market data using backtesting.py Strategy classes"""
    
    def __init__(self, config_path: str):
        """
        Initialize live trader with configuration file
        
        Args:
            config_path: Path to deployment configuration JSON file
        """
        self.config_path = config_path
        self.config = self._load_config()
        self.journal = TradeJournal()
        
        # Load environment variables
        env_path = Path.home() / "source" / "repos" / "strategies" / ".env"
        if not env_path.exists():
            # Try local .env if strategies dir doesn't exist
            env_path = Path(__file__).parent / ".env"
        load_dotenv(env_path)
        
        # Initialize API client if in live mode
        self.api_client: Optional[PublicAPIClient] = None
        if self.config["mode"] == "live":
            secret = os.getenv("PUBLIC_SECRET")
            if not secret:
                raise ValueError("PUBLIC_SECRET not found in .env file")
            self.api_client = PublicAPIClient(secret)
    
    def _load_config(self) -> Dict:
        """Load deployment configuration from JSON file"""
        with open(self.config_path, 'r') as f:
            config = json.load(f)
        
        # Validate required fields
        required = ["deployment_id", "strategy_name", "ticker", "mode"]
        for field in required:
            if field not in config:
                raise ValueError(f"Missing required config field: {field}")
        
        # Must have either strategy_code or strategy_file
        if "strategy_code" not in config and "strategy_file" not in config:
            raise ValueError("Config must contain either 'strategy_code' or 'strategy_file'")
        
        # If strategy_file is provided, read it
        if "strategy_file" in config:
            strategy_file = Path(config["strategy_file"])
            if not strategy_file.exists():
                raise ValueError(f"Strategy file not found: {strategy_file}")
            with open(strategy_file, 'r') as f:
                config["strategy_code"] = f.read()
        
        # Set defaults
        config.setdefault("position_size", 100.0)
        config.setdefault("order_type", "MARKET")
        
        return config
    
    def _fetch_market_data(self) -> pd.DataFrame:
        """
        Fetch historical market data for the ticker
        
        Returns:
            DataFrame with OHLCV data (backtesting.py format)
        """
        ticker = self.config["ticker"]
        
        try:
            # Calculate date range (365 days of history)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=400)  # Extra buffer for weekends/holidays
            
            print(f"Downloading data for {ticker} from {start_date.date()} to {end_date.date()}...")
            
            # Create ticker object
            ticker_obj = yf.Ticker(ticker)
            
            # Fetch historical data using the Ticker object
            # This is more reliable than yf.download()
            data = ticker_obj.history(
                start=start_date,
                end=end_date,
                interval="1d",
                auto_adjust=False
            )
            
            if data.empty:
                raise ValueError(
                    f"No data available for {ticker}. "
                    f"Possible reasons: Market closed (today is {datetime.now().strftime('%A')}), "
                    f"invalid ticker, or network issue."
                )
            
            # Handle MultiIndex columns (shouldn't happen with Ticker.history but just in case)
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)
            
            # Ensure proper column names (backtesting.py expects: Open, High, Low, Close, Volume)
            # The Ticker.history() method already returns properly capitalized names
            # But let's ensure consistency
            data.columns = [str(col).capitalize() for col in data.columns]
            
            # Remove any extra columns that backtesting.py doesn't need
            keep_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            data = data[[col for col in keep_cols if col in data.columns]]
            
            # Ensure all required columns exist
            for col in keep_cols:
                if col not in data.columns:
                    raise ValueError(f"Missing required column: {col}")
            
            # Remove any NaN rows
            data = data.dropna()
            
            if len(data) < 20:
                raise ValueError(f"Insufficient data for {ticker}: only {len(data)} bars")
            
            print(f"✓ Fetched {len(data)} bars (latest: {data.index[-1].date()})")
            
            return data
            
        except Exception as e:
            raise Exception(f"Failed to fetch market data: {e}")
    
    def _load_strategy_class(self, data: pd.DataFrame):
        """
        Load and instantiate the Strategy class from strategy code
        
        Args:
            data: Historical OHLCV data
            
        Returns:
            Tuple of (strategy_class, strategy_instance)
        """
        try:
            # Execute strategy code to define strategy class
            exec_globals = {
                'Strategy': Strategy,
                'Backtest': Backtest,
                'pd': pd
            }
            
            try:
                import talib
                exec_globals['talib'] = talib
            except ImportError:
                pass
            
            exec(self.config["strategy_code"], exec_globals)
            
            # Find the strategy class dynamically
            strategy_class = None
            for name, obj in exec_globals.items():
                if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                raise ValueError("No valid Strategy class found in strategy code")
            
            # Create a minimal backtest just to get the strategy instance
            # We won't run it, just use the strategy logic
            bt = Backtest(data, strategy_class, cash=1000000, commission=0, finalize_trades=True)
            
            return strategy_class, bt
            
        except Exception as e:
            raise Exception(f"Failed to load strategy: {e}")
    
    def _evaluate_strategy(self, data: pd.DataFrame) -> str:
        """
        Evaluate strategy to generate trading signal
        
        Args:
            data: Historical OHLCV data
            
        Returns:
            Signal: "BUY", "SELL", or "HOLD"
        """
        try:
            strategy_class, bt = self._load_strategy_class(data)
            
            # Run the backtest to get the strategy's indicators and signals
            stats = bt.run()
            
            # Access the strategy instance from the backtest results
            # The strategy's last trade decision indicates the signal
            trades = stats._trades
            
            # Check current position from our trade journal
            deployment_id = self.config["deployment_id"]
            position = self.journal.get_position(deployment_id)
            has_position = position and position["quantity"] > 0
            
            # Look at the last few trades to determine current signal
            # If the strategy would have bought recently and we don't have a position: BUY
            # If the strategy would have sold recently and we have a position: SELL
            # Otherwise: HOLD
            
            if len(trades) > 0:
                last_trade = trades.iloc[-1]
                
                # Check if we're close to end of data (within last 5 bars)
                data_end = data.index[-1]
                trade_exit = last_trade['ExitTime'] if 'ExitTime' in trades.columns else None
                
                # Simple logic: if last trade was a buy and we don't have position: BUY
                # if we have a position and strategy exited: SELL
                if not has_position and trade_exit is None:
                    # Trade is still open in backtest, we should enter
                    return "BUY"
                elif has_position and trade_exit is not None:
                    # Trade was closed in backtest, we should exit
                    return "SELL"
            
            # Alternative: use a simpler indicator-based approach
            # Run strategy initialization and get the current state
            return self._get_signal_from_indicators(data, strategy_class)
            
        except Exception as e:
            raise Exception(f"Strategy evaluation failed: {e}")
    
    def _get_signal_from_indicators(self, data: pd.DataFrame, strategy_class) -> str:
        """
        Helper method to extract signal by examining strategy indicators
        This is a fallback when we can't infer from backtest trades
        """
        deployment_id = self.config["deployment_id"]
        position = self.journal.get_position(deployment_id)
        has_position = position and position["quantity"] > 0
        
        # For simple strategies, we can execute the init() method
        # and check the indicators at the current bar
        # This is a simplified approach - in production you'd want more sophistication
        
        # Default to HOLD if we can't determine signal
        return "HOLD"
    
    def _calculate_order_params(self, signal: str, current_price: float) -> Optional[Dict]:
        """
        Calculate order parameters based on signal and current position
        
        Args:
            signal: Trading signal
            current_price: Current market price
            
        Returns:
            Order parameters dictionary or None if no action needed
        """
        deployment_id = self.config["deployment_id"]
        position = self.journal.get_position(deployment_id)
        
        position_size = self.config["position_size"]
        ticker = self.config["ticker"]
        
        if signal == "BUY":
            # Only buy if we don't have a position
            if position and position["quantity"] > 0:
                return None  # Already have position
            
            return {
                "symbol": ticker,
                "side": "BUY",
                "amount": position_size,  # Buy in dollars for fractional shares
                "order_type": self.config["order_type"]
            }
        
        elif signal == "SELL":
            # Only sell if we have a position
            if not position or position["quantity"] <= 0:
                return None  # No position to sell
            
            return {
                "symbol": ticker,
                "side": "SELL",
                "quantity": position["quantity"],  # Sell all shares
                "order_type": self.config["order_type"]
            }
        
        else:  # HOLD
            return None
    
    def _execute_order(self, order_params: Dict, current_price: float) -> bool:
        """
        Execute trading order (real or paper)
        
        Args:
            order_params: Order parameters
            current_price: Current market price
            
        Returns:
            True if execution succeeded
        """
        deployment_id = self.config["deployment_id"]
        mode = self.config["mode"]
        
        try:
            if mode == "paper":
                # Paper trading - simulate order
                self._execute_paper_trade(order_params, current_price)
                return True
            
            else:  # live mode
                # Real trading - place order via API
                self._execute_live_trade(order_params, current_price)
                return True
                
        except Exception as e:
            self.journal.log_execution(
                deployment_id,
                order_params["side"],
                f"Order execution failed: {e}",
                success=False
            )
            raise
    
    def _execute_paper_trade(self, order_params: Dict, current_price: float):
        """Execute a simulated (paper) trade"""
        deployment_id = self.config["deployment_id"]
        side = order_params["side"]
        symbol = order_params["symbol"]
        
        # Log the paper trade
        order_id = self.journal.log_order(
            deployment_id=deployment_id,
            symbol=symbol,
            side=side,
            order_type=order_params["order_type"],
            quantity=order_params.get("quantity"),
            amount=order_params.get("amount"),
            status="filled",
            paper_trade=True,
            signal_data={"price": current_price, "timestamp": datetime.now().isoformat()}
        )
        
        # Update simulated position
        if side == "BUY":
            amount = order_params.get("amount", self.config["position_size"])
            quantity = amount / current_price
            self.journal.update_position(deployment_id, symbol, quantity, current_price)
            message = f"Paper BUY: {quantity:.4f} shares of {symbol} @ ${current_price:.2f}"
        else:
            self.journal.update_position(deployment_id, symbol, 0)
            quantity = order_params.get("quantity", 0)
            message = f"Paper SELL: {quantity:.4f} shares of {symbol} @ ${current_price:.2f}"
        
        # Mark order as filled
        self.journal.update_order_status(order_id, "filled", current_price)
        
        # Log execution
        self.journal.log_execution(deployment_id, side, message, success=True)
        print(f"[PAPER TRADE] {message}")
    
    def _execute_live_trade(self, order_params: Dict, current_price: float):
        """Execute a real trade via Public API"""
        deployment_id = self.config["deployment_id"]
        account_id = self.config["account_id"]
        
        # Place order via API
        response = self.api_client.place_order(
            account_id=account_id,
            **order_params
        )
        
        order_id = response.get("orderId")
        
        # Log the order
        log_id = self.journal.log_order(
            deployment_id=deployment_id,
            symbol=order_params["symbol"],
            side=order_params["side"],
            order_type=order_params["order_type"],
            quantity=order_params.get("quantity"),
            amount=order_params.get("amount"),
            order_id=order_id,
            status="placed",
            paper_trade=False,
            signal_data={"price": current_price, "timestamp": datetime.now().isoformat()}
        )
        
        message = f"LIVE {order_params['side']}: Order {order_id} placed for {order_params['symbol']}"
        self.journal.log_execution(deployment_id, order_params["side"], message, success=True)
        print(f"[LIVE TRADE] {message}")
    
    def _is_market_open(self) -> tuple[bool, str]:
        """Check if US stock market is currently open"""
        now = datetime.now()
        
        # Check if weekend
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            return False, "Weekend - Market Closed"
        
        # Check if market hours (9:30 AM - 4:00 PM ET)
        # Simplified - not accounting for holidays
        current_time = now.time()
        market_open = current_time >= datetime.strptime("09:30", "%H:%M").time()
        market_close = current_time <= datetime.strptime("16:00", "%H:%M").time()
        
        if not (market_open and market_close):
            return False, "After Hours - Market Closed"
        
        return True, "Market Open"
    
    def run_stream(self, interval: int = 3):
        """Streaming execution loop - checks signal every N seconds"""
        deployment_id = self.config["deployment_id"]
        iteration = 0
        
        print(f"\n{'='*60}")
        print(f"Live Trader Streaming: {self.config['strategy_name']}")
        print(f"Mode: {self.config['mode'].upper()}")
        print(f"Ticker: {self.config['ticker']}")
        print(f"Update Interval: {interval}s")
        print(f"{'='*60}\n")
        print("Press Ctrl+C to stop...\n")
        
        try:
            while True:
                iteration += 1
                
                # Clear screen every 20 iterations to avoid clutter
                if iteration > 1 and iteration % 20 == 0:
                    # ANSI clear screen and home cursor
                    print("\033[2J\033[H", end="")
                    print(f"Live Trader Streaming: {self.config['strategy_name']}")
                    print(f"Ticker: {self.config['ticker']} | Mode: {self.config['mode'].upper()}")
                    print(f"{'='*60}\n")
                
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # Check market hours
                is_open, market_status = self._is_market_open()
                
                try:
                    # Fetch market data
                    data = self._fetch_market_data()
                    current_price = float(data['Close'].iloc[-1])
                    
                    # Evaluate strategy
                    signal = self._evaluate_strategy(data)
                    
                    # Display status
                    if not is_open and signal == "HOLD":
                        print(f"[{timestamp}] {market_status} | {self.config['ticker']}: ${current_price:.2f} | Signal: HOLD")
                    else:
                        signal_color = {"BUY": "🟢", "SELL": "🔴", "HOLD": "🟡"}
                        print(f"[{timestamp}] {signal_color.get(signal, '⚪')} Signal: {signal} | {self.config['ticker']}: ${current_price:.2f}")
                    
                    # Calculate and execute orders if needed
                    if is_open or signal != "HOLD":
                        order_params = self._calculate_order_params(signal, current_price)
                        
                        if order_params:
                            print(f"   → Executing {order_params['side']} order...")
                            self._execute_order(order_params, current_price)
                        
                    # Update deployment status
                    self.journal.update_deployment_status(deployment_id, "active")
                    
                except Exception as e:
                    print(f"[{timestamp}] ❌ Error: {e}")
                    self.journal.update_deployment_status(deployment_id, "error", str(e))
                
                # Wait for next iteration
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n\n" + "="*60)
            print("Streaming stopped by user")
            print("="*60 + "\n")
            self.journal.update_deployment_status(deployment_id, "stopped")

    def run(self):
        """Main execution loop - run once per call"""
        deployment_id = self.config["deployment_id"]
        
        print(f"\n{'='*60}")
        print(f"Live Trader Execution: {self.config['strategy_name']}")
        print(f"Mode: {self.config['mode'].upper()}")
        print(f"Ticker: {self.config['ticker']}")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")
        
        try:
            # 1. Fetch market data
            print("Fetching market data...")
            data = self._fetch_market_data()
            current_price = float(data['Close'].iloc[-1])
            print(f"Latest price for {self.config['ticker']}: ${current_price:.2f}")
            
            # 2. Evaluate strategy
            print("\nEvaluating strategy using backtesting.py...")
            signal = self._evaluate_strategy(data)
            print(f"Signal generated: {signal}")
            
            # 3. Calculate order parameters
            order_params = self._calculate_order_params(signal, current_price)
            
            if order_params is None:
                message = f"Signal: {signal} - No action needed"
                print(message)
                self.journal.log_execution(deployment_id, signal, message, success=True)
                self.journal.update_deployment_status(deployment_id, "active")
                return
            
            # 4. Execute order
            print(f"\nExecuting {order_params['side']} order...")
            self._execute_order(order_params, current_price)
            
            # 5. Update deployment status
            self.journal.update_deployment_status(deployment_id, "active")
            
            print("\n" + "="*60)
            print("Execution completed successfully")
            print("="*60 + "\n")
            
        except Exception as e:
            error_msg = f"Execution failed: {e}"
            print(f"\nERROR: {error_msg}\n")
            self.journal.update_deployment_status(deployment_id, "error", error_msg)
            self.journal.log_execution(deployment_id, "ERROR", error_msg, success=False)
            raise


def main():
    """Command-line entry point"""
    parser = argparse.ArgumentParser(description="Live trader for Wick strategies")
    parser.add_argument(
        "--config",
        required=True,
        help="Path to deployment configuration JSON file"
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        default=True,
        help="Run in streaming mode (default: True)"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=3,
        help="Update interval in seconds for streaming mode (default: 3)"
    )
    
    args = parser.parse_args()
    
    try:
        trader = LiveTrader(args.config)
        if args.stream:
            trader.run_stream(args.interval)
        else:
            trader.run()
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
