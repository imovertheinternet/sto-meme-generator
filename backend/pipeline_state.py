"""Shared pipeline progress state — written by pipeline.py, read by SSE endpoint."""

import asyncio
from datetime import datetime

_state = {
    "running": False,
    "step": 0,
    "total_steps": 5,
    "label": "",
    "detail": "",
    "started_at": None,
    "finished_at": None,
    "error": None,
    # Counters for the current run
    "scraped": 0,
    "after_dedup": 0,
    "scoring_done": 0,
    "scoring_total": 0,
    "saved": 0,
}

# Clients waiting for updates
_listeners: list[asyncio.Queue] = []


def get_state() -> dict:
    return dict(_state)


def _notify():
    """Push current state to all SSE listeners."""
    snapshot = dict(_state)
    dead = []
    for q in _listeners:
        try:
            q.put_nowait(snapshot)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _listeners.remove(q)


def subscribe() -> asyncio.Queue:
    q = asyncio.Queue(maxsize=50)
    # Send current state immediately
    q.put_nowait(dict(_state))
    _listeners.append(q)
    return q


def unsubscribe(q: asyncio.Queue):
    if q in _listeners:
        _listeners.remove(q)


def start_run():
    _state.update(
        running=True,
        step=0,
        total_steps=5,
        label="Starting pipeline",
        detail="",
        started_at=datetime.utcnow().isoformat(),
        finished_at=None,
        error=None,
        scraped=0,
        after_dedup=0,
        scoring_done=0,
        scoring_total=0,
        saved=0,
    )
    _notify()


def update_step(step: int, label: str, detail: str = ""):
    _state["step"] = step
    _state["label"] = label
    _state["detail"] = detail
    _notify()


def update_scoring_progress(done: int, total: int):
    _state["scoring_done"] = done
    _state["scoring_total"] = total
    _state["detail"] = f"Scored {done}/{total} memes"
    _notify()


def update_counts(**kwargs):
    _state.update(kwargs)
    _notify()


def finish_run(saved: int = 0, error: str = None):
    _state.update(
        running=False,
        step=_state["total_steps"] if not error else _state["step"],
        label="Complete" if not error else "Failed",
        detail=f"Saved {saved} new memes" if not error else error,
        finished_at=datetime.utcnow().isoformat(),
        error=error,
        saved=saved,
    )
    _notify()
