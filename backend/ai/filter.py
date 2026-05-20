import json
import logging
import os

import anthropic
import httpx
from anthropic import Anthropic
from db.database import Meme, PreferenceRules, SessionLocal

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SCORE_THRESHOLD = float(os.getenv("AI_SCORE_THRESHOLD", 5.0))

SYSTEM_PROMPT = """You are a content curator for StickThisOn, a company that sells PVC morale patches,
UV-printed patches, and stickers targeting the 2A (Second Amendment), military, and EDC (everyday carry) community.

Brand voice: irreverent, edgy, parody-driven. Think "Seconds Away From A War Crime" and
"Robbing a Bank Is Not Financial Advice" — absurdist humor that resonates with the tactical community.

Your job is to find SOURCE MEMES AND HUMOR CONCEPTS that could be turned into original patch/sticker designs.

CRITICAL DISQUALIFIERS — score patch_score=0 and composite_score=1 immediately if the image is:
- A photo of existing patches laid out, displayed, or worn on a vest/plate carrier
- A product shot or haul photo of patches someone already owns
- A photo of a patch board, morale patch collection, or gear layout
- Any image where the primary subject is already-made patches or stickers
These posts are from collector communities. We want original humor concepts, not copies of existing products.

PRODUCTION METHODS — we have two ways to make patches, so score accordingly:
- PVC patches: Best for bold shapes, simple designs, iconic imagery, readable at small size. Limited color/detail.
- UV-printed patches: Can reproduce ANY image directly — photos, gradients, complex artwork, detailed
  illustrations, and text-heavy designs all work. Much fewer design constraints than PVC.
An image does NOT need to be simple or bold to score well on patch_score. If it would look great as a
UV-printed patch (even with complex detail, photos, or gradients), score it highly.

Score each submission on these four axes (0-10 each):
1. humor_score: How funny/shareable is this within the 2A/military/EDC community?
2. patch_score: How well would this CONCEPT translate to a patch (PVC or UV-printed) or die-cut sticker?
   (Consider both production methods above. Score 0 immediately if this is a photo of existing patches.)
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


def _build_preference_examples(limit: int = 26) -> str:
    """Pull recent approved/rejected memes to teach the model the user's taste."""
    db = SessionLocal()
    try:
        decided = (
            db.query(Meme)
            .filter(Meme.status.in_(["approved", "rejected"]))
            .order_by(Meme.decided_at.desc())
            .limit(limit)
            .all()
        )
        if not decided:
            return ""

        lines = [
            "\n\nLEARNED PREFERENCES — The curator has reviewed past submissions. "
            "Use these decisions to calibrate your scoring to match their taste:"
        ]
        for m in decided:
            decision = "APPROVED" if m.status == "approved" else "REJECTED"
            caption_preview = (m.caption or "")[:80]
            notes = f' | Curator notes: "{m.user_notes}"' if m.user_notes else ""
            lines.append(
                f'- [{decision}] source={m.source}, caption="{caption_preview}", '
                f"ai_score={m.ai_score}, humor={m.ai_humor_score}, "
                f"patch={m.ai_patch_score}, originality={m.ai_originality_score}"
                f"{notes}"
            )

        lines.append(
            "\nAdjust your scoring to align with these decisions. "
            "If the curator approved low-scoring items, be more generous with similar content. "
            "If they rejected high-scoring items, be stricter with similar content."
        )
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Could not load preference examples: {e}")
        return ""
    finally:
        db.close()


PREFERENCE_ANALYSIS_PROMPT = """You are analyzing a content curator's decision history for StickThisOn,
a company that sells PVC/UV-printed patches and stickers for the 2A/military/EDC community.

Below is every meme the curator has approved, rejected, or saved, along with AI scores and any notes they left.

Your job: distill their taste into 10-15 concise, actionable scoring rules. These rules will be injected
into the scoring prompt so future memes are evaluated to match this curator's preferences.

Focus on PATTERNS, not individual posts:
- What humor styles do they consistently approve vs reject?
- What score ranges correlate with their approvals?
- Are there content types they always approve regardless of score?
- Are there content types they always reject regardless of score?
- Do their notes reveal preferences the scores don't capture?
- What themes, formats, or aesthetics do they gravitate toward?

Return ONLY a numbered list of rules, no preamble. Each rule should be one sentence.
Example format:
1. Prefer absurdist/dark humor over wholesome or motivational content.
2. Reject memes that are just photos of existing patch collections.
3. ...
"""

REGEN_THRESHOLD = 20  # regenerate rules after this many new decisions


