const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { ProductsService } = require('../dist/products/products.service');
const { ScraperService } = require('../dist/scraper/scraper.service');
const { NavigationService } = require('../dist/navigation/navigation.service');
const { chromium } = require('playwright');

const id = '11111111-1111-4111-8111-111111111111';

test('unknown category returns no products instead of the entire catalogue', async () => {
  const products = { findAndCount: async () => { throw new Error('Unfiltered query'); } };
  const service = new ProductsService(products, { find: async () => [] }, {}, {});
  assert.deepEqual(await service.list({ category: 'missing' }), { items: [], total: 0, page: 1, limit: 12 });
});

test('ordinary product reads return stored details without scraping', async () => {
  let reads = 0;
  const saved = { id, detail: { description: 'Saved', lastScrapedAt: new Date('2026-01-01') } };
  const service = new ProductsService({ findOne: async () => { reads++; return saved; } }, {}, {}, {
    refreshProduct: async () => { throw new Error('Unexpected scrape'); },
  });
  assert.equal(await service.getOneSafe(id), saved);
  assert.equal(reads, 1);
});

test('refresh failures reach the caller and leave saved details intact', async () => {
  const saved = { id, price: 9.5, detail: { description: 'Saved description', lastScrapedAt: '2026-01-01' } };
  const before = JSON.stringify(saved);
  const service = new ProductsService({ findOne: async () => saved }, {}, {}, {
    refreshProduct: async () => { throw new Error('Source is offline'); },
  });
  await assert.rejects(() => service.getOneSafe(id, { refresh: true }), error => error.getStatus() === 503);
  assert.equal(JSON.stringify(saved), before);
});

test('concurrent refreshes share one scrape and a completed scrape respects cooldown', async () => {
  let calls = 0;
  let finish;
  const saved = { lastScrapedAt: new Date() };
  const scraper = new ScraperService({}, { findOne: async () => saved });
  scraper._refreshProduct = async () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  };
  const first = scraper.refreshProduct(id);
  const second = scraper.refreshProduct(id);
  finish(saved);
  assert.equal(await first, saved);
  assert.equal(await second, saved);
  assert.equal(await scraper.refreshProduct(id), saved);
  assert.equal(calls, 1);
});

test('failed refresh without a saved result also respects cooldown', async () => {
  let calls = 0;
  const scraper = new ScraperService({}, { findOne: async () => null });
  scraper._refreshProduct = async () => { calls++; throw new Error('Offline'); };
  await assert.rejects(() => scraper.refreshProduct(id), /Offline/);
  await assert.rejects(() => scraper.refreshProduct(id), /Please wait/);
  assert.equal(calls, 1);
});

test('HTTP error pages cannot replace saved prices, descriptions or timestamps', async () => {
  let writes = 0;
  let closed = false;
  const saved = { id, sourceUrl: 'https://www.worldofbooks.com/en-gb/products/example', price: 8.99 };
  const detail = { description: 'Existing description', lastScrapedAt: new Date('2026-01-01') };
  const snapshot = JSON.stringify({ saved, detail });
  const launch = mock.method(chromium, 'launch', async () => ({
    newContext: async () => ({ newPage: async () => ({
      waitForTimeout: async () => {},
      goto: async () => ({ status: () => 503 }),
    }) }),
    close: async () => { closed = true; },
  }));
  const scraper = new ScraperService({
    findOne: async () => saved, save: async () => { writes++; },
  }, { findOne: async () => detail, save: async () => { writes++; } });
  try {
    await assert.rejects(() => scraper.refreshProduct(id), /Source page could not be loaded/);
    assert.equal(writes, 0);
    assert.equal(JSON.stringify({ saved, detail }), snapshot);
    assert.equal(closed, true);
  } finally { launch.mock.restore(); }
});

test('startup seeding does not replace existing book prices', async () => {
  let writes = 0;
  const category = { id, slug: 'fiction', title: 'Fiction' };
  const service = new NavigationService(
    { findOne: async () => ({ id, slug: 'books' }) },
    { findOne: async () => category, findOneByOrFail: async () => category },
    { findOne: async () => ({ id, price: 12.99 }), save: async () => { writes++; } },
  );
  await service.ensureSeed();
  assert.equal(writes, 0);
});
