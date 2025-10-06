'use client';

import {useCallback, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import useSWR from 'swr';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    ratingAverage?: number | null;
    lastScrapedAt?: string | null;      // timestamptz in DB
    specs?: Record<string, any> | null;  // jsonb bag (may mirror timestamp, review count, etc.)
    updatedAt?: string | null;
    createdAt?: string | null;
  } | null;
};

type GridResponse = {
  items: Array<Pick<Product, 'id' | 'title' | 'image' | 'price' | 'currency'>>;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r)));

const money = (value?: number | null, currency?: string | null) =>
  value != null && currency
    ? new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
        style: 'currency',
        currency,
      }).format(value)
    : null;

/* ---------- small helpers ---------- */

// Pick the best available "last scraped" timestamp from a product
function getLastScraped(p?: Product | null): string | null {
  if (!p?.detail) return null;
  return (
    p.detail.lastScrapedAt ??
    (p.detail.specs?.lastScrapedAtISO as string | undefined) ??
    (p.detail as any)?.updatedAt ??
    (p.detail as any)?.createdAt ??
    null
  );
}

// Try POST /refresh (if you add it later). Otherwise fall back to GET ?refresh=true (your current backend behavior).
async function triggerScrape(baseUrl: string, id: string) {
  try {
    const post = await fetch(`${baseUrl}/products/${id}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (post.ok) return true;
  } catch {}
  // Fallback – this already triggers a scrape on your backend:
  try {
    const get = await fetch(`${baseUrl}/products/${id}?refresh=true`, {
      method: 'GET',
      cache: 'no-store',
    });
    return get.ok;
  } catch {
    return false;
  }
}

export default function ProductClient({ product }: { product: Product }) {
  // keep a local copy so we can live-update fields after polling
  const [current, setCurrent] = useState<Product>(product);
  const [refreshing, setRefreshing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleBack = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lastListPath') : null;
    if (saved) window.location.href = saved;
    else if (history.length > 1) history.back();
    else window.location.href = '/';
  };

  const price = money(current.price, current.currency);

  const sourceUrl: string | undefined =
    (current.detail?.specs?.sourceUrl as string | undefined) ??
    (current.detail?.specs?.source_url as string | undefined) ??
    current.sourceUrl ??
    (current.detail?.specs?.url as string | undefined);

  const pickDate = getLastScraped(current);

  // Related (same category)
  const relatedUrl = current.category?.id
    ? `${API}/products?category=${encodeURIComponent(current.category.id)}&limit=6`
    : null;

  const { data: related } = useSWR<GridResponse>(relatedUrl ?? null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const relatedItems = (related?.items ?? []).filter((p) => p.id !== current.id).slice(0, 6);

  // Ratings UI
  const ratingValue =
    typeof current.detail?.ratingAverage === 'number' ? current.detail.ratingAverage : null;

  const ratingCountRaw =
    current.detail?.specs && typeof (current.detail.specs as any).reviewsCount !== 'undefined'
      ? (current.detail.specs as any).reviewsCount
      : null;
  const ratingCount =
    typeof ratingCountRaw === 'number' && isFinite(ratingCountRaw) ? ratingCountRaw : null;

  const ratingStars =
    ratingValue != null ? '★'.repeat(Math.min(5, Math.max(1, Math.round(ratingValue)))) : '';

  // Fetch the latest product once (no-cache) and put it in state
  const refetchOnce = useCallback(async (): Promise<Product> => {
    const fresh = await fetch(`${API}/products/${current.id}`, { cache: 'no-store' }).then((r) =>
      r.ok ? r.json() : Promise.reject(r),
    );
    setCurrent(fresh);
    return fresh;
  }, [current.id]);

  const handleForceRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);

    const before = getLastScraped(current);

    // Kick off the scrape
    await triggerScrape(API, current.id);

    // Poll until lastScrapedAt actually changes (max ~35s)
    const started = Date.now();
    const stop = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };

    const poll = async () => {
      try {
        const fresh = await refetchOnce();
        const after = getLastScraped(fresh);
        if (after && after !== before) {
          stop();
          setRefreshing(false);
          return;
        }
      } catch {
        // ignore transient errors
      }
      if (Date.now() - started > 35_000) {
        stop();
        setRefreshing(false);
      }
    };

    // immediate attempt, then every 2s if still refreshing
    await poll();
    if (refreshing) pollingRef.current = setInterval(poll, 2000);
  }, [current, refreshing, refetchOnce]);

  return (
    <>
      <button onClick={handleBack} className="btn">← Back</button>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.image ?? ''}
            alt={current.title}
            className="max-h-[420px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{current.title}</h1>

          {price ? (
            <div className="text-xl font-semibold">{price}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex items-center gap-3">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                View on World of Books
              </a>
            )}
            <button onClick={handleForceRefresh} className="btn btn-ghost">
              Force refresh
            </button>
            {refreshing && <span className="text-xs opacity-70">refreshing…</span>}
          </div>

          {current?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">
                {current.detail.description}
              </div>

              <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-4 items-center">
                <span>Last scraped: {pickDate ? new Date(pickDate).toLocaleString() : '—'}</span>

                <span className="inline-flex items-center gap-1">
                  Rating:
                  {ratingValue != null ? (
                    <>
                      <span aria-hidden="true">{ratingStars || '★'}</span>
                      {ratingValue.toFixed(1)} / 5
                    </>
                  ) : (
                    ' Not available'
                  )}
                </span>

                <span className="inline-flex items-center gap-1">
                  Reviews:
                  {ratingCount != null ? ratingCount : ' Not available'}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {relatedItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Related in {current.category?.title ?? 'this category'}
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {relatedItems.map((p) => (
              <li key={p.id} className="card p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image ?? ''}
                  alt={p.title}
                  loading="lazy"
                  className="h-40 w-full rounded-xl object-contain bg-slate-900/60"
                />
                <div className="mt-3 line-clamp-2 font-medium">{p.title}</div>
                <div className="text-sm opacity-80 mt-1">
                  {money(p.price, p.currency) ?? '—'}
                </div>
                <Link href={`/product/${p.id}`} className="btn mt-3">
                  View
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
