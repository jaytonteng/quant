"""
async_short_strategy.py

Skeleton for an async short‑selling strategy on OKX perpetual contracts.

Key components:
1. OKX REST + WebSocket client (using `aiohttp` / `websockets`, or the official OKX SDK‑python if preferred)
2. `MarketDataCollector`: maintains rolling 1‑minute close prices, computes 5‑minute returns.
3. `StatsModel`: tracks a six‑month rolling mean & standard deviation of 5‑minute returns.
4. `ShortStrategyEngine`: detects anomalous +ve 5‑minute returns (> μ+3σ) ⇒ open short; handles 1% activation / 0.2% callback trailing‑TP & 3% scale‑in (×1.5, max 4).
5. `OrderManager`: wraps REST trade calls with proper auth & leverage handling.

Each class below contains **TODO** markers for the pieces you should fill in.  
Use this as a guided template rather than copy‑pasting blind — finish the TODOs step by step and test as you go!
"""
import os
import asyncio
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, List, Deque

# ◇◇◇ 0) API credentials — keep them *out* of source control! ◇◇◇
API_KEY = os.getenv("OKX_API_KEY")
API_SECRET = os.getenv("OKX_API_SECRET")
PASSPHRASE = os.getenv("OKX_PASSPHRASE")

# --‑‑ Optional: switch to paper trading endpoints while developing  ---
WS_PUBLIC = "wss://ws.okx.com:8443/ws/v5/public"  # live public stream
REST_BASE = "https://www.okx.com"                 # live REST

#===============================================================================
# 1) MarketDataCollector: subscribe to 1‑minute candles & cache recent prices
#===============================================================================
class MarketDataCollector:
    """Collects real‑time 1‑minute candles for *many* symbols in parallel."""
    def __init__(self, symbols: List[str]):
        self.symbols = symbols
        # ring‑buffer of last 6 minutes of closes for each symbol
        self.closes: Dict[str, Deque[float]] = {s: deque(maxlen=6) for s in symbols}

    async def connect(self):
        """Connect to WebSocket & subscribe. Runs forever until cancelled."""
        # TODO 1️⃣: open websocket, send subscription frames like:
        # {"op": "subscribe", "args": [{"channel": "candle1m", "instId": "BTC‑USDT‑SWAP"}, ...]}
        # then await self._on_message() for incoming data
        pass

    async def _on_message(self, msg: dict):
        """Parse `'data'` → append latest close price to self.closes."""
        # TODO 2️⃣: extract symbol, close price, store in deque
        # Hint: OKX candles come as list: [ts, o, h, l, c, vol, volCcy]
        pass

#===============================================================================
# 2) StatsModel: on‑line mean/σ estimate for 5‑minute returns (six‑month window)
#===============================================================================
class StatsModel:
    """Incremental μ & σ using Welford's algorithm for each symbol."""
    def __init__(self):
        self.n: Dict[str, int] = {}
        self.mean: Dict[str, float] = {}
        self.M2: Dict[str, float] = {}

    def update(self, symbol: str, r: float):
        """Update streaming mean/std with a *single* 5‑minute return sample."""
        # TODO 3️⃣: implement Welford update (mean & M2 → variance)
        pass

    def std(self, symbol: str) -> float:
        n = self.n.get(symbol, 0)
        return (self.M2.get(symbol, 0) / (n - 1)) ** 0.5 if n > 1 else 0

    def is_anomalous(self, symbol: str, r: float) -> bool:
        m = self.mean.get(symbol, 0)
        s = self.std(symbol)
        return s > 0 and r > m + 3 * s

#===============================================================================
# 3) OrderManager: thin wrapper around OKX trade REST calls
#===============================================================================
class OrderManager:
    """*Skeleton* — fill in using the OKX v5 REST endpoints."""
    def __init__(self):
        # TODO 4️⃣: set up auth headers or use official SDK
        pass

    async def open_short(self, symbol: str, usdt_size: float, leverage: int = 5):
        """POST /trade/order — side='sell' posSide='short' …"""
        pass

    async def add_position(self, symbol: str, factor: float):
        """Increase current position size by <factor>."""
        pass

    async def set_trailing_tp(self, symbol: str, activation: float, callback: float):
        """Submit a trailing‑stop order → type='trail' per OKX spec."""
        pass

#===============================================================================
# 4) ShortStrategyEngine: glue market data, stats & order manager together
#===============================================================================
class ShortStrategyEngine:
    def __init__(self, md: MarketDataCollector, stats: StatsModel, om: OrderManager):
        self.md = md
        self.stats = stats
        self.om = om
        self.positions: Dict[str, int] = {}          # current scale‑in count per symbol
        self.entry_price: Dict[str, float] = {}      # last entry price

    async def run(self):
        """Evaluate every minute — assumes md.closes is up‑to‑date."""
        while True:
            for sym, dq in self.md.closes.items():
                if len(dq) < 6:
                    continue  # need 6 datapoints (0..5 minutes)
                r = (dq[-1] - dq[0]) / dq[0]
                self.stats.update(sym, r)

                # ——— ENTRY LOGIC ———
                if sym not in self.positions and self.stats.is_anomalous(sym, r):
                    # TODO 5️⃣: decide notional size & call om.open_short
                    self.positions[sym] = 0  # 0 additions yet
                    self.entry_price[sym] = dq[-1]
                    # submit trailing TP right away
                    await self.om.set_trailing_tp(sym, 0.01, 0.002)

                # ——— SCALE‑IN LOGIC ———
                elif sym in self.positions and self.positions[sym] < 4:
                    up_pct = (dq[-1] - self.entry_price[sym]) / self.entry_price[sym]
                    if up_pct >= 0.03:
                        await self.om.add_position(sym, 1.5)
                        self.positions[sym] += 1
                        self.entry_price[sym] = dq[-1]  # reset anchor

            await asyncio.sleep(60)  # wait until next minute candle

#===============================================================================
# 5) discover perpetual symbols & spin everything up
#===============================================================================
async def discover_perps() -> List[str]:
    """Call `/api/v5/public/instruments?instType=SWAP` and filter *USDT* quotes."""
    # TODO 6️⃣: implement REST fetch → return ["BTC‑USDT‑SWAP", ...]
    return []

async def main():
    symbols = await discover_perps()
    if not symbols:
        print("[warn] No symbols discovered — check REST auth / network.")
        return

    md = MarketDataCollector(symbols)
    stats = StatsModel()
    om = OrderManager()
    strat = ShortStrategyEngine(md, stats, om)

    await asyncio.gather(md.connect(), strat.run())

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped by user… bye!")