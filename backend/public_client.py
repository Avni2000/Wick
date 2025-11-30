import requests
import uuid
from typing import Dict, Optional, List, Any

class PublicClient:
    """Client for Public.com API"""
    
    BASE_URL = "https://public.com/api"  # Verify this base URL, docs say https://public.com/api/docs but usually API is api.public.com or public.com/api
    # Actually docs say "https://public.com/api/docs/resources/..." so likely https://public.com/api/
    # Wait, the docs link is public.com/api/docs. The endpoints are listed as /market-data/get-quotes.
    # I will assume the base is https://public.com/api based on the docs URL structure, but it might be api.public.com.
    # Let's try to find the base URL in the docs text. "https://public.com/api/docs" is the docs.
    # Usually it's https://api.public.com/v1 or similar.
    # Let's check the "Server" or "Host" in examples if any. None.
    # I'll stick with https://public.com/api for now and make it configurable.
    
    def __init__(self, api_key: str, is_sandbox: bool = False):
        self.api_key = api_key
        self.base_url = "https://public.com/api" # if is_sandbox else "https://public.com/api" # No sandbox mentioned?
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "WickTrading/1.0"
        })

    def get_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Get real-time quotes for symbols
        POST /market-data/get-quotes
        """
        url = f"{self.base_url}/market-data/get-quotes"
        # Based on "List of instruments to query quotes", I'll try sending a list of symbols
        # But usually these APIs expect an object.
        # Let's try sending just the list of strings first, or look for more clues.
        # "Request Body: List of instruments to query quotes."
        # If it fails, I'll try {"symbols": symbols}
        
        # The doc example response shows "instrument": {"symbol": "string", "type": "EQUITY"}.
        # Maybe the request expects objects too?
        # For now, I'll assume list of strings is NOT enough if it needs type.
        # But usually for quotes, symbol is enough.
        
        # I will try to send a list of strings.
        payload = symbols 
        
        response = self.session.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    def place_order(self, 
                    symbol: str, 
                    side: str, 
                    quantity: float = None, 
                    amount: float = None, 
                    order_type: str = "MARKET", 
                    limit_price: float = None) -> Dict[str, Any]:
        """
        Place an order
        POST /order-placement/place-order
        """
        url = f"{self.base_url}/order-placement/place-order"
        
        order_id = str(uuid.uuid4())
        
        payload = {
            "orderId": order_id,
            "instrument": {
                "symbol": symbol,
                "type": "EQUITY"
            },
            "side": side.upper(), # BUY or SELL
            "type": order_type.upper(), # MARKET, LIMIT, etc.
            "timeInForce": "DAY"
        }
        
        if quantity:
            payload["quantity"] = quantity
        elif amount:
            payload["amount"] = amount
        else:
            raise ValueError("Either quantity or amount must be provided")
            
        if limit_price and order_type.upper() == "LIMIT":
            payload["limitPrice"] = limit_price
            
        response = self.session.post(url, json=payload)
        response.raise_for_status()
        return response.json()
