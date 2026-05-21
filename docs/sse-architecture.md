# Server-Sent Events (SSE) in Python/FastAPI

How we use SSE to stream pipeline progress from the backend to the frontend in real-time.

## What is SSE?

Server-Sent Events is a one-directional streaming protocol (server to client) over a single HTTP connection. The client opens a `GET` request, the server holds it open and pushes text messages down it. Native browser support via the `EventSource` API — no libraries needed.

### SSE vs WebSocket vs Polling

| Approach | Direction | Complexity | Use case |
|----------|-----------|------------|----------|
| **SSE** | Server -> Client only | Low (plain HTTP) | Progress updates, notifications, live feeds |
| **WebSocket** | Bidirectional | Medium (upgrade handshake, ping/pong) | Chat, collaborative editing, games |
| **Polling** | Client -> Server (repeated) | Low but wasteful | Simple status checks, low-frequency updates |

SSE wins when you only need server-to-client pushes. It auto-reconnects, works through proxies, and uses zero external dependencies.

## Architecture

```
pipeline.py                pipeline_state.py              main.py (SSE endpoint)           Browser
-----------                -----------------              ----------------------           -------
                           _state = {dict}
                           _listeners = [Queue, Queue...]

update_step(2, "Dedup")
        |
        +----> _state["step"] = 2
               _state["label"] = "Dedup"
               _notify()
                    |
                    +----> queue.put(snapshot)  ------>  await queue.get()
                           queue.put(snapshot)  -.         |
                                                 \        yield f"data: {json}\n\n"
                                                  \            |
                                                   '->  ...   +----> EventSource.onmessage
                                                                     setPipeline(state)
                                                                     re-render progress bar
```

## Backend Implementation

### 1. Shared state module (`pipeline_state.py`)

The state is a plain dict plus a list of asyncio Queues (one per SSE listener):

```python
import asyncio

_state = {"running": False, "step": 0, "label": "", ...}
_listeners: list[asyncio.Queue] = []

def _notify():
    """Push current state snapshot to all SSE listeners."""
    snapshot = dict(_state)
    for q in _listeners:
        q.put_nowait(snapshot)

def subscribe() -> asyncio.Queue:
    """New SSE client connects — create a queue and return it."""
    q = asyncio.Queue(maxsize=50)
    q.put_nowait(dict(_state))  # send current state immediately
    _listeners.append(q)
    return q

def unsubscribe(q: asyncio.Queue):
    _listeners.remove(q)

def update_step(step: int, label: str, detail: str = ""):
    _state["step"] = step
    _state["label"] = label
    _state["detail"] = detail
    _notify()  # all listeners get the update instantly
```

Key insight: `_notify()` is synchronous — it calls `put_nowait()` which never blocks. The pipeline doesn't wait for SSE clients. If no one is listening, notifications are simply dropped.

### 2. SSE endpoint (`main.py`)

FastAPI streams responses using `StreamingResponse` with an async generator:

```python
from fastapi.responses import StreamingResponse

@app.get("/pipeline/events")
async def pipeline_events():
    queue = ps.subscribe()

    async def event_stream():
        try:
            while True:
                try:
                    # Block until pipeline pushes something (or timeout)
                    state = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(state)}\n\n"

                    # Pipeline finished — send final state and close
                    if not state["running"] and state["finished_at"]:
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # prevent proxy/browser timeout
        finally:
            ps.unsubscribe(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

The SSE wire format is simple text:
- `data: {json}\n\n` — a data message (triggers `onmessage` in browser)
- `: keepalive\n\n` — a comment line (ignored by browser, prevents timeout)

### 3. Pipeline emits events (`pipeline.py`)

```python
import pipeline_state as ps

async def run_pipeline():
    ps.start_run()

    # Step 1
    ps.update_step(1, "Scraping sources", "Instagram, Reddit")
    raw_posts = scrape(...)

    # Step 2
    ps.update_step(2, "Deduplicating", f"{len(raw_posts)} posts")
    unseen = dedup(...)

    # Step 3 — with per-item progress
    ps.update_step(3, "AI scoring", f"{len(unseen)} memes")
    survivors = await filter_batch(unseen, progress_callback=ps.update_scoring_progress)

    # Step 4
    ps.update_step(4, "Saving", f"{len(survivors)} memes")
    saved = persist(...)

    # Done
    ps.finish_run(saved=saved)
```

## Frontend Implementation

The browser's native `EventSource` API handles SSE:

```javascript
const handleTrigger = async () => {
  await fetch("/api/run", { method: "POST" })

  // Open SSE connection
  const es = new EventSource("/api/pipeline/events")

  es.onmessage = (event) => {
    const state = JSON.parse(event.data)
    setPipeline(state)  // update React state -> re-render progress bar

    // Pipeline finished — refresh data and close connection
    if (!state.running && state.finished_at) {
      loadQueue()       // refresh the meme queue
      es.close()
      setTimeout(() => setPipeline(null), 4000)  // fade out progress bar
    }
  }

  es.onerror = () => es.close()
}
```

On page load, check if a pipeline is already running (handles browser refresh mid-run):

```javascript
useEffect(() => {
  fetch("/api/pipeline/status")
    .then(r => r.json())
    .then(state => {
      if (state.running) {
        setPipeline(state)
        connectSSE()  // reconnect to the stream
      }
    })
}, [])
```

## Why This Works Well

1. **No external deps** — asyncio queues + StreamingResponse. No Redis, no Socket.IO.
2. **Scalable listeners** — each SSE client gets its own queue. 1 client or 10, same code.
3. **Non-blocking pipeline** — `put_nowait()` means the pipeline never waits for slow clients.
4. **Proxy-friendly** — SSE is plain HTTP. Works through nginx, Vite proxy, etc. `X-Accel-Buffering: no` tells nginx not to buffer the stream.
5. **Auto-reconnect** — `EventSource` automatically reconnects on network drops (built into the browser spec).
6. **Graceful cleanup** — `finally: unsubscribe(queue)` ensures dead connections don't leak memory.

## Gotchas

- **Keepalives matter** — proxies and browsers will close idle connections after ~60s. The `timeout=30` + keepalive comment prevents this.
- **SSE is text-only** — you can't send binary data. JSON works fine for our use case.
- **One-directional** — if you need client-to-server messages too, you'd need WebSocket. We don't — the client just watches.
- **`X-Accel-Buffering: no`** — without this header, nginx buffers the entire response before sending it, which defeats the purpose of streaming.
