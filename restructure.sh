#!/bin/bash
# Run this from inside your sto-meme-generator directory
# Usage: bash restructure.sh

set -e

echo "Creating directory structure..."
mkdir -p backend/scraper backend/ai backend/db
mkdir -p frontend/src

echo "Moving backend files..."
mv main.py         backend/main.py
mv pipeline.py     backend/pipeline.py
mv requirements.txt backend/requirements.txt
mv apify_scraper.py backend/scraper/apify_scraper.py
mv reddit_scraper.py backend/scraper/reddit_scraper.py
mv filter.py        backend/ai/filter.py
mv database.py      backend/db/database.py

echo "Creating Python __init__ files..."
touch backend/scraper/__init__.py
touch backend/ai/__init__.py
touch backend/db/__init__.py

echo "Moving frontend files..."
mv App.jsx       frontend/src/App.jsx
mv main.jsx      frontend/src/main.jsx
mv index.css     frontend/src/index.css
mv index.html    frontend/index.html
mv vite.config.js frontend/vite.config.js
mv package.json  frontend/package.json
mv nginx.conf    frontend/nginx.conf

echo ""
echo "Handling Dockerfiles..."
# If there is only one Dockerfile, figure out which it is and create the other
if [ -f Dockerfile ]; then
  if grep -q "python" Dockerfile; then
    echo "  Found backend Dockerfile — moving to backend/Dockerfile"
    mv Dockerfile backend/Dockerfile
    echo "  Creating frontend Dockerfile..."
    cat > frontend/Dockerfile << 'EOF'
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
EOF
  else
    echo "  Found frontend Dockerfile — moving to frontend/Dockerfile"
    mv Dockerfile frontend/Dockerfile
    echo "  Creating backend Dockerfile..."
    cat > backend/Dockerfile << 'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF
  fi
fi

echo ""
echo "Verifying structure..."
find . -not -path './mnt*' -not -path './.git*' -type f | sort

echo ""
echo "Done. Now run: docker compose up --build -d"
