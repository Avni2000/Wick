#!/usr/bin/env python3
"""
Trade Journal
SQLite-based logging and tracking for deployed strategies
"""

import sqlite3
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path


class TradeJournal:
    """Manages trade logging and deployment tracking"""
    
    def __init__(self, db_path: str = None):
        """
        Initialize trade journal database
        
        Args:
            db_path: Path to SQLite database file (default: ~/source/repos/strategies/trade_journal.db)
        """
        if db_path is None:
            default_dir = Path.home() / "source" / "repos" / "strategies"
            default_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(default_dir / "trade_journal.db")
        
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row  # Return rows as dictionaries
        self._init_database()
    
    def _init_database(self):
        """Create database tables if they don't exist"""
        cursor = self.conn.cursor()
        
        # Deployments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deployments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_name TEXT NOT NULL,
                ticker TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                account_id TEXT,
                position_size REAL,
                strategy_code TEXT,
                config TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_run TIMESTAMP,
                error_message TEXT
            )
        """)
        
        # Orders table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id INTEGER NOT NULL,
                order_id TEXT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL,
                amount REAL,
                order_type TEXT NOT NULL,
                status TEXT NOT NULL,
                placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                filled_at TIMESTAMP,
                fill_price REAL,
                paper_trade BOOLEAN DEFAULT 0,
                signal_data TEXT,
                FOREIGN KEY (deployment_id) REFERENCES deployments(id)
            )
        """)
        
        # Positions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                deployment_id INTEGER PRIMARY KEY,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                avg_cost REAL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (deployment_id) REFERENCES deployments(id)
            )
        """)
        
        # Execution log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                signal TEXT,
                message TEXT,
                success BOOLEAN,
                FOREIGN KEY (deployment_id) REFERENCES deployments(id)
            )
        """)
        
        self.conn.commit()
    
    def create_deployment(
        self,
        strategy_name: str,
        ticker: str,
        mode: str,
        account_id: Optional[str] = None,
        position_size: float = 100.0,
        strategy_code: str = "",
        config: Dict = None
    ) -> int:
        """
        Create a new strategy deployment
        
        Args:
            strategy_name: Name of the strategy
            ticker: Stock ticker symbol
            mode: "paper" or "live"
            account_id: Public.com account ID (required for live mode)
            position_size: Position size in dollars
            strategy_code: Python strategy code
            config: Additional configuration dictionary
            
        Returns:
            Deployment ID
        """
        if mode not in ["paper", "live"]:
            raise ValueError("mode must be 'paper' or 'live'")
        
        if mode == "live" and not account_id:
            raise ValueError("account_id required for live mode")
        
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO deployments (
                strategy_name, ticker, mode, status, account_id, 
                position_size, strategy_code, config
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            strategy_name,
            ticker,
            mode,
            "active",
            account_id,
            position_size,
            strategy_code,
            json.dumps(config or {})
        ))
        
        self.conn.commit()
        return cursor.lastrowid
    
    def update_deployment_status(
        self,
        deployment_id: int,
        status: str,
        error_message: Optional[str] = None
    ):
        """
        Update deployment status
        
        Args:
            deployment_id: Deployment ID
            status: New status ("active", "stopped", "error")
            error_message: Optional error message
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE deployments
            SET status = ?, error_message = ?, last_run = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (status, error_message, deployment_id))
        self.conn.commit()
    
    def get_deployment(self, deployment_id: int) -> Optional[Dict]:
        """
        Get deployment by ID
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            Deployment dictionary or None
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM deployments WHERE id = ?", (deployment_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def get_active_deployments(self) -> List[Dict]:
        """
        Get all active deployments
        
        Returns:
            List of deployment dictionaries
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM deployments WHERE status = 'active' ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]
    
    def log_order(
        self,
        deployment_id: int,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Optional[float] = None,
        amount: Optional[float] = None,
        order_id: Optional[str] = None,
        status: str = "placed",
        paper_trade: bool = False,
        signal_data: Dict = None
    ) -> int:
        """
        Log an order
        
        Args:
            deployment_id: Deployment ID
            symbol: Stock ticker
            side: "BUY" or "SELL"
            order_type: Order type
            quantity: Number of shares
            amount: Dollar amount
            order_id: Public API order ID
            status: Order status
            paper_trade: Whether this is a simulated order
            signal_data: Strategy signal data
            
        Returns:
            Order log ID
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO orders (
                deployment_id, order_id, symbol, side, quantity, amount,
                order_type, status, paper_trade, signal_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            deployment_id,
            order_id,
            symbol,
            side,
            quantity,
            amount,
            order_type,
            status,
            1 if paper_trade else 0,
            json.dumps(signal_data or {})
        ))
        
        self.conn.commit()
        return cursor.lastrowid
    
    def update_order_status(
        self,
        order_log_id: int,
        status: str,
        fill_price: Optional[float] = None
    ):
        """
        Update order status and fill information
        
        Args:
            order_log_id: Order log ID
            status: New status
            fill_price: Fill price if filled
        """
        cursor = self.conn.cursor()
        
        if status == "filled" and fill_price is not None:
            cursor.execute("""
                UPDATE orders
                SET status = ?, fill_price = ?, filled_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, fill_price, order_log_id))
        else:
            cursor.execute("""
                UPDATE orders SET status = ? WHERE id = ?
            """, (status, order_log_id))
        
        self.conn.commit()
    
    def get_orders(self, deployment_id: int, limit: int = 100) -> List[Dict]:
        """
        Get orders for a deployment
        
        Args:
            deployment_id: Deployment ID
            limit: Maximum number of orders to return
            
        Returns:
            List of order dictionaries
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM orders
            WHERE deployment_id = ?
            ORDER BY placed_at DESC
            LIMIT ?
        """, (deployment_id, limit))
        return [dict(row) for row in cursor.fetchall()]
    
    def update_position(
        self,
        deployment_id: int,
        symbol: str,
        quantity: float,
        avg_cost: Optional[float] = None
    ):
        """
        Update current position
        
        Args:
            deployment_id: Deployment ID
            symbol: Stock ticker
            quantity: Current quantity (0 = no position)
            avg_cost: Average cost basis
        """
        cursor = self.conn.cursor()
        
        if quantity == 0:
            # Close position
            cursor.execute("DELETE FROM positions WHERE deployment_id = ?", (deployment_id,))
        else:
            # Upsert position
            cursor.execute("""
                INSERT INTO positions (deployment_id, symbol, quantity, avg_cost, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(deployment_id) DO UPDATE SET
                    quantity = excluded.quantity,
                    avg_cost = excluded.avg_cost,
                    updated_at = CURRENT_TIMESTAMP
            """, (deployment_id, symbol, quantity, avg_cost))
        
        self.conn.commit()
    
    def get_position(self, deployment_id: int) -> Optional[Dict]:
        """
        Get current position for deployment
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            Position dictionary or None
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE deployment_id = ?", (deployment_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def log_execution(
        self,
        deployment_id: int,
        signal: str,
        message: str,
        success: bool = True
    ):
        """
        Log a strategy execution event
        
        Args:
            deployment_id: Deployment ID
            signal: Signal generated ("BUY", "SELL", "HOLD")
            message: Log message
            success: Whether execution was successful
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO execution_log (deployment_id, signal, message, success)
            VALUES (?, ?, ?, ?)
        """, (deployment_id, signal, message, 1 if success else 0))
        self.conn.commit()
    
    def get_execution_log(self, deployment_id: int, limit: int = 50) -> List[Dict]:
        """
        Get execution log for deployment
        
        Args:
            deployment_id: Deployment ID
            limit: Maximum number of entries
            
        Returns:
            List of log entries
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM execution_log
            WHERE deployment_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        """, (deployment_id, limit))
        return [dict(row) for row in cursor.fetchall()]
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
