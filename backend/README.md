# Product Explorer API

NestJS API for the book catalogue. It stores data in PostgreSQL and uses Playwright to refresh details from World of Books.

See the [project README](../README.md) for database setup, environment variables and deployment steps.

## Commands

```bash
npm ci --legacy-peer-deps
npm run start:dev
npm test
npm run build
npm run start:prod
```

The install step downloads Chromium. Use `PLAYWRIGHT_BROWSERS_PATH` if the deployment needs a custom browser-cache directory.

`npm run seed` adds the sample books manually. Startup also creates missing navigation, categories and sample books. Neither path overwrites existing book prices.

## Source folders

- `src/products`: catalogue queries and product refresh routes
- `src/scraper`: page loading and extraction
- `src/categories` and `src/navigation`: browse routes and initial data
- `src/entities`: TypeORM entities
- `src/views`: visited-path records
- `test`: regression tests using stubs

A failed page load keeps the last successful product details and timestamp. Missing data on an otherwise successful page can still result in empty fields.
