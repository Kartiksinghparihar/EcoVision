"""In-process SSE fan-out. For multiple API workers, replace with Redis pub/sub or Supabase Realtime."""
import asyncio
import json


class Broadcaster:
    def __init__(self):
        self.queues: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.queues.add(q)
        return q

    def unsubscribe(self, q):
        self.queues.discard(q)

    def publish(self, event: str, data: dict):
        msg = f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
        for q in list(self.queues):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass  # slow client — drop rather than block ingestion


hub = Broadcaster()
