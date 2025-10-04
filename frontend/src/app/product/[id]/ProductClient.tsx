'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  category?: { id: string; title: string; slug: string } | null;
  detail?: {
    description?: string | null;
    ratingAverage?: number | null; // 0..5 (or null)
    lastScrapedAt?: string | null;
    specs?: any;
  } | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`Failed to load (${r.status})`);
    return r.json();
  });

const toHttps = (u?: string | null) => {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
};

function BackButton() {
  const router = useRouter();
  return (
    <button
      className="btn"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          const lastList = localStorage.getItem('lastListPath') || '/categories/books';
          router.push(lastList);
        }
      }}
    >
      ← Back
    </button>
  );
}

function Stars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <div className="flex items-center gap-1 text-amber-400">
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} aria-hidden>★</span>
      ))}
      {half && <span aria-hidden>☆</span>}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="opacity-40" aria-hidden>★</span>
      ))}
    </div>
  );
}

export default function ProductClient({ id, initial }: { id: string; initial: Product | null }) {
  const { data: product, isLoading, mutate } = useSWR<Product | null>(`${API}/products/${id}`, fetcher, {
    fallbackData: initial,
  });

  // record a “view” (optional persisted history)
  useEffect(() => {
    if (!product?.id) return;
    const session =
      localStorage.getItem('pe_session') ||
      (localStorage.setItem('pe_session', crypto.randomUUID()), localStorage.getItem('pe_session'));
    fetch(`${API}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        path: location.pathname + location.search,
        session,
      }),
    }).catch(() => void 0);
  }, [product?.id]);

  // fetch related (same category)
  const { data: related } = useSWR<{ items: Product[] } | null>(
    () => (product?.category?.slug ? `${API}/products?category=${encodeURIComponent(product.category.slug)}&limit=8` : null),
    fetcher,
    { fallbackData: null },
  );

  const money =
    product?.price != null && product?.currency
      ? new Intl.NumberFormat(
          product.currency === 'GBP' ? 'en-GB' : product.currency === 'EUR' ? 'de-DE' : 'en-US',
          { style: 'currency', currency: product.currency },
        ).format(product.price)
      : null;

  const wobUrl = toHttps(product?.sourceUrl ?? product?.detail?.specs?.origin ?? null);
  const rating = product?.detail?.ratingAverage ?? null;

  if (isLoading && !product) {
    return (
      <main className="container-xl py-8 space-y-6">
        <BackButton />
        <div className="card p-6">Loading…</div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container-xl py-8 space-y-6">
        <BackButton />
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
          <div className="mt-4 flex gap-3">
            <button className="btn" onClick={() => mutate()}>
              Try again
            </button>
            <Link href="/categories/books" className="btn btn-ghost">
              Browse categories
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // remove self from related list (and keep at most 8)
  const relatedItems = useMemo(
    () => (related?.items || []).filter((p) => p.id !== product.id).slice(0, 8),
    [related?.items, product.id],
  );

  return (
    <main className="container-xl py-8 space-y-8">
      <BackButton />

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image ?? ''} alt={product.title} className="max-h-[420px] object-contain" />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>

          <div className="flex items-center gap-4">
            {money ? <div className="text-xl font-semibold">{money}</div> : <div className="opacity-70">Price not available</div>}
            {typeof rating === 'number' && rating > 0 && (
              <div className="flex items-center gap-2">
                <Stars value={rating} />
                <span className="text-sm opacity-80">{rating.toFixed(1)} / 5</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {wobUrl && (
              <a href={wobUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                View on World of Books
              </a>
            )}
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await fetch(`${API}/products/${product.id}?refresh=true`, { cache: 'no-store' }).catch(() => void 0);
                mutate(); // re-fetch after server completes (cooldown prevents hammering)
              }}
            >
              Force refresh
            </button>
          </div>

          {product?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">{product.detail.description}</div>
              {product.detail.lastScrapedAt && (
                <div className="mt-2 text-xs opacity-60">
                  Last scraped: {new Date(product.detail.lastScrapedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {relatedItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Related in {product.category?.title || 'this category'}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedItems.map((p) => {
              const price =
                p.price != null && p.currency
                  ? new Intl.NumberFormat(p.currency === 'GBP' ? 'en-GB' : 'en-US', {
                      style: 'currency',
                      currency: p.currency,
                    }).format(p.price)
                  : null;

              return (
                <div key={p.id} className="card p-4 space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image ?? ''} alt={p.title} className="h-40 object-contain mx-auto" />
                  <div className="font-medium line-clamp-2">{p.title}</div>
                  {price && <div className="text-sm opacity-80">{price}</div>}
                  <Link
                    href={`/product/${p.id}`}
                    className="btn btn-ghost"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('lastListPath', window.location.pathname + window.location.search);
                      }
                    }}
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
