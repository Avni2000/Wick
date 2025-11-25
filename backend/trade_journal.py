"""
Trade Journal - SQLite database for tracking deployments, orders, and positions
"""
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
import json


class TradeJournal:
    """Manages trade journal database for tracking all trading activity"""
    
    def __init__(self, db_path: str = "trade_journal.db"):
        """Initialize trade journal with database"""
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Create database tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Deployments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deployments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id TEXT UNIQUE NOT NULL,
                strategy_name TEXT NOT NULL,
                ticker TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                stopped_at TEXT
            )
        """)
        
        # Orders table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                order_type TEXT NOT NULL,
                quantity REAL,
                amount REAL,
                status TEXT NOT NULL,
                fill_price REAL,
                created_at TEXT NOT NULL,
                filled_at TEXT,
                paper_trade INTEGER DEFAULT 0,
                FOREIGN KEY (deployment_id) REFERENCES deployments(deployment_id)
            )
        """)
        
        # Positions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                avg_price REAL NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(deployment_id, symbol)
            )
        """)
        
        # Execution log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deployment_id TEXT NOT NULL,
                signal TEXT NOT NULL,
                message TEXT NOT NULL,
                success INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (deployment_id) REFERENCES deployments(deployment_id)
            )
        """)
        
        conn.commit()
        conn.close()
    
    def deployment_exists(self, deployment_id: str) -> bool:
        """Check if a deployment exists in the database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM deployments WHERE deployment_id = ?", (deployment_id,))
        exists = cursor.fetchone() is not None
        conn.close()
        return exists
    
    def create_deployment(self, deployment_id: str, strategy_name: str, 
                         ticker: str, mode: str) -> int:
        """Create a new deployment record"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # If deployment exists, update it instead of inserting
        if self.deployment_exists(deployment_id):
            cursor.execute("""
                UPDATE deployments 
                SET strategy_name = ?, ticker = ?, mode = ?, status = ?, created_at = ?, stopped_at = NULL
                WHERE deployment_id = ?
            """, (strategy_name, ticker, mode, "running", datetime.now().isoformat(), deployment_id))
            cursor.execute("SELECT id FROM deployments WHERE deployment_id = ?", (deployment_id,))
            deployment_pk = cursor.fetchone()[0]
        else:
            cursor.execute("""
                INSERT INTO deployments (deployment_id, strategy_name, ticker, mode, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (deployment_id, strategy_name, ticker, mode, "running", datetime.now().isoformat()))
            deployment_pk = cursor.lastrowid
        
        conn.commit()
        conn.close()
        return deployment_pk
    
    def update_deployment_status(self, deployment_id: str, status: str):
        """Update deployment status"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        stopped_at = datetime.now().isoformat() if status == "stopped" else None
        cursor.execute("""
            UPDATE deployments 
            SET status = ?, stopped_at = ?
            WHERE deployment_id = ?
        """, (status, stopped_at, deployment_id))
        
        conn.commit()
        conn.close()
    
    def log_order(self, deployment_id: str, symbol: str, side: str, 
                  order_type: str, quantity: Optional[float] = None,
                  amount: Optional[float] = None, status: str = "pending",
                  paper_trade: bool = False, signal_data: Optional[Dict] = None) -> int:
        """Log a new order"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO orders (deployment_id, symbol, side, order_type, quantity, 
                              amount, status, created_at, paper_trade)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (deployment_id, symbol, side, order_type, quantity, amount, status,
              datetime.now().isoformat(), 1 if paper_trade else 0))
        
        order_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return order_id
    
    def update_order_status(self, order_id: int, status: str, fill_price: Optional[float] = None):
        """Update order status and fill price"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        filled_at = datetime.now().isoformat() if status == "filled" else None
        cursor.execute("""
            UPDATE orders 
            SET status = ?, fill_price = ?, filled_at = ?
            WHERE id = ?
        """, (status, fill_price, filled_at, order_id))
        
        conn.commit()
        conn.close()
    
    def update_position(self, deployment_id: str, symbol: str, 
                       quantity: float, avg_price: float = None):
        """Update or create position"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # If quantity is 0, delete the position
        if quantity == 0:
            cursor.execute("""
                DELETE FROM positions 
                WHERE deployment_id = ? AND symbol = ?
            """, (deployment_id, symbol))
        else:
            cursor.execute("""
                INSERT INTO positions (deployment_id, symbol, quantity, avg_price, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(deployment_id, symbol) 
                DO UPDATE SET quantity = ?, avg_price = ?, updated_at = ?
            """, (deployment_id, symbol, quantity, avg_price, datetime.now().isoformat(),
                  quantity, avg_price, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
    
    def get_position(self, deployment_id: str) -> Optional[Dict]:
        """Get current position for deployment"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM positions WHERE deployment_id = ?
        """, (deployment_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        return dict(row) if row else None
    
    def log_execution(self, deployment_id: str, signal: str, 
                     message: str, success: bool = True):
        """Log strategy execution event"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO execution_log (deployment_id, signal, message, success, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (deployment_id, signal, message, 1 if success else 0, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
    
    def get_deployment_history(self, deployment_id: str) -> Dict:
        """Get full history for a deployment"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get orders
        cursor.execute("""
            SELECT * FROM orders WHERE deployment_id = ? ORDER BY created_at DESC
        """, (deployment_id,))
        orders = [dict(row) for row in cursor.fetchall()]
        
        # Get execution log
        cursor.execute("""
            SELECT * FROM execution_log WHERE deployment_id = ? ORDER BY timestamp DESC LIMIT 50
        """, (deployment_id,))
        logs = [dict(row) for row in cursor.fetchall()]
        
        # Get position
        position = self.get_position(deployment_id)
        
        conn.close()
        
        return {
            "orders": orders,
            "logs": logs,
            "position": position
        }
