import hashlib
import logging
import os
from datetime import datetime

from apify_client import ApifyClient

logger = logging.getLogger(__name__)

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
POSTS_PER_HASHTAG = int(os.getenv("POSTS_PER_HASHTAG", 30))

client = ApifyClient(APIFY_TOKEN)


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def scrape_instagram_hashtags(hashtags: list[str]) -> list[dict]:
    """
    Uses Apify's instagram-hashtag-scraper actor.
    Returns normalized post dicts ready for AI filtering.
    """
    results = []

    run_input = {
        "hashtags": hashtags,
        "resultsLimit": POSTS_PER_HASHTAG,
        "resultsType": "posts",
        "extendOutputFunction": "($) => { return {} }",
    }

    logger.info(f"Scraping Instagram hashtags: {hashtags}")

    try:
        run = client.actor("apify/instagram-hashtag-scraper").call(run_input=run_input)

        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            # Normalize to our internal schema
            image_url = item.get("displayUrl") or item.get("thumbnailUrl") or ""
            if not image_url:
                continue

            post = {
                "id": _hash_url(item.get("url", image_url)),
                "source": "instagram",
                "source_url": item.get("url", ""),
                "image_url": image_url,
                "video_url": item.get("videoUrl"),
                "is_video": item.get("isVideo", False),
                "caption": item.get("caption", "")[:1000],
                "hashtags": str(item.get("hashtags", [])),
                "likes": item.get("likesCount", 0),
                "platform_id": item.get("id", ""),
                "created_at": _parse_timestamp(item.get("timestamp")),
            }
            results.append(post)

    except Exception as e:
        logger.error(f"Instagram scrape failed: {e}")

    logger.info(f"Instagram: scraped {len(results)} posts")
    return results


def scrape_tiktok_hashtags(hashtags: list[str]) -> list[dict]:
    """
    Uses Apify's tiktok-scraper actor.
    Returns normalized post dicts ready for AI filtering.
    """
    results = []

    for hashtag in hashtags:
        run_input = {
            "hashtags": [hashtag],
            "resultsPerPage": POSTS_PER_HASHTAG,
            "maxRequestRetries": 3,
        }

        logger.info(f"Scraping TikTok hashtag: #{hashtag}")

        try:
            run = client.actor("clockworks/free-tiktok-scraper").call(
                run_input=run_input
            )

            for item in client.dataset(run["defaultDatasetId"]).iterate_items():
                # Log actual keys on first item to verify field mapping
                if not results:
                    logger.info(f"TikTok item keys sample: {list(item.keys())}")

                # covers can be list of strings or list of dicts depending on actor version
                covers = item.get("covers", [])
                if covers and isinstance(covers[0], dict):
                    image_url = covers[0].get("url", "")
                elif covers and isinstance(covers[0], str):
                    image_url = covers[0]
                else:
                    image_url = (
                        item.get("cover")
                        or item.get("thumbnail")
                        or item.get("thumbnailUrl")
                        or item.get("originCover")
                        or ""
                    )

                video_url = (
                    item.get("videoUrl")
                    or item.get("downloadUrl")
                    or (item.get("video") or {}).get("downloadAddr", "")
                    or item.get("webVideoUrl", "")
                )

                if not image_url and not video_url:
                    continue

                post = {
                    "id": _hash_url(item.get("webVideoUrl", video_url or image_url)),
                    "source": "tiktok",
                    "source_url": item.get("webVideoUrl", ""),
                    "image_url": image_url,
                    "video_url": video_url,
                    "is_video": True,
                    "caption": item.get("text", "")[:1000],
                    "hashtags": str([t.get("name") for t in item.get("hashtags", [])]),
                    "likes": item.get("diggCount", 0),
                    "platform_id": item.get("id", ""),
                    "created_at": _parse_timestamp(item.get("createTime")),
                }
                results.append(post)

        except Exception as e:
            logger.error(f"TikTok scrape failed for #{hashtag}: {e}")

    logger.info(f"TikTok: scraped {len(results)} posts")
    return results


def _parse_timestamp(ts) -> datetime | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.utcfromtimestamp(ts)
        if isinstance(ts, str):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None
    return None
