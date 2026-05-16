import os
import hashlib
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

POSTS_PER_SUBREDDIT = int(os.getenv("POSTS_PER_HASHTAG", 30))
HEADERS = {"User-Agent": "StickThisOn-MemeAgent/1.0"}

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _is_image_post(post: dict) -> bool:
    url = post.get("url", "")
    return (
        post.get("post_hint") == "image"
        or any(url.lower().endswith(ext) for ext in IMAGE_EXTENSIONS)
        or "i.redd.it" in url
        or "i.imgur.com" in url
    )


def scrape_reddit_subreddits(subreddits: list[str]) -> list[dict]:
    """
    Fetches top posts from subreddits via Reddit's public JSON endpoint.
    No API credentials required for public subreddits.
    """
    results = []

    for subreddit in subreddits:
        url = f"https://www.reddit.com/r/{subreddit}/top.json"
        params = {"limit": POSTS_PER_SUBREDDIT, "t": "day"}

        logger.info(f"Fetching r/{subreddit}")

        try:
            resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})

                if post.get("is_self") or not _is_image_post(post):
                    continue

                image_url = post.get("url", "")
                # Reddit wraps images in preview — grab the source
                preview = post.get("preview", {})
                if preview:
                    images = preview.get("images", [])
                    if images:
                        image_url = images[0].get("source", {}).get("url", image_url)
                        # Reddit HTML-encodes preview URLs
                        image_url = image_url.replace("&amp;", "&")

                results.append({
                    "id": _hash_url(post.get("permalink", image_url)),
                    "source": "reddit",
                    "source_url": f"https://reddit.com{post.get('permalink', '')}",
                    "image_url": image_url,
                    "video_url": None,
                    "is_video": False,
                    "caption": post.get("title", "")[:1000],
                    "hashtags": f"['{subreddit}']",
                    "likes": post.get("score", 0),
                    "platform_id": post.get("id", ""),
                    "created_at": datetime.utcfromtimestamp(post.get("created_utc", 0)),
                })

        except Exception as e:
            logger.error(f"Reddit scrape failed for r/{subreddit}: {e}")

    logger.info(f"Reddit: scraped {len(results)} posts")
    return results
