# StickThisOn Meme Agent — Architecture & ERD

## System Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE  (pipeline.py)                            │
│                         Triggered daily or via /run                        │
│                                                                            │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│   │  Instagram    │   │   TikTok     │   │   Reddit     │                  │
│   │  (Apify API)  │   │  (Apify API) │   │ (Public JSON)│                  │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                  │
│          │                  │                   │                           │
│          └──────────────────┼───────────────────┘                           │
│                             ▼                                              │
│                    ┌────────────────┐                                       │
│                    │   RAW POSTS    │                                       │
│                    │  (in memory)   │                                       │
│                    └───────┬────────┘                                       │
│                            ▼                                               │
│               ┌─────────────────────┐     ┌─────────────────────┐          │
│               │     DEDUP CHECK     │────▶│     seen_ids        │          │
│               │  _is_seen() lookup  │     │  (database table)   │          │
│               └─────────┬───────────┘     └─────────────────────┘          │
│                         ▼                                                  │
│                  Only unseen posts                                         │
│                         ▼                                                  │
│          ┌──────────────────────────────┐                                   │
│          │       AI FILTER (filter.py)  │                                   │
│          │                              │                                   │
│          │  1. Fetch image from CDN     │                                   │
│          │  2. Build system prompt:     │                                   │
│          │     - Brand voice & rules    │                                   │
│          │     - PVC + UV-print criteria│                                   │
│          │     - Last 26 user decisions │◀──── memes table (approved/       │
│          │       as few-shot examples   │      rejected history)            │
│          │  3. Send image + caption     │                                   │
│          │     to Claude Sonnet 4.6     │                                   │
│          │  4. Parse JSON scores        │                                   │
│          │  5. Drop if < threshold      │                                   │
│          └─────────────┬────────────────┘                                   │
│                        ▼                                                   │
│                 Posts scoring ≥ 5.0                                         │
│                        ▼                                                   │
│             ┌─────────────────────┐                                         │
│             │   PERSIST to DB     │                                         │
│             │  status = "pending" │                                         │
│             │  + mark seen_ids    │                                         │
│             └─────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND  (main.py)                            │
│                                                                            │
│   GET /queue ──────── Pending memes, sorted by ai_score DESC               │
│   GET /history ────── Decided memes (approved/rejected/saved)              │
│   GET /stats ──────── Dashboard counts                                     │
│   PATCH /meme/:id/decide ── Set status + auto-download image if approved   │
│   POST /run ───────── Manually trigger pipeline                            │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND  (App.jsx)                              │
│                                                                            │
│   ┌──────────────────────┐    ┌──────────────────────────┐                 │
│   │     QUEUE VIEW       │    │      HISTORY VIEW        │                 │
│   │                      │    │                          │                 │
│   │  Queue list (left)   │    │  Filter tabs: approved / │                 │
│   │  Detail panel (right)│    │    saved / rejected      │                 │
│   │                      │    │  Image grid + detail     │                 │
│   │  Actions:            │    │    sidebar               │                 │
│   │   ✅ Approve         │    │                          │                 │
│   │   🔖 Save            │    │  Actions:                │                 │
│   │   ❌ Pass (reject)   │    │   Move to: [other status]│                 │
│   └──────────────────────┘    └──────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                            memes                                      │
├──────────────────────┬───────────┬────────────────────────────────────┤
│ Column               │ Type      │ Purpose                            │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ 🔑 id                │ VARCHAR   │ SHA-256 hash of source_url         │
│ source               │ VARCHAR   │ "instagram" | "tiktok" | "reddit"  │
│ source_url           │ VARCHAR   │ Original post URL (unique)         │
│ image_url            │ VARCHAR   │ CDN link to the image              │
│ video_url            │ VARCHAR   │ CDN link to video (if applicable)  │
│ is_video             │ BOOLEAN   │ True if post is a video            │
│ caption              │ TEXT      │ Post caption / text content        │
│ hashtags             │ TEXT      │ JSON array of hashtags             │
│ likes                │ INTEGER   │ Like/upvote count at scrape time   │
│ platform_id          │ VARCHAR   │ Native platform post ID            │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ ai_score             │ FLOAT     │ Composite score (0-10), weighted   │
│                      │           │   toward patch_score               │
│ ai_humor_score       │ FLOAT     │ How funny for 2A/mil/EDC audience  │
│ ai_patch_score       │ FLOAT     │ PVC or UV-print translatability    │
│ ai_originality_score │ FLOAT     │ Freshness vs overused template     │
│ ai_legal_flag        │ BOOLEAN   │ True = potential IP/liability risk  │
│ ai_reasoning         │ TEXT      │ Claude's 2-3 sentence explanation  │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ status               │ VARCHAR   │ "pending" → "approved" | "rejected"│
│                      │           │   | "saved"                        │
│ user_notes           │ TEXT      │ Your notes (e.g. design ideas)     │
│ decided_at           │ DATETIME  │ When you made the decision         │
│ local_image_path     │ VARCHAR   │ Path to downloaded image on host   │
│                      │           │   (set on approve/save)            │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ fetched_at           │ DATETIME  │ When the pipeline scraped this     │
│ created_at           │ DATETIME  │ Original post date on platform     │
└──────────────────────┴───────────┴────────────────────────────────────┘
        │
        │  platform_id + source
        │  matches for dedup
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          seen_ids                                     │
├──────────────────────┬───────────┬────────────────────────────────────┤
│ Column               │ Type      │ Purpose                            │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ 🔑 platform_id       │ VARCHAR   │ Native post ID from the platform   │
│ source               │ VARCHAR   │ "instagram" | "tiktok" | "reddit"  │
│ seen_at              │ DATETIME  │ When first encountered             │
└──────────────────────┴───────────┴────────────────────────────────────┘
```

## How the pieces connect

### Scraping (apify_scraper.py, reddit_scraper.py)
Pulls raw posts from Instagram, TikTok (via Apify actors), and Reddit (public JSON).
Each post gets a `platform_id` (the native post ID) and a `source` tag.
Images are NOT downloaded here — just the CDN URLs.

### Deduplication (pipeline.py)
Before any AI processing, each post's `platform_id + source` is checked against the
`seen_ids` table. Already-seen posts are silently dropped. This prevents paying for
Claude to re-score the same content.

### AI Filter (filter.py) — The "Brain"
Each unseen post is sent to Claude Sonnet 4.6 with:
- **The image** (base64-encoded, fetched from CDN)
- **Caption + metadata** (source, likes)
- **System prompt** containing:
  - Brand voice definition (irreverent, edgy, 2A/mil/EDC)
  - Critical disqualifiers (photos of existing patches = instant 0)
  - Production method awareness (PVC + UV printing capabilities)
  - Scoring rubric (humor, patch fit, originality, legal risk)
  - **Last 26 user decisions** as calibration examples

Claude returns a JSON score object. Posts below `AI_SCORE_THRESHOLD` (default 5.0)
are dropped. Survivors are persisted to the `memes` table with `status = "pending"`.

### Backend API (main.py)
FastAPI serves the React frontend and exposes REST endpoints.
The `/meme/:id/decide` endpoint is where user decisions land — it updates the
meme's status and, if approved/saved, auto-downloads the image to `data/images/`.

### Frontend (App.jsx)
React SPA with two views:
- **Queue**: review pending memes one by one (approve/save/pass)
- **History**: browse decided memes, change decisions if needed

## Data lifecycle of a single meme

```
Platform post
    │
    ▼
Scraped by Apify/Reddit ──► platform_id recorded in seen_ids
    │
    ▼
Claude scores it (image + caption)
    │
    ├── Score < 5.0 ──► Dropped (never stored in memes table)
    │
    └── Score ≥ 5.0 ──► Saved to memes table (status = "pending")
                            │
                            ▼
                    You review in the UI
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
            APPROVE       SAVE        PASS
          (download     (download    (status =
           image)        image)     "rejected")
                │           │
                ▼           ▼
         data/images/   data/images/
         {id}.jpg       {id}.jpg

         ──── Future pipeline runs use your decisions ────
         ──── to calibrate AI scoring via few-shot examples ────
```
