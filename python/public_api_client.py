#!/usr/bin/env python3
"""
Public.com API Client
Handles authentication, token management, and order placement
"""

import requests
import time
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timedelta


class PublicAPIClient:
    """Client for interacting with Public.com trading API"""
    
    BASE_URL = "https://api.public.com"
    AUTH_ENDPOINT = "/userapiauthservice/personal/access-tokens"
    ACCOUNTS_ENDPOINT = "/userapigateway/trading/account"
    
    def __init__(self, secret: str, validity_minutes: int = 60):
        """
        Initialize the Public API client
        
        Args:
            secret: Personal secret token from Public.com settings
            validity_minutes: How long access tokens should be valid (default: 60)
        """
        self.secret = secret
        self.validity_minutes = validity_minutes
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        
    def _is_token_valid(self) -> bool:
        """Check if current access token is still valid"""
        if not self.access_token or not self.token_expires_at:
            return False
        # Refresh if less than 5 minutes remaining
        return datetime.now() < (self.token_expires_at - timedelta(minutes=5))
    
    def get_access_token(self, force_refresh: bool = False) -> str:
        """
        Get a valid access token, refreshing if necessary
        
        Args:
            force_refresh: Force token refresh even if current token is valid
            
        Returns:
            Valid access token string
            
        Raises:
            Exception: If token generation fails
        """
        if not force_refresh and self._is_token_valid():
            return self.access_token
        
        url = f"{self.BASE_URL}{self.AUTH_ENDPOINT}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "validityInMinutes": self.validity_minutes,
            "secret": self.secret
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            self.access_token = data["accessToken"]
            self.token_expires_at = datetime.now() + timedelta(minutes=self.validity_minutes)
            
            return self.access_token
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                raise Exception("Invalid secret token. Please check your PUBLIC_SECRET in .env")
            elif e.response.status_code == 429:
                raise Exception("Rate limit exceeded. Please wait before retrying.")
            else:
                raise Exception(f"Failed to get access token: {e}")
        except Exception as e:
            raise Exception(f"Error getting access token: {e}")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers with valid authorization token"""
        token = self.get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    def _retry_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        Make HTTP request with exponential backoff retry logic
        
        Args:
            method: HTTP method (GET, POST, DELETE)
            url: Request URL
            **kwargs: Additional arguments for requests
            
        Returns:
            Response object
        """
        max_retries = 3
        base_delay = 1
        
        for attempt in range(max_retries):
            try:
                if method.upper() == "GET":
                    response = requests.get(url, **kwargs)
                elif method.upper() == "POST":
                    response = requests.post(url, **kwargs)
                elif method.upper() == "DELETE":
                    response = requests.delete(url, **kwargs)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                
                response.raise_for_status()
                return response
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:  # Rate limit
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        time.sleep(delay)
                        continue
                raise
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    time.sleep(delay)
                    continue
                raise
        
        raise Exception("Max retries exceeded")
    
    def get_accounts(self) -> List[Dict]:
        """
        Get list of trading accounts
        
        Returns:
            List of account dictionaries with accountId, accountType, etc.
            
        Raises:
            Exception: If request fails
        """
        url = f"{self.BASE_URL}{self.ACCOUNTS_ENDPOINT}"
        headers = self._get_headers()
        
        try:
            response = self._retry_request("GET", url, headers=headers, timeout=10)
            data = response.json()
            return data.get("accounts", [])
        except Exception as e:
            raise Exception(f"Failed to get accounts: {e}")
    
    def get_account_id(self) -> str:
        """
        Get the first available account ID
        
        Returns:
            Account ID string
            
        Raises:
            Exception: If no accounts found or request fails
        """
        accounts = self.get_accounts()
        if not accounts:
            raise Exception("No trading accounts found")
        return accounts[0]["accountId"]
    
    def place_order(
        self,
        account_id: str,
        symbol: str,
        side: str,
        quantity: Optional[float] = None,
        amount: Optional[float] = None,
        order_type: str = "MARKET",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        time_in_force: str = "DAY"
    ) -> Dict:
        """
        Place a trading order
        
        Args:
            account_id: Account ID to place order in
            symbol: Stock ticker symbol (e.g., "AAPL")
            side: "BUY" or "SELL"
            quantity: Number of shares (for whole shares or selling fractional)
            amount: Dollar amount (for buying fractional shares)
            order_type: "MARKET", "LIMIT", "STOP", or "STOP_LIMIT"
            limit_price: Limit price (required for LIMIT and STOP_LIMIT)
            stop_price: Stop price (required for STOP and STOP_LIMIT)
            time_in_force: "DAY" or "GTC" (Good-Til-Canceled)
            
        Returns:
            Dictionary with orderId
            
        Raises:
            Exception: If order placement fails or validation fails
        """
        # Validate inputs
        if side not in ["BUY", "SELL"]:
            raise ValueError("side must be 'BUY' or 'SELL'")
        
        if order_type not in ["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]:
            raise ValueError("order_type must be MARKET, LIMIT, STOP, or STOP_LIMIT")
        
        if quantity is None and amount is None:
            raise ValueError("Must specify either quantity or amount")
        
        if quantity is not None and amount is not None:
            raise ValueError("Cannot specify both quantity and amount")
        
        if order_type in ["LIMIT", "STOP_LIMIT"] and limit_price is None:
            raise ValueError(f"{order_type} orders require limit_price")
        
        if order_type in ["STOP", "STOP_LIMIT"] and stop_price is None:
            raise ValueError(f"{order_type} orders require stop_price")
        
        # Generate unique order ID
        order_id = str(uuid.uuid4())
        
        # Build request payload
        payload = {
            "orderId": order_id,
            "side": side,
            "orderType": order_type,
            "timeInForce": time_in_force,
            "instrument": {
                "symbol": symbol,
                "type": "EQUITY"
            }
        }
        
        if quantity is not None:
            payload["quantity"] = quantity
        if amount is not None:
            payload["amount"] = amount
        if limit_price is not None:
            payload["limitPrice"] = limit_price
        if stop_price is not None:
            payload["stopPrice"] = stop_price
        
        # Make request
        url = f"{self.BASE_URL}{self.ACCOUNTS_ENDPOINT}/{account_id}/orders"
        headers = self._get_headers()
        
        try:
            response = self._retry_request("POST", url, json=payload, headers=headers, timeout=10)
            return response.json()
        except requests.exceptions.HTTPError as e:
            error_msg = f"Order placement failed: {e}"
            if e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = f"Order validation failed: {error_data}"
                except:
                    pass
            raise Exception(error_msg)
        except Exception as e:
            raise Exception(f"Failed to place order: {e}")
    
    def get_order_status(self, account_id: str, order_id: str) -> Dict:
        """
        Get the status of a placed order
        
        Args:
            account_id: Account ID
            order_id: Order ID from place_order
            
        Returns:
            Dictionary with order status information
            
        Raises:
            Exception: If request fails
        """
        url = f"{self.BASE_URL}{self.ACCOUNTS_ENDPOINT}/{account_id}/orders/{order_id}"
        headers = self._get_headers()
        
        try:
            response = self._retry_request("GET", url, headers=headers, timeout=10)
            return response.json()
        except Exception as e:
            raise Exception(f"Failed to get order status: {e}")
    
    def cancel_order(self, account_id: str, order_id: str) -> bool:
        """
        Cancel an existing order
        
        Args:
            account_id: Account ID
            order_id: Order ID to cancel
            
        Returns:
            True if cancellation succeeded
            
        Raises:
            Exception: If cancellation fails
        """
        url = f"{self.BASE_URL}{self.ACCOUNTS_ENDPOINT}/{account_id}/orders/{order_id}"
        headers = self._get_headers()
        
        try:
            response = self._retry_request("DELETE", url, headers=headers, timeout=10)
            return True
        except Exception as e:
            raise Exception(f"Failed to cancel order: {e}")
