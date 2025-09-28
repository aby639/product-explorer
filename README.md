# Product Explorer

Browse real **World of Books** data: navigation → categories → products → details (with description, rating, recommendations, and a **Force refresh**).

**Tech**
- **Frontend:** Next.js (App Router), SWR/React Query, Tailwind v4
- **Backend:** NestJS (REST) with polite scraping & short-term caching
- **DB:** PostgreSQL (Render in prod, Docker locally)
- **Cache/Queue (optional):** Redis (Docker)
- **Deploy:** Render (frontend + backend)

---

## Live Links
- **Frontend:** https://<FRONTEND_URL>.onrender.com  
- **Backend:**  https://<BACKEND_URL>.onrender.com  
- **API Docs (if enabled):** https://<BACKEND_URL>.onrender.com/api/docs

> Replace the placeholders above after deploy.

---

## Repo Layout
```

.
├─ backend/              # NestJS API + scraper
├─ frontend/             # Next.js UI
├─ docker-compose.yml    # local Postgres + Redis
└─ README.md

````

---

## Features
- Landing page with navigation + hero showcase
- Books → **Fiction / Non-fiction**
- Product grid with **images, prices, pagination**
- Product detail with **image, price, scraped description, rating**, **recommendations**, and **Force refresh**
- Views endpoint for simple analytics
- Scraper respects rate limits and caches results; refresh forces re-scrape

---

## Local Development

**Prereqs:** Node 18+, Docker Desktop

```bash
# 0) clone or open the repository root

# 1) start local databases (Postgres + Redis)
docker compose up -d

# 2) backend (http://localhost:8080)
cd backend
copy .env.example .env   # if .env.example exists; otherwise ensure .env has the values below
npm ci
npm run start:dev

# 3) frontend (http://localhost:3000)
cd ../frontend
copy .env.example .env.local  # if present; else create .env.local with the value below
npm ci
npm run dev
````

**Backend `.env` (local)**

```
PORT=8080
DATABASE_URL=postgres://wob:wobpw@localhost:5432/wob
REDIS_URL=redis://localhost:6379

# scraping config
SCRAPE_TTL_MINUTES=1440
RATE_LIMIT_MS=1500
WOB_BASE=https://www.worldofbooks.com/en-gb
```

**Frontend `.env.local` (local)**

```
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

**docker-compose.yml** (included)

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: wob
      POSTGRES_USER: wob
      POSTGRES_PASSWORD: wobpw
    ports: ["5432:5432"]
    volumes: [db_data:/var/lib/postgresql/data]

  redis:
    image: redis:7
    ports: ["6379:6379"]

volumes:
  db_data:
```

---

## Deployment (Render)

### 1) Database

* Render → **New** → **PostgreSQL** (Free)
* Copy the **Internal Connection String** (psql URL)

### 2) Backend (Render Web Service)

* **Root directory:** `backend`
* **Build Command:** `npm ci && npm run build`
* **Start Command:** `node dist/main.js`
* **Environment Variables:**

  ```
  NODE_ENV=production
  PORT=8080
  DATABASE_URL=<RENDER_POSTGRES_INTERNAL_URL>
  # optional (only if you attach a managed Redis):
  # REDIS_URL=<your_redis_url>
  SCRAPE_TTL_MINUTES=1440
  RATE_LIMIT_MS=1500
  WOB_BASE=https://www.worldofbooks.com/en-gb
  ```
* **CORS** (in `main.ts`):

  ```ts
  app.enableCors({
    origin: ['http://localhost:3000', 'https://<FRONTEND_URL>.onrender.com'],
    credentials: true,
  });
  ```

### 3) Frontend (Render Web Service)

* **Root directory:** `frontend`
* **Build Command:** `npm ci && npm run build`
* **Start Command:** `npm start`
* **Environment Variables:**

  ```
  NEXT_PUBLIC_API_BASE=https://<BACKEND_URL>.onrender.com
  ```

> After the first successful deploy, open the frontend URL and browse categories/products.

### 4) Quick smoke test

```bash
# API
curl https://<BACKEND_URL>.onrender.com/categories/books
curl "https://<BACKEND_URL>.onrender.com/products?category=fiction&page=1&limit=12"
```

---

## API Reference (quick)

* `GET /categories/:navId` → e.g. `/categories/books` → `[{ id, title, slug }]`
* `GET /products?category=<slug>&page=<n>&limit=<n>` → paginated list
* `GET /products/:id` → full product (title, price, image, description, rating, recommendations, lastScrapedAt)
* `POST /views` → `{ sessionId, path }`

---

## Notes

* Products are created/updated on first access and cached; **Force refresh** bypasses cache.
* Rate limiting controlled by `RATE_LIMIT_MS`; cache window by `SCRAPE_TTL_MINUTES`.

---

## CI (GitHub Actions)

Basic build workflow (optional) at `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
      - name: Backend build
        working-directory: backend
        run: npm ci && npm run build
      - name: Frontend build
        working-directory: frontend
        env:
          NEXT_PUBLIC_API_BASE: http://localhost:8080
        run: npm ci && npm run build
```

---

## Push to GitHub (first time)

```powershell
git init
git add .
git commit -m "feat: product explorer (full stack)"
git branch -M main
git remote add origin https://github.com/aby639/product-explorer.git
git push -u origin main
```

---

## License

MIT

