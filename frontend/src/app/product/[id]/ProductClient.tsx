'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    lastScrapedAt?: string | null;
    ratingAverage?: number | null;
    specs?: Record<string, any> | null;
  } | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`Failed to load (${r.status})`);
    return r.json();
  });

const toMoney = (value?: number | null, currency?: string | null) => {
  if (value == null || !currency) return null;
  try {
    return new Intl.NumberFormat(
      currency === 'GBP' ? 'en-GB' : currency === 'EUR' ? 'de-DE' : 'en-US',
      { style: 'currency', currency }
    ).format(value);
  } catch {
    return `${Number(value)} ${currency}`;
  }
};

function Stars({ value }: { value: number }) {
  const filled = Math.round(Math.max(0, Math.min(5, value)));
  return (
    <div aria-label={`Rating ${value} out of 5`} className="flex gap-1 text-yellow-300">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden>{i < filled ? '★' : '☆'}</span>
      ))}
      <span className="ml-2 text-xs opacity-75">{value.toFixed(1)}</span>
    </div>
  );
}

export default function ProductClient({ product }: { product: Product }) {
  const router = useRouter();
  const sp = useSearchParams();
  const refreshing = sp.get('refresh') === 'true';

  // Post view event (persisted view history)
  useEffect(() => {
    const sessionId =
      (typeof window !== 'undefined' && localStorage.getItem('pe_session')) ||
      (Math.random().toString(36).slice(2) + Date.now().toString(36));
    if (typeof window !== 'undefined') localStorage.setItem('pe_session', sessionId);

    fetch(`${API}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, path: window.location.pathname }),
    }).catch(() => undefined);
  }, []);

  // Related in same category (simple recommendation strip)
  const relatedUrl = useMemo(() => {
    const cid = product.category?.id;
    if (!cid) return null;
    const p = new URLSearchParams({ category: cid, limit: '12', page: '1' });
    return `${API}/products?${p.toString()}`;
  }, [product.category?.id]);

  const { data: related } = useSWR<{ items: Product[] }>(relatedUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const money = toMoney(product.price, product.currency);
  const wobUrl =
    product.detail?.specs?.sourceUrl ??
    product.detail?.specs?.source_url ??
    product['sourceUrl' as any] ??
    product['source_url' as any] ??
    undefined;

  const onBack = useCallback(() => {
    const last = typeof window !== 'undefined' ? localStorage.getItem('lastListPath') : null;
    if (last) router.push(last);
    else router.back();
  }, [router]);

  return (
    <>
      <button onClick={onBack} className="btn">← Back</button>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image ?? ''}
            alt={product.title}
            className="max-h-[420px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>

          {money ? (
            <div className="text-xl font-semibold">{money}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          {product.detail?.ratingAverage != null && (
            <Stars value={product.detail.ratingAverage} />
          )}

          <div className="flex gap-3">
            {wobUrl && (
              <a
                href={wobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                View on World of Books
              </a>
            )}
            <Link
              href={`/product/${product.id}?refresh=true`}
              className={`btn ${refreshing ? 'opacity-60 cursor-wait' : ''}`}
              prefetch={false}
            >
              {refreshing ? 'Refreshing…' : 'Force refresh'}
            </Link>
          </div>

          {product?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">
                {product.detail.description}
              </div>
              {product.detail.lastScrapedAt && (
                <div className="mt-2 text-xs opacity-60">
                  Last scraped: {new Date(product.detail.lastScrapedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {related?.items?.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-4">
            Related in {product.category?.title ?? 'this category'}
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.items
              .filter((r) => r.id !== product.id)
              .slice(0, 6)
              .map((r) => (
                <li key={r.id} className="card p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.image ?? ''}
                    alt={r.title}
                    className="h-48 w-full rounded-xl object-contain bg-slate-900/60"
                    loading="lazy"
                  />
                  <h3 className="mt-3 line-clamp-2 font-medium">{r.title}</h3>
                  <div className="mt-1 text-sm opacity-80">
                    {toMoney(r.price, r.currency) ?? '—'}
                  </div>
                  <Link
                    href={`/product/${r.id}`}
                    className="btn mt-3"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem(
                          'lastListPath',
                          window.location.pathname + window.location.search
                        );
                      }
                    }}
                  >
                    View
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
