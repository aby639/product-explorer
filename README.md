# Product Data Explorer

Search, view, and auto-refresh book product data from **World of Books** (and other e-commerce pages that expose JSON-LD/Microdata).
Backend scrapes and normalizes data; frontend presents products with prices, description, image, ratings and review counts when available.

> **Live**
> Frontend: `https://product-explorer-frontend-1r8k.onrender.com`
> Backend: `https://product-explorer-backend-0oli.onrender.com`

---

## Features

* **Browse by category** and open product detail pages.
* **Scraped product details**: description, cover image, price (GBP), currency, availability status, “last scraped” timestamp.
* **Ratings & reviews** (best-effort):

  * `detail.ratingAverage` - numeric average (0–5) when JSON-LD or microdata is present.
  * `detail.specs.reviewsCount` - review/ratings count if exposed by the page.
* **Force refresh** button:

  * Triggers a new scrape for the product.
  * Frontend **polls** the backend until `detail.lastScrapedAt` changes, then updates the UI live.
* **Render-friendly** Playwright setup (chromium on serverless).
* **Postgres schema** with `Product`, `ProductDetail`, `Category`, `Review`.

---

## Architecture

```
apps/
  backend/ (NestJS + TypeORM + Playwright)
    src/entities/
      category.entity.ts
      product.entity.ts
      product-detail.entity.ts
      review.entity.ts
    src/scraper/scraper.service.ts
    src/products/...
  frontend/ (Next.js 14 app router)
    app/
      products/[categoryId]/page.tsx
      product/[id]/page.tsx
      product/productclient.tsx
      categories/[navId]/page.tsx
      ...
    components/...
```

* **Backend**: NestJS REST API, TypeORM (Postgres), Playwright (Chromium) headless scraping.
* **Frontend**: Next.js 14 (app router), Tailwind UI, `useSWR` for data & related items.

---

## Data Model (simplified)

```ts
// Product
id: uuid
title: string
image: text | null
price: numeric(10,2) | null   // stored as DECIMAL, transformed to number in JS
currency: varchar(8) | null   // 'GBP' expected for WOB
sourceUrl: text | null        // canonical product page
category: ManyToOne<Category>
detail: OneToOne<ProductDetail> (eager)
reviews: OneToMany<Review>

// ProductDetail
id: uuid
product: OneToOne<Product> (JoinColumn)
description: text | null
ratingAverage: float | null
specs: jsonb | null           // bag: { lastStatus, unavailable, priceProbes, lastScrapedAtISO, sourceUrl, reviewsCount }
lastScrapedAt: timestamptz | null  // canonical "last scraped" timestamp
createdAt/updatedAt: timestamptz

// Category, Review standard relations omitted here for brevity
```

**Where timestamps & ratings live**

* Canonical timestamp: `ProductDetail.lastScrapedAt` (timestamptz).
* Mirrored ISO timestamp: `ProductDetail.specs.lastScrapedAtISO` (string).
* Average rating: `ProductDetail.ratingAverage` (0–5).
* Review count: `ProductDetail.specs.reviewsCount`.

---

## Scraper (Playwright) – How data is found

* **Description**: looks for “Summary/Description” sections; falls back to meta description.
* **Image**: prioritizes `og:image` / Twitter image; falls back to JSON-LD image; else picks the largest portrait image in the main content.
* **Price (GBP)**:

  * For World of Books, it understands the “condition buttons” UI and picks the selected/cheapest in-stock GBP price.
  * Else tries JSON-LD offers, microdata, and finally a simple HTML regex.
  * If product is “unavailable” or non-GBP on WOB, price is cleared.
* **Rating**:

  * Prefers JSON-LD `aggregateRating.ratingValue` and `reviewCount/ratingCount`.
  * Falls back to microdata (`itemprop=ratingValue` /\ `reviewCount`).
  * If none, sets rating as unavailable.

Scraper writes:

* `detail.lastScrapedAt = new Date()`
* `detail.specs.lastScrapedAtISO = scrapedAt.toISOString()`
* `detail.ratingAverage`, `detail.specs.reviewsCount` (if found)
* `product.image`, `product.price`, `product.currency` (constraints applied for WOB)

---

## API (selected)

