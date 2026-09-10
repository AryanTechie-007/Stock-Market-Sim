import urllib.request
import urllib.parse
import json
import hmac
import hashlib
import time

class MarketArenaClient:
    """
    MarketArena Python Client SDK
    Pure standard library client for algorithmic trading and quantitative research.
    """
    def __init__(self, base_url="http://localhost:3000", api_key=None, api_secret=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.api_secret = api_secret

    def _request(self, method, endpoint, body=None):
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "MarketArena-Python-SDK/0.8"
        }

        method_upper = method.upper()
        data_bytes = None

        if body is not None and method_upper != "GET":
            body_str = json.dumps(body)
            data_bytes = body_str.encode('utf-8')
            headers["Content-Type"] = "application/json"
        else:
            body_str = ""

        if self.api_key and self.api_secret:
            timestamp = str(int(time.time() * 1000))
            payload = f"{timestamp}{method_upper}{endpoint}{body_str}"
            signature = hmac.new(
                self.api_secret.encode('utf-8'),
                payload.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()

            headers["X-API-KEY"] = self.api_key
            headers["X-API-TIMESTAMP"] = timestamp
            headers["X-API-SIGNATURE"] = signature
        elif self.api_key:
            headers["X-API-KEY"] = self.api_key

        req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method_upper)
        try:
            with urllib.request.urlopen(req) as resp:
                resp_data = resp.read().decode('utf-8')
                return json.loads(resp_data)
        except urllib.error.HTTPError as err:
            err_data = err.read().decode('utf-8')
            try:
                parsed_err = json.loads(err_data)
                msg = parsed_err.get("message") or parsed_err.get("error") or str(err)
            except Exception:
                msg = str(err)
            raise RuntimeError(f"HTTP {err.code}: {msg}")

    # --- Public Market Data ---

    def ping(self):
        """Server health check and market clock state"""
        return self._request("GET", "/api/v1/ping")

    def get_regime(self):
        """Get active macroeconomic market regime"""
        return self._request("GET", "/api/v1/regime")

    def get_orderbook(self, symbol, depth=10):
        """Fetch L2 depth bids and asks"""
        return self._request("GET", f"/api/v1/orderbook/{symbol}?depth={depth}")

    def get_candles(self, symbol, timeframe="5s", limit=50):
        """
        Fetch historical OHLCV candlestick bars
        Timeframes: '1s', '5s', '15s', '1m', '5m'
        """
        return self._request("GET", f"/api/v1/candles/{symbol}?timeframe={timeframe}&limit={limit}")

    # --- Authenticated Endpoints ---

    def get_account(self):
        """Fetch account balances, portfolio valuation, and risk metrics"""
        return self._request("GET", "/api/v1/account")

    def get_open_orders(self):
        """List active resting orders"""
        return self._request("GET", "/api/v1/orders")

    def place_order(self, symbol, side, quantity, order_type="LIMIT", price=None, stop_price=None, trailing_delta=None, leverage=1, is_short=False):
        """
        Submit order to matching engine
        """
        payload = {
            "symbol": symbol,
            "side": side.upper(),
            "type": order_type.upper(),
            "quantity": quantity,
            "leverage": leverage,
            "isShort": bool(is_short)
        }
        if price is not None:
            payload["price"] = price
        if stop_price is not None:
            payload["stopPrice"] = stop_price
        if trailing_delta is not None:
            payload["trailingDelta"] = trailing_delta

        return self._request("POST", "/api/v1/orders", payload)

    def cancel_order(self, symbol, order_id):
        """Cancel resting order"""
        return self._request("DELETE", f"/api/v1/orders/{order_id}?symbol={symbol}")

    @staticmethod
    def to_dataframe(candle_response):
        """Convert candle data to pandas DataFrame if pandas is installed"""
        try:
            import pandas as pd
            candles = candle_response.get("candles", [])
            df = pd.DataFrame(candles)
            if not df.empty and "time" in df.columns:
                df["time"] = pd.to_datetime(df["time"], unit="ms")
            return df
        except ImportError:
            raise ImportError("pandas is required for to_dataframe(). Run: pip install pandas")
