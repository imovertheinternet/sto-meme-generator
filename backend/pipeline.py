import os
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from db.database import SessionLocal, Meme, SeenID, init_db
from scraper.apify_scraper import scrape_instagram_hashtags, scrape_tiktok_hashtags
from scraper.reddit_scraper import scrape_reddit_subreddits
from ai.filter import filter_batch
import pipeline_state as ps

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
            logger.debug(f"Skipping {post['id']} — already exists by id")
            continue

        source_url = post.get("source_url", "")
        if source_url and db.query(Meme).filter_by(source_url=source_url).first():
            logger.debug(f"Skipping {post['id']} — duplicate source_url")
            continue

        try:
            meme = Meme(
                id=post["id"],
                source=post["source"],
                source_url=source_url,
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
            db.flush()
            saved += 1
        except Exception as e:
            db.rollback()
            logger.warning(f"Failed to persist {post['id']}: {e}")

    db.commit()
    return saved


async def run_pipeline(
    limit: int | None = None,
    source: str | None = None,
) -> list[dict] | None:
    """
    Full pipeline:
    Step 1/5: Scrape all sources (Instagram, TikTok, Reddit)
    Step 2/5: Deduplicate against seen_ids
    Step 3/5: AI scoring via Claude
    Step 4/5: Persist survivors to DB
    Step 5/5: Done
    """
    init_db()
    db = SessionLocal()

    ps.start_run()
    logger.info("=" * 60)
    logger.info("PIPELINE STARTED")
    logger.info("=" * 60)

    try:
        ig_hashtags = _parse_list("INSTAGRAM_HASHTAGS")
        tt_hashtags = _parse_list("TIKTOK_HASHTAGS")
        reddit_subs = _parse_list("REDDIT_SUBREDDITS")

        # ── Step 1/5: Scrape ─────────────────────────────────────────
        sources = []
        if ig_hashtags:
            sources.append(f"Instagram ({len(ig_hashtags)} hashtags)")
        if tt_hashtags:
            sources.append(f"TikTok ({len(tt_hashtags)} hashtags)")
        if reddit_subs:
            sources.append(f"Reddit ({len(reddit_subs)} subs)")

        ps.update_step(1, "Scraping sources", ", ".join(sources))
        logger.info(f"[Step 1/5] Scraping sources: {', '.join(sources)}")

        raw_posts = []

        if ig_hashtags:
            logger.info(f"[Step 1/5] Scraping Instagram hashtags: {ig_hashtags}")
            raw_posts += scrape_instagram_hashtags(ig_hashtags)
            logger.info(f"[Step 1/5] Instagram: {len(raw_posts)} posts so far")

        if tt_hashtags:
            logger.info(f"[Step 1/5] Scraping TikTok hashtags: {tt_hashtags}")
            raw_posts += scrape_tiktok_hashtags(tt_hashtags)
            logger.info(f"[Step 1/5] +TikTok: {len(raw_posts)} posts total")

        if reddit_subs:
            logger.info(f"[Step 1/5] Scraping Reddit subreddits: {reddit_subs}")
            raw_posts += scrape_reddit_subreddits(reddit_subs)
            logger.info(f"[Step 1/5] +Reddit: {len(raw_posts)} posts total")

        ps.update_counts(scraped=len(raw_posts))
        logger.info(f"[Step 1/5] Scraping complete — {len(raw_posts)} total posts")

        # ── Step 2/5: Dedup ──────────────────────────────────────────
        ps.update_step(2, "Deduplicating", f"Checking {len(raw_posts)} posts against history")
        logger.info(f"[Step 2/5] Deduplicating {len(raw_posts)} posts against seen_ids")

        unseen = [
            p for p in raw_posts
            if not _is_seen(db, p.get("platform_id", p["id"]), p["source"])
        ]

        # Dedup within the batch by source_url
        seen_urls = set()
        deduped = []
        for p in unseen:
            url = p.get("source_url", "")
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            deduped.append(p)
        unseen = deduped

        dupes_removed = len(raw_posts) - len(unseen)
        ps.update_counts(after_dedup=len(unseen))
        logger.info(f"[Step 2/5] Dedup complete — {len(unseen)} new, {dupes_removed} duplicates removed")

        if not unseen:
            logger.info("[Step 2/5] Nothing new to process.")
            ps.finish_run(saved=0)
            return

        # Mark all as seen before scoring
        for p in unseen:
            _mark_seen(db, p.get("platform_id", p["id"]), p["source"])
        db.commit()

        # ── Step 3/5: AI Scoring ─────────────────────────────────────
        ps.update_step(3, "AI scoring", f"Scoring {len(unseen)} memes with Claude")
        ps.update_counts(scoring_total=len(unseen))
        logger.info(f"[Step 3/5] AI scoring — sending {len(unseen)} memes to Claude")

        survivors = await filter_batch(unseen, progress_callback=ps.update_scoring_progress)

        logger.info(f"[Step 3/5] Scoring complete — {len(survivors)}/{len(unseen)} passed threshold")

        # ── Step 4/5: Persist ────────────────────────────────────────
        ps.update_step(4, "Saving to database", f"{len(survivors)} memes to persist")
        logger.info(f"[Step 4/5] Persisting {len(survivors)} memes to database")

        saved = _persist(db, survivors)
        logger.info(f"[Step 4/5] Saved {saved} new memes to review queue")

        # ── Step 5/5: Done ───────────────────────────────────────────
        ps.finish_run(saved=saved)
        logger.info("=" * 60)
        logger.info(f"PIPELINE COMPLETE — {saved} new memes ready for review")
        logger.info(f"  Scraped: {len(raw_posts)} | Deduped: {len(unseen)} | Scored: {len(survivors)} | Saved: {saved}")
        logger.info("=" * 60)

    except Exception as e:
        ps.finish_run(error=str(e))
        logger.error(f"Pipeline error: {e}", exc_info=True)
        if test_mode:
            raise
        return None
    finally:
        db.close()
