import os
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from db.database import SessionLocal, Meme, SeenID, init_db
from scraper.apify_scraper import scrape_instagram_hashtags, scrape_tiktok_hashtags
from scraper.reddit_scraper import scrape_reddit_subreddits
from ai.filter import filter_batch

logger = logging.getLogger(__name__)


def _parse_list(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [x.strip() for x in raw.split(",") if x.strip()]


def _is_seen(db: Session, platform_id: str, source: str) -> bool:
    return db.query(SeenID).filter_by(platform_id=platform_id, source=source).first() is not None


def _mark_seen(db: Session, platform_id: str, source: str):
    if platform_id and not _is_seen(db, platform_id, source):
        db.add(SeenID(platform_id=platform_id, source=source))


def _persist(db: Session, posts: list[dict]) -> int:
    saved = 0
    for post in posts:
        existing = db.query(Meme).filter_by(id=post["id"]).first()
        if existing:
            continue

        meme = Meme(
            id=post["id"],
            source=post["source"],
            source_url=post.get("source_url", ""),
            image_url=post.get("image_url", ""),
            video_url=post.get("video_url"),
            is_video=post.get("is_video", False),
            caption=post.get("caption", ""),
            hashtags=post.get("hashtags", "[]"),
            likes=post.get("likes", 0),
            platform_id=post.get("platform_id", ""),
            ai_score=post.get("ai_score"),
            ai_humor_score=post.get("ai_humor_score"),
            ai_patch_score=post.get("ai_patch_score"),
            ai_originality_score=post.get("ai_originality_score"),
            ai_legal_flag=post.get("ai_legal_flag", False),
            ai_reasoning=post.get("ai_reasoning", ""),
            created_at=post.get("created_at"),
            status="pending",
        )
        db.add(meme)
        _mark_seen(db, post.get("platform_id", post["id"]), post["source"])
        saved += 1

    db.commit()
    return saved


async def run_pipeline(
    limit: int | None = None,
    source: str | None = None,
) -> list[dict] | None:
    """
    Full daily pipeline:
    1. Scrape all sources
    2. Deduplicate against seen_ids
    3. AI filter
    4. Persist survivors to DB

    When `limit` is set, run in **test mode**:
    - Only AI-filter the first `limit` unseen posts
    - Skip DB persistence
    - Return the scored post dicts directly

    When `source` is set, restrict scraping to that platform
    ("instagram", "tiktok", or "reddit").
    """
    init_db()
    db = SessionLocal()
    test_mode = limit is not None
    logger.info(
        f"Pipeline started at {datetime.utcnow().isoformat()}"
        f"{' [TEST mode, limit=' + str(limit) + ']' if test_mode else ''}"
        f"{' [source=' + source + ']' if source else ''}"
    )

    try:
        ig_hashtags = _parse_list("INSTAGRAM_HASHTAGS")
        tt_hashtags = _parse_list("TIKTOK_HASHTAGS")
        reddit_subs = _parse_list("REDDIT_SUBREDDITS")

        # --- Scrape (optionally filtered by source) ---
        raw_posts = []

        if ig_hashtags and (source is None or source == "instagram"):
            raw_posts += scrape_instagram_hashtags(ig_hashtags)

        if tt_hashtags and (source is None or source == "tiktok"):
            raw_posts += scrape_tiktok_hashtags(tt_hashtags)

        if reddit_subs and (source is None or source == "reddit"):
            raw_posts += scrape_reddit_subreddits(reddit_subs)

        logger.info(f"Total raw posts scraped: {len(raw_posts)}")

        # --- Dedup ---
        unseen = [
            p for p in raw_posts
            if not _is_seen(db, p.get("platform_id", p["id"]), p["source"])
        ]
        logger.info(f"After dedup: {len(unseen)} new posts")

        if not unseen:
            logger.info("Nothing new to process.")
            return [] if test_mode else None

        # --- AI Filter ---
        to_filter = unseen[:limit] if test_mode else unseen
        logger.info(f"Sending {len(to_filter)} posts to AI filter")
        scored = await filter_batch(to_filter)
        logger.info(f"After AI filtering: {len(scored)} posts passed threshold")

        if test_mode:
            logger.info(f"Test mode — returning {len(scored)} scored posts (not persisted)")
            return scored

        # --- Persist (production mode only) ---
        saved = _persist(db, scored)
        logger.info(f"Pipeline complete. Saved {saved} new memes to review queue.")
        return None

    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        if test_mode:
            raise
        return None
    finally:
        db.close()
