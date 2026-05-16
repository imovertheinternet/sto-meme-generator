# StickThisOn Meme Agent 🎯

A daily pipeline that scrapes Instagram, TikTok, and Reddit for meme candidates,
scores them with Claude's vision model for patch/sticker potential, and surfaces
the best ones in a review UI for you to approve, save, or pass on.

---

## Prerequisites

- Docker + Docker Compose installed
- Apify account ($49/mo plan) → https://apify.com
- Anthropic API key → https://console.anthropic.com

---

## Setup (first time)

### 1. Clone and configure

```bash
git clone <this-repo>
cd stickthison-meme-agent
cp .env.example .env
```

### 2. Fill in your .env

Open `.env` and add your keys:

```
ANTHROPIC_API_KEY=sk-ant-...
APIFY_API_TOKEN=apify_api_...
```

Leave everything else as defaults for now — you can tune hashtags,
score thresholds, and schedule times once you've tested it.

### 3. Build and start

```bash
docker compose up --build -d
```

First build takes ~2-3 minutes (installing dependencies).

### 4. Open the UI

http://localhost:3000

---

## Running a scrape manually

In the UI, click **"⚡ Run Now"** in the top-right header.
The pipeline runs in the background — new items appear in the queue within a few minutes.

Or via curl:
```bash
curl -X POST http://localhost:8000/run
```

---

## Daily schedule

By default the pipeline fires at **06:00 UTC** every day.
Change this in `.env`:
```
SCHEDULE_HOUR=8
SCHEDULE_MINUTE=30
```
Then restart: `docker compose restart backend`

---

## Tuning the AI filter

`AI_SCORE_THRESHOLD` in `.env` controls the minimum composite score
a meme needs to reach your review queue. Default is 5.0 out of 10.

- Raise to 6.0+ → fewer, higher-confidence items
- Lower to 4.0 → more items, more noise

---

## Review workflow

| Button | Meaning |
|---|---|
| ✅ APPROVE | Green light — queue for design |
| 🔖 SAVE | Interesting but not ready — review later |
| ❌ PASS | Not a fit — never shown again |

---

## Migrating to a VPS

```bash
# On your VPS (Ubuntu recommended)
docker compose up --build -d
```

That's it. The only file you need to transfer is:
- Your `.env` file (keep this secret)
- Optionally: the `meme-data` Docker volume if you want to preserve history

To export your local DB first:
```bash
docker run --rm -v stickthison-meme-agent_meme-data:/data -v $(pwd):/backup \
  ubuntu tar czf /backup/meme-data-backup.tar.gz /data
```

---

## Architecture

```
Apify (Instagram/TikTok) ─┐
Reddit public JSON        ─┼──► Dedup ──► Claude Vision ──► SQLite ──► FastAPI ──► React UI
Manual (Telegram, Phase 2)─┘
```

---

## Phase 2 (planned)

- Telegram bot for mobile bookmarking (share sheet → pipeline DB)
- Firecrawl competitor catalog cross-reference
- Approval pattern analysis to auto-tune scoring prompt
