'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    lastScrapedAt?: string | null;          // timestamptz in DB
    specs?: Record<string, any> | null;     // JSON bag: lastScrapedAtISO, reviewsCount, sourceUrl, etc.
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

/** pull the most reliable last-scraped timestamp */
function getLastScraped(p?: Product | null) {
  if (!p?.detail) return null;
  return (
    p.detail.lastScrapedAt ||
    (p.detail.specs?.lastScrapedAtISO as string | undefined) ||
    (p.detail as any)?.updatedAt ||
    (p.detail as any)?.createdAt ||
    null
  );
}

/** canonical source URL with fallbacks */
function getSourceUrl(p?: Product | null) {
  return (
    p?.detail?.specs?.sourceUrl ||
    p?.detail?.specs?.source_url ||
    p?.sourceUrl ||
    (p?.detail?.specs?.url as string | undefined)
  );
}

export default function ProductClient({ product }: { product: Product }) {
  // keep a local copy so we can update after polling
  const [current, setCurrent] = useState<Product>(product);
  const [refreshing, setRefreshing] = useState(false);

  const lastScraped = useMemo(() => getLastScraped(current), [current]);
  const sourceUrl = useMemo(() => getSourceUrl(current), [current]);

  // Back button: last grid path -> back -> /
  const handleBack = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lastListPath') : null;
    if (saved) window.location.href = saved;
    else if (history.length > 1) history.back();
    else window.location.href = '/';
  };

  const price = money(current.price, current.currency);

  // Related products (same category)
  const relatedUrl = current.category?.id
    ? `${API}/products?category=${encodeURIComponent(current.category.id)}&limit=6`
    : null;

  const { data: related } = useSWR<GridResponse>(relatedUrl ?? null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const relatedItems = (related?.items ?? []).filter((p) => p.id !== current.id).slice(0, 6);

  // ---- Ratings UI bits ----
  const ratingValue =
    typeof current.detail?.ratingAverage === 'number' ? current.detail.ratingAverage : null;

  // kept in JSON bag as "reviewsCount"
  const ratingCountRaw =
    current.detail?.specs && typeof (current.detail.specs as any).reviewsCount !== 'undefined'
      ? (current.detail.specs as any).reviewsCount
      : null;
  const ratingCount =
    typeof ratingCountRaw === 'number' && isFinite(ratingCountRaw) ? ratingCountRaw : null;

  const ratingStars =
    ratingValue != null ? '★'.repeat(Math.min(5, Math.max(1, Math.round(ratingValue)))) : '';

  // ---- Force refresh logic ----
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  async function refetchOnce() {
    const fresh = await fetch(`${API}/products/${current.id}`, { cache: 'no-store' }).then((r) =>
      r.ok ? r.json() : Promise.reject(r),
    );
    setCurrent(fresh);
    return fresh as Product;
  }

  async function handleForceRefresh() {
    if (refreshing) return;
    setRefreshing(true);

    const before = getLastScraped(current);

    // Try to trigger the scrape (adjust path if your backend differs)
    try {
      await fetch(`${API}/products/${current.id}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => undefined);
    } catch {
      // ignore; we’ll still poll in case the GET route triggers it server-side
    }

    // Poll for up to ~35s
    const started = Date.now();
    let updated = false;

    const poll = async () => {
      try {
        const fresh = await refetchOnce();
        const after = getLastScraped(fresh);
        if (after && after !== before) {
          updated = true;
          stopPolling();
          setRefreshing(false);
          return;
        }
      } catch {
        // ignore transient errors
      }
      if (Date.now() - started > 35_000) {
        stopPolling(); // give up
        setRefreshing(false);
      }
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    // kick one immediate fetch + then interval
    await poll();
    if (!updated) {
      pollingRef.current = setInterval(poll, 2000);
    }
  }

  // clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <>
      <button onClick={handleBack} className="btn">
        ← Back
      </button>

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

          <div className="flex gap-3 items-center">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                View on World of Books
              </a>
            )}

            <button onClick={handleForceRefresh} className="btn btn-ghost" disabled={refreshing}>
              Force refresh
            </button>

            {refreshing && <span className="text-xs opacity-60">refreshing…</span>}
          </div>

          {current?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">
                {current.detail.description}
              </div>

              <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-4 items-center">
                <span>
                  Last scraped:{' '}
                  {lastScraped ? new Date(lastScraped).toLocaleString() : '—'}
                </span>

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
