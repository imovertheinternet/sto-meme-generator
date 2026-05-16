import json
import logging
import os

import anthropic
import httpx
from anthropic import Anthropic

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SCORE_THRESHOLD = float(os.getenv("AI_SCORE_THRESHOLD", 5.0))

SYSTEM_PROMPT = """You are a content curator for StickThisOn, a company that sells PVC morale patches
and stickers targeting the 2A (Second Amendment), military, and EDC (everyday carry) community.

Brand voice: irreverent, edgy, parody-driven. Think "Seconds Away From A War Crime" and
"Robbing a Bank Is Not Financial Advice" — absurdist humor that resonates with the tactical community.

Your job is to find SOURCE MEMES AND HUMOR CONCEPTS that could be turned into original patch/sticker designs.

CRITICAL DISQUALIFIERS — score patch_score=0 and composite_score=1 immediately if the image is:
- A photo of existing patches laid out, displayed, or worn on a vest/plate carrier
- A product shot or haul photo of patches someone already owns
- A photo of a patch board, morale patch collection, or gear layout
- Any image where the primary subject is already-made patches or stickers
These posts are from collector communities. We want original humor concepts, not copies of existing products.

Score each submission on these four axes (0-10 each):
1. humor_score: How funny/shareable is this within the 2A/military/EDC community?
2. patch_score: How well would this CONCEPT translate to a 3-inch PVC patch or die-cut sticker?
   (Consider: bold shapes, readable at small size, iconic imagery, not too text-heavy.
   Score 0 immediately if this is a photo of existing patches — see disqualifiers above.)
3. originality_score: Is this a fresh concept or an overused meme format/template?
4. legal_flag: Does this contain logos, copyrighted characters, real people's likenesses,
   or content that would create IP/liability exposure? (true = risky, false = clean)

Return ONLY valid JSON, no preamble, no markdown fences:
{
  "humor_score": 0-10,
  "patch_score": 0-10,
  "originality_score": 0-10,
  "legal_flag": true|false,
  "composite_score": 0-10,
  "reasoning": "2-3 sentence explanation of scores and why/why not this works as a patch"
}

composite_score should weight patch_score most heavily (it must work as a physical product),
then humor_score, then originality_score. legal_flag does not reduce the score but must be noted."""


async def filter_meme(post: dict) -> dict:
    """
    Sends a meme to Claude for brand-fit scoring.
    Returns the post dict augmented with ai_ fields.
    Returns None if the post should be dropped entirely.
    """
    image_url = post.get("image_url", "")
    caption = post.get("caption", "")
    source = post.get("source", "")
    likes = post.get("likes", 0)

    if not image_url:
        logger.debug(f"Skipping post {post['id']} — no image URL")
        return None

    user_message_content = []

    # Attempt to fetch and include image
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(image_url, follow_redirects=True)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "image/jpeg")
            if "image" not in content_type:
                raise ValueError(f"Not an image: {content_type}")

            import base64

            image_data = base64.standard_b64encode(resp.content).decode("utf-8")
            user_message_content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": content_type.split(";")[0],
                        "data": image_data,
                    },
                }
            )
    except Exception as e:
        logger.warning(
            f"Could not fetch image for {post['id']}: {e} — scoring text only"
        )

    user_message_content.append(
        {
            "type": "text",
            "text": (
                f"Source: {source}\n"
                f"Caption: {caption}\n"
                f"Likes: {likes}\n\n"
                "Score this content for StickThisOn patch/sticker potential."
            ),
        }
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message_content}],
        )

        if not response.content:
            logger.error(
                f"Empty response from Claude for {post['id']} — stop_reason: {response.stop_reason}"
            )
            return None

        raw = response.content[0].text.strip()
        logger.debug(f"Claude raw response for {post['id']}: {raw[:300]}")

        # Robustly extract JSON — handles prose before/after, markdown fences, plain JSON
        # Strategy: find the outermost { ... } regardless of surrounding text
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            logger.error(f"No JSON object found for {post['id']} | raw: {raw[:300]!r}")
            return None
        json_str = raw[start : end + 1]
        scores = json.loads(json_str)

        post["ai_score"] = float(scores.get("composite_score", 0))
        post["ai_humor_score"] = float(scores.get("humor_score", 0))
        post["ai_patch_score"] = float(scores.get("patch_score", 0))
        post["ai_originality_score"] = float(scores.get("originality_score", 0))
        post["ai_legal_flag"] = bool(scores.get("legal_flag", False))
        post["ai_reasoning"] = scores.get("reasoning", "")

        if post["ai_score"] < SCORE_THRESHOLD:
            logger.debug(
                f"Post {post['id']} scored {post['ai_score']:.1f} — below threshold, dropping"
            )
            return None

        logger.info(f"Post {post['id']} scored {post['ai_score']:.1f} — keeping")
        return post

    except json.JSONDecodeError as e:
        logger.error(
            f"Claude returned non-JSON for {post['id']}: {e} | raw was: {raw!r}"
        )
        return None
    except Exception as e:
        logger.error(f"AI filtering failed for {post['id']}: {e}", exc_info=True)
        return None


async def filter_batch(posts: list[dict]) -> list[dict]:
    """Filter a list of posts, returning only those that pass the threshold."""
    import asyncio

    # Semaphore: max 5 concurrent Claude calls to avoid rate limit bursts
    sem = asyncio.Semaphore(5)

    async def guarded_filter(post):
        async with sem:
            return await filter_meme(post)

    tasks = [guarded_filter(p) for p in posts]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