def _get_preference_rules() -> str:
    """Return the latest distilled preference rules, or empty string if none exist."""
    db = SessionLocal()
    try:
        latest = (
            db.query(PreferenceRules)
            .order_by(PreferenceRules.created_at.desc())
            .first()
        )
        if not latest:
            return ""
        return (
            "\n\nCURATOR PREFERENCE RULES — Distilled from their approval history. "
            "Use these rules to calibrate your scoring:\n" + latest.rules_text
        )
    except Exception as e:
        logger.warning(f"Could not load preference rules: {e}")
        return ""
    finally:
        db.close()


def _should_regenerate_rules() -> bool:
    """Check if enough new decisions have been made to warrant regenerating rules."""
    db = SessionLocal()
    try:
        total_decided = (
            db.query(Meme)
            .filter(Meme.status.in_(["approved", "rejected", "saved"]))
            .count()
        )
        latest = (
            db.query(PreferenceRules)
            .order_by(PreferenceRules.created_at.desc())
            .first()
        )
        last_count = latest.decisions_analyzed if latest else 0
        return (total_decided - last_count) >= REGEN_THRESHOLD
    except Exception as e:
        logger.warning(f"Could not check regen status: {e}")
        return False
    finally:
        db.close()


async def analyze_preferences() -> str:
    """Analyze all historical decisions and distill preference rules via Claude."""
    db = SessionLocal()
    try:
        decided = (
            db.query(Meme)
            .filter(Meme.status.in_(["approved", "rejected", "saved"]))
            .order_by(Meme.decided_at.desc())
            .all()
        )
        if len(decided) < 5:
            logger.info(f"Only {len(decided)} decisions — too few to analyze")
            return ""

        lines = []
        for m in decided:
            status_label = m.status.upper()
            caption_preview = (m.caption or "")[:120]
            notes = f' | Notes: "{m.user_notes}"' if m.user_notes else ""
            lines.append(
                f"[{status_label}] source={m.source}, caption=\"{caption_preview}\", "
                f"ai_score={m.ai_score}, humor={m.ai_humor_score}, "
                f"patch={m.ai_patch_score}, originality={m.ai_originality_score}, "
                f"legal_flag={m.ai_legal_flag}{notes}"
            )

        decision_summary = "\n".join(lines)
        total = len(decided)
        approved = sum(1 for m in decided if m.status == "approved")
        rejected = sum(1 for m in decided if m.status == "rejected")
        saved = sum(1 for m in decided if m.status == "saved")

        user_message = (
            f"Total decisions: {total} (approved: {approved}, rejected: {rejected}, saved: {saved})\n\n"
            f"DECISION HISTORY:\n{decision_summary}"
        )

        logger.info(f"Analyzing {total} decisions to distill preference rules...")

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=[{"type": "text", "text": PREFERENCE_ANALYSIS_PROMPT}],
            messages=[{"role": "user", "content": user_message}],
        )

        rules_text = response.content[0].text.strip()
        logger.info(f"Generated preference rules:\n{rules_text}")

        # Save to DB
        new_rules = PreferenceRules(
            rules_text=rules_text,
            decisions_analyzed=total,
        )
        db.add(new_rules)
        db.commit()

        logger.info(f"Saved new preference rules (analyzed {total} decisions)")
        return rules_text

    except Exception as e:
        logger.error(f"Preference analysis failed: {e}", exc_info=True)
        return ""
    finally:
        db.close()


async def filter_meme(post: dict, system_prompt: str = None) -> dict:
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
        effective_prompt = system_prompt or (SYSTEM_PROMPT + _build_preference_examples())

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": effective_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_message_content}],
        )

        usage = response.usage
        cache_created = getattr(usage, "cache_creation_input_tokens", 0)
        cache_read = getattr(usage, "cache_read_input_tokens", 0)
        logger.info(
            f"Post {post['id']} tokens — input: {usage.input_tokens}, output: {usage.output_tokens}, "
            f"cache_created: {cache_created}, cache_read: {cache_read}"
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

    # Use distilled rules if available, fall back to raw examples
    rules = _get_preference_rules()
    if rules:
        system_prompt = SYSTEM_PROMPT + rules
        logger.info("Using distilled preference rules for scoring")
    else:
        system_prompt = SYSTEM_PROMPT + _build_preference_examples()
        logger.info("No distilled rules yet — using raw preference examples")

    sem = asyncio.Semaphore(5)

    async def guarded_filter(post):
        async with sem:
            return await filter_meme(post, system_prompt=system_prompt)

    tasks = [guarded_filter(p) for p in posts]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
