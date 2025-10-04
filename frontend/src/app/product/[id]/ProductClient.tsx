'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useEffect, useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    id: string;
    description?: string | null;
    ratingAverage?: number | null;
    lastScrapedAt?: string | null;
    specs?: Record<string, any> | null;
  } | null;
};

type RelatedResp = { items: Array<{ id: string; title: string; image?: string | null; price?: number | null; currency?: string | null }> };

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`Failed (${r.status})`);
    return r.json();
  });

function fmtMoney(v?: number | null, ccy?: string | null) {
  if (v == null || !ccy) return null;
  try {
    return new Intl.NumberFormat(
      ccy === 'GBP' ? 'en-GB' : ccy === 'EUR' ? 'de-DE' : 'en-US',
      { style: 'currency', currency: ccy },
    ).format(v);
  } catch {
    return `${Number(v).toFixed(2)} ${ccy}`;
  }
}

function toHttps(u?: string | null) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const KEY = 'pe:session';
  let v = localStorage.getItem(KEY);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(KEY, v);
  }
  return v;
}

export default function ProductClient({ product }: { product: Product }) {
  const price = fmtMoney(product.price, product.currency);
  const wobUrl = useMemo(() => {
    // prefer detail.specs.sourceUrl if you stored it; else trust product.detail?.specs?.sourceUrl
    const raw =
      (product as any)?.sourceUrl ||
      product?.detail?.specs?.sourceUrl ||
      null;
    return toHttps(raw);
  }, [product]);

  // --- view history ping (optional bonus) ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const body = {
        sessionId: getSessionId(),
        pathJson: [window.location.pathname],
      };
      fetch(`${API}/views`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => void 0);
    } catch {}
  }, []);

  // --- related in same category ---
  const relatedUrl = product.category?.id
    ? `${API}/products?category=${product.category.id}&page=1&limit=6`
    : null;
  const { data: related } = useSWR<RelatedResp>(relatedUrl, fetcher, {
    revalidateOnFocus: false,
  });
  const relatedItems = (related?.items || [])
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  // --- back behaviour: restore last list or fallback to /products ---
  const backHref =
    (typeof window !== 'undefined' && localStorage.getItem('lastListPath')) ||
    '/products';

  return (
    <>
      <Link href={backHref} className="btn mb-4">
        ← Back
      </Link>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image ?? ''}
            alt={product.title}
            className="max-h-[520px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>

          {price ? (
            <div className="text-xl font-semibold">{price}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex flex-wrap gap-3">
            {wobUrl && (
              <a
                href={wobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
              >
                View on World of Books
              </a>
            )}
            <Link href={`/product/${product.id}?refresh=true`} className="btn btn-ghost">
              Force refresh
            </Link>
          </div>

          {product?.detail?.ratingAverage ? (
            <div className="text-sm opacity-90">
              ⭐ {product.detail.ratingAverage.toFixed(1)} / 5
            </div>
          ) : null}

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

      {relatedItems.length > 0 && product.category?.title && (
        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold">
            Related in {product.category.title}
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relatedItems.map((r) => (
              <li key={r.id} className="card card-hover p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toHttps(r.image) ?? ''}
                  alt={r.title}
                  className="h-44 w-full rounded-xl bg-slate-900/60 object-contain"
                />
                <div className="mt-3 line-clamp-2 font-medium">{r.title}</div>
                <div className="opacity-70 text-sm">
                  {fmtMoney(r.price, r.currency) ?? '—'}
                </div>
                <Link
                  href={`/product/${r.id}`}
                  onClick={() => {
                    // keep current list ref so Back works from child → parent
                    if (typeof window !== 'undefined') {
                      localStorage.setItem(
                        'lastListPath',
                        window.location.pathname,
                      );
                    }
                  }}
                  className="btn btn-ghost mt-3"
                >
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
