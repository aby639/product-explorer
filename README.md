# Product Explorer

A book browser I built with Next.js, NestJS and PostgreSQL. It uses product pages from World of Books to collect descriptions, cover images, prices and ratings when they are available.

You can browse fiction and non-fiction, open a book, and refresh its saved details from the source page. Prices are snapshots from the last check, so they may differ from the shop's current price.

[Frontend](https://product-explorer-frontend-1r8k.onrender.com) · [API](https://product-explorer-backend-0oli.onrender.com) · [Demo video](https://drive.google.com/file/d/154sg_MU7954AA2i5nKBEJMcpFakV8uVI/view)

The hosted services may be offline. The local setup is below.

## How it works

- The frontend lists books by category and opens individual book pages.
- The backend stores the catalogue in PostgreSQL.
- Playwright reads each source page when a refresh is requested.
- Refreshing updates the page when the request finishes. If it fails, the saved details stay visible.
- Requests for the same book share an in-progress scrape. There is a 15-second gap between attempts.

The app starts with a small set of sample books. It does not search the full World of Books catalogue.

## Run locally

You need Node.js 20 or later and PostgreSQL. Docker Compose can start the development database:

```bash
docker compose up -d db
```

Create `backend/.env`:

```dotenv
DATABASE_URL=postgres://wob:wobpw@localhost:5432/wob
PORT=8080
```

These credentials match the local Docker Compose file. The backend currently uses TypeORM schema synchronization, so use a development database.

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080
```

In one terminal:

```bash
cd backend
npm ci --legacy-peer-deps
npm run start:dev
```

The install step downloads Chromium for the scraper. On Linux, its system libraries may also be needed; see the [Playwright installation guide](https://playwright.dev/docs/browsers#install-system-dependencies).

In another terminal:

```bash
cd frontend
npm ci --legacy-peer-deps
npm run dev
```

Open [localhost:3000](http://localhost:3000). The API runs on port 8080, with Swagger at [localhost:8080/docs](http://localhost:8080/docs). Initial navigation, categories and sample books are added at startup without overwriting existing products.

## Checks

```bash
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

The backend tests cover category filtering, refresh failures, repeated refresh requests and preservation of saved data. They use repository and browser stubs, so they do not need a database or contact World of Books.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/navigation` | List navigation entries |
| GET | `/categories/:navKey` | Categories under a navigation slug or UUID |
| GET | `/products?category=fiction&page=1&limit=12` | List books; limit is at most 50 |
| GET | `/products/:id` | Read a saved book |
| POST | `/products/:id/refresh` | Refresh a book and return its details |
| POST | `/views` | Record a visited path |

The older `GET /products/:id?refresh=true` route still works. A refresh failure returns an error while keeping the last saved result. A request during the cooldown can return the existing result.

## Deploy on Render

Create separate Node services with `backend` and `frontend` as their root directories.

For the backend:
- Build: `npm ci --legacy-peer-deps && npm run build`
- Start: `npm run start:prod`
- Set `DATABASE_URL` and `PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright`.

For the frontend:
- Build: `npm ci --legacy-peer-deps && npm run build`
- Start: `npm start`
- Set `NEXT_PUBLIC_API_URL` to the backend URL before building.

If the frontend hostname changes, update the backend's CORS origins in `backend/src/main.ts`.

## Limitations

Source pages can change, block automated requests or omit product data. Ratings and review counts are only shown when found; they are not guaranteed for every book. The scraper uses page markup and fallback selectors, so check the linked source page before relying on a price or rating.

The current database setup is intended for this demo. A production deployment would need a migration process in place of automatic schema synchronization.
