import os
import asyncio
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import json
import httpx
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db.database import init_db, get_db, Meme, PreferenceRules
from pipeline import run_pipeline
from ai.filter import analyze_preferences, _should_regenerate_rules
import pipeline_state as ps

IMAGES_DIR = Path("/data/images")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")

    hour = int(os.getenv("SCHEDULE_HOUR", 6))
    minute = int(os.getenv("SCHEDULE_MINUTE", 0))
    scheduler.add_job(run_pipeline, "cron", hour=hour, minute=minute, id="daily_pipeline")
    scheduler.start()
    logger.info(f"Scheduler started — pipeline fires daily at {hour:02d}:{minute:02d} UTC")

    yield

    scheduler.shutdown()


app = FastAPI(title="StickThisOn Meme Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MemeOut(BaseModel):
    id: str
    source: str
    source_url: str
    image_url: str
    video_url: Optional[str]
    is_video: bool
    caption: Optional[str]
    likes: int
    ai_score: Optional[float]
    ai_humor_score: Optional[float]
    ai_patch_score: Optional[float]
    ai_originality_score: Optional[float]
    ai_legal_flag: bool
    ai_reasoning: Optional[str]
    status: str
    user_notes: Optional[str]
    fetched_at: datetime
    decided_at: Optional[datetime]
    local_image_path: Optional[str]

    class Config:
        from_attributes = True


class DecisionIn(BaseModel):
    status: str          # approved | rejected | saved
    user_notes: Optional[str] = None


class RunResponse(BaseModel):
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/queue", response_model=list[MemeOut])
def get_queue(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Pending memes sorted by AI score descending — highest confidence first."""
    return (
        db.query(Meme)
        .filter(Meme.status == "pending")
        .order_by(Meme.ai_score.desc())
        .limit(limit)
        .all()
    )


@app.get("/history", response_model=list[MemeOut])
def get_history(
    status: Optional[str] = Query(None, description="approved | rejected | saved"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """All decided memes, optionally filtered by status."""
    query = db.query(Meme).filter(Meme.status != "pending")
    if status:
        query = query.filter(Meme.status == status)
    return query.order_by(Meme.decided_at.desc()).limit(limit).all()


async def _download_image(image_url: str, meme_id: str) -> Optional[str]:
    """Download an image to /data/images/ and return the local path."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as http:
            resp = await http.get(image_url)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "image/jpeg")
            ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
            ext = ext_map.get(content_type.split(";")[0], ".jpg")

            filename = f"{meme_id}{ext}"
            path = IMAGES_DIR / filename
            path.write_bytes(resp.content)
            logger.info(f"Downloaded image for {meme_id} → {path}")
            return str(path)
    except Exception as e:
        logger.error(f"Failed to download image for {meme_id}: {e}")
        return None


@app.patch("/meme/{meme_id}/decide", response_model=MemeOut)
async def decide_meme(
    meme_id: str,
    body: DecisionIn,
    db: Session = Depends(get_db)
):
    """Record your approve / reject / save decision on a meme."""
    valid_statuses = {"approved", "rejected", "saved"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid_statuses}")

    meme = db.query(Meme).filter(Meme.id == meme_id).first()
    if not meme:
        raise HTTPException(status_code=404, detail="Meme not found")

    meme.status = body.status
    meme.user_notes = body.user_notes
    meme.decided_at = datetime.utcnow()

    if body.status in ("approved", "saved") and meme.image_url and not meme.local_image_path:
        local_path = await _download_image(meme.image_url, meme_id)
        if local_path:
            meme.local_image_path = local_path

    db.commit()
    db.refresh(meme)

    # Auto-regenerate preference rules after enough new decisions
    if _should_regenerate_rules():
        logger.info("Decision threshold reached — regenerating preference rules in background")
        asyncio.create_task(analyze_preferences())

    return meme


@app.post("/preferences/analyze")
async def trigger_preference_analysis():
    """Manually trigger preference rule generation from approval history."""
    rules = await analyze_preferences()
    if not rules:
        return {"message": "Not enough decisions to analyze (need at least 5)", "rules": None}
    return {"message": "Preference rules regenerated", "rules": rules}


@app.get("/preferences")
def get_preferences(db: Session = Depends(get_db)):
    """View the current distilled preference rules."""
    latest = (
        db.query(PreferenceRules)
        .order_by(PreferenceRules.created_at.desc())
        .first()
    )
    if not latest:
        return {"rules": None, "decisions_analyzed": 0, "created_at": None}
    return {
        "rules": latest.rules_text,
        "decisions_analyzed": latest.decisions_analyzed,
        "created_at": latest.created_at.isoformat(),
    }


@app.post("/run", response_model=RunResponse)
async def trigger_pipeline():
    """Manually trigger the scrape + filter pipeline outside of schedule."""
    state = ps.get_state()
    if state["running"]:
        return {"message": "Pipeline is already running"}
    # Set running state BEFORE creating task so SSE subscribers
    # immediately see running=true (prevents race condition where
    # SSE connects before the pipeline task starts and gets stale state)
    ps.start_run()
    asyncio.create_task(run_pipeline())
    return {"message": "Pipeline started"}


@app.get("/pipeline/status")
def pipeline_status():
    """Current pipeline state (poll-friendly)."""
    return ps.get_state()


@app.get("/pipeline/events")
async def pipeline_events():
    """SSE stream of pipeline progress events."""
    queue = ps.subscribe()

    async def event_stream():
        try:
            while True:
                try:
                    state = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(state)}\n\n"
                    # Stop streaming after pipeline finishes
                    if not state["running"] and state["finished_at"]:
                        yield f"data: {json.dumps(state)}\n\n"
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            ps.unsubscribe(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/test")
async def test_pipeline(
    limit: int = Query(2, ge=1, le=20, description="Max posts to AI-filter"),
    source: Optional[str] = Query(None, description="Limit to one source: instagram, tiktok, or reddit"),
):
    """Run the pipeline in test mode: scrape, filter a small batch, return results without persisting."""
    valid_sources = {"instagram", "tiktok", "reddit"}
    if source and source not in valid_sources:
        raise HTTPException(status_code=400, detail=f"source must be one of {valid_sources}")

    scored = await run_pipeline(limit=limit, source=source)
    return {
        "mode": "test",
        "limit": limit,
        "source": source or "all",
        "results_count": len(scored) if scored else 0,
        "results": scored or [],
    }


@app.get("/sources")
def get_sources():
    """Active scraping sources and their configuration."""
    ig_hashtags = [x.strip() for x in os.getenv("INSTAGRAM_HASHTAGS", "").split(",") if x.strip()]
    tt_hashtags = [x.strip() for x in os.getenv("TIKTOK_HASHTAGS", "").split(",") if x.strip()]
    reddit_subs = [x.strip() for x in os.getenv("REDDIT_SUBREDDITS", "").split(",") if x.strip()]
    per_source = int(os.getenv("POSTS_PER_HASHTAG", 30))

    sources = []
    if ig_hashtags:
        sources.append({
            "name": "Instagram",
            "icon": "📸",
            "type": "apify",
            "actor": "apify/instagram-hashtag-scraper",
            "tags": ig_hashtags,
            "posts_per_tag": per_source,
        })
    if tt_hashtags:
        sources.append({
            "name": "TikTok",
            "icon": "🎵",
            "type": "apify",
            "actor": "clockworks/free-tiktok-scraper",
            "tags": tt_hashtags,
            "posts_per_tag": per_source,
        })
    if reddit_subs:
        sources.append({
            "name": "Reddit",
            "icon": "🤖",
            "type": "api",
            "actor": "Reddit JSON API (no key required)",
            "tags": reddit_subs,
            "posts_per_tag": per_source,
        })

    return {
        "sources": sources,
        "ai_model": "claude-sonnet-4-6",
        "score_threshold": float(os.getenv("AI_SCORE_THRESHOLD", 5.0)),
    }


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Dashboard counts."""
    total = db.query(Meme).count()
    pending = db.query(Meme).filter(Meme.status == "pending").count()
    approved = db.query(Meme).filter(Meme.status == "approved").count()
    rejected = db.query(Meme).filter(Meme.status == "rejected").count()
    saved = db.query(Meme).filter(Meme.status == "saved").count()

    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "saved": saved,
    }