```
GET  /products                # list products (filter: ?category=?, ?limit=)
GET  /products/:id            # fetch a single product (detail eager-loaded)
GET  /products/:id?refresh=1  # fetch + trigger scrape best-effort (current backend behavior)
POST /products/:id/refresh    # (optional) explicit refresh endpoint if added
GET  /categories              # list categories
GET  /categories/:id/products # products by category
```

> The frontend uses `GET /products/:id?refresh=true` and then polls `GET /products/:id` until `lastScrapedAt` changes.

---

## Frontend “Force refresh” logic

1. Call **triggerScrape**:

   * Try `POST /products/:id/refresh` if present;
   * Fall back to `GET /products/:id?refresh=true` (your current backend).
2. Start **polling** `/products/:id` every 2s (no-cache).
3. Stop when `detail.lastScrapedAt` differs from the timestamp we had before clicking.

This ensures the UI shows **today’s** timestamp once the scrape completes.

---

## Getting Started (Local)

### Requirements

* Node 20+
* PostgreSQL 14+
* (Optional) pnpm

### 1) Environment variables

Create `.env` files:

**backend/.env**

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/product_explorer
NODE_ENV=development
PORT=8080

# Render/Playwright quirks
PLAYWRIGHT_BROWSERS_PATH=0
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
```

**frontend/.env.local**

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 2) Install & run

**Backend**

```bash
cd backend
npm i --legacy-peer-deps
# Ensure DB exists and TypeORM migrations run (or use sync in dev if configured)
npm run build
npm run start:dev
```

**Frontend**

```bash
cd frontend
npm i --legacy-peer-deps
npm run dev
# open http://localhost:3000
```

---

## Deploy to Render

* **Backend**

  * Runtime: Node 20
  * Build command:

    ```bash
    npm install --include=dev --legacy-peer-deps && npm run build
    ```
  * Start command:

    ```bash
    npm run start:prod
    ```
  * Environment:

    ```
    NODE_VERSION=20
    PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
    ```
* **Frontend**

  * Build: `npm install --legacy-peer-deps && npm run build`
  * Start: `npm run start`
  * Env: `NEXT_PUBLIC_API_URL=https://product-explorer-backend-*.onrender.com`

---

## Common Troubleshooting

### “Force refresh” doesn’t change the date

* The backend throttles repeated scrapes per product (cooldown ~15s). Wait ~15s between clicks.
* The frontend polls for **35s**; very slow pages may exceed that window. Click again to retry.
* Ensure your frontend is **not** cached: all fetches use `cache: 'no-store'`.

### Ratings still show “Not available”

* Many pages don’t expose JSON-LD/microdata ratings. That’s expected.
* If the page shows only a **Trustpilot widget** (site rating) and not a product rating, we skip it.

### Playwright on Render

* Always set `PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright`
* Install Chromium in **postinstall** (already set in `package.json`):

  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright npx playwright install chromium
  ```

---

## Dev Notes

* **Decimal → number**: `Product.price` uses a TypeORM transformer to convert DECIMAL to JS number.
* **GBP constraint**: for worldofbooks.com, only **GBP** is accepted; non-GBP offers are ignored.
* **Detail eager load**: `@OneToOne(..., { eager: true })` makes `detail` always present in `GET /products/:id`, which is required for `lastScrapedAt`.

---

## Testing the Flow

1. Open a product page in the frontend.
2. Click **Force refresh**.
3. You’ll see a small “refreshing…” hint. Within a few seconds (usually 3–15s), the card updates and:

   * `Last scraped:` shows a newer timestamp.
   * If price/image changed, they update too.
   * If ratings were discovered, they appear.

---

## Submission Checklist

* [x] README with setup & deploy steps (this file)
* [x] GitHub Issue created: “Final Submission: Product Data Explorer with video and screenshots”
* [x] Screenshots of:

  * Home/List view
  * Product detail with “Last scraped”
  * Example with ratings present (if available)
* [x] Short demo video (add link below)
* [x] Live Render links (backend + frontend)

**Demo video:** *https://drive.google.com/file/d/154sg_MU7954AA2i5nKBEJMcpFakV8uVI/view?usp=drive_web *
**Issue:** (https://github.com/aby639/product-explorer/issues/1)

---

## License

MIT © 2025

---

If you want, I can also generate a short PR template or add a minimal `/products/:id/refresh` POST endpoint snippet so your “triggerScrape” path prefers POST; just say the word.
