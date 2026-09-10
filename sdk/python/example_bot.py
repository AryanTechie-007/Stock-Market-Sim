import os
from marketarena import MarketArenaClient

def main():
    api_key = os.getenv("MARKETARENA_API_KEY", "test_key")
    api_secret = os.getenv("MARKETARENA_API_SECRET", "test_secret")

    client = MarketArenaClient(
        base_url="http://localhost:3000",
        api_key=api_key,
        api_secret=api_secret
    )

    print("[PYTHON BOT] Pinging MarketArena...")
    ping_res = client.ping()
    clock = ping_res.get("clock", {})
    print(f"[PYTHON BOT] Connected! Phase: {clock.get('phase')}, Day: {clock.get('day')}")

    regime = client.get_regime()
    print(f"[PYTHON BOT] Macro Regime: {regime.get('name')} | Volatility Multiplier: {regime.get('volatilityMultiplier')}x")

    symbol = "BYTE"
    book = client.get_orderbook(symbol, depth=5)
    bids = book.get("bids", [])
    asks = book.get("asks", [])
    top_bid = bids[0]["price"] if bids else "N/A"
    top_ask = asks[0]["price"] if asks else "N/A"
    print(f"[PYTHON BOT] {symbol} Book | Top Bid: {top_bid} | Top Ask: {top_ask} | Spread: {book.get('spread')}")

    candles = client.get_candles(symbol, timeframe="5s", limit=10)
    print(f"[PYTHON BOT] Retrieved {len(candles.get('candles', []))} candles.")

if __name__ == "__main__":
    main()
