# StickThisOn Meme Agent

Docker Compose project. Two containers: sto-backend (FastAPI, port 8000) 
and sto-frontend (nginx/React, port 3000).

## Key files
- backend/ai/filter.py — Claude API scoring prompt
- backend/pipeline.py — main scrape/dedup/filter/persist orchestration  
- backend/scraper/apify_scraper.py — Instagram + TikTok via Apify
- backend/db/database.py — SQLAlchemy models
- .env — API keys and hashtag config (never commit this)
- data/memes.db — SQLite database

## Common tasks
- View logs: docker logs sto-backend -f
- Restart backend: docker compose restart backend
- Trigger pipeline: curl -X POST http://localhost:8000/run
- Check DB: sqlite3 data/memes.db
