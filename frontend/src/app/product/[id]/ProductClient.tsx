'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null; // if present in your API; if not, we’ll build from specs
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    lastScrapedAt?: string | null;
    specs?: Record<string, any> | null;
    ratingAverage?: number | null;
  } | null;
};

type GridResponse = { items: Array<Pick<Product, 'id' | 'title' | 'image' | 'price' | 'currency'>> };

const money = (v?: number | null, c?: string | null) =>
  v != null && c
    ? new Intl.NumberFormat(c === 'GBP' ? 'en-GB' : c === 'EUR' ? 'de-DE' : 'en-US', {
        style: 'currency',
        currency: c,
      }).format(v)
    : null;

function toHttps(u?: string | null) {
  if (!u) return null;
  try {
    const url = new URL(u, 'https://www.worldofbooks.com');
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
}

export default function ProductClient({ product, id }: { product: Product; id: string }) {
  // BACK target from localStorage
  const backHref =
    typeof window !== 'undefined' && localStorage.getItem('lastListPath')
      ? (localStorage.getItem('lastListPath') as string)
      : '/';

  // Fire-and-forget view history (optional)
  useEffect(() => {
    try {
      const sessionId =
        localStorage.getItem('pe_session') || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      localStorage.setItem('pe_session', sessionId);
      const path = [window.location.pathname + window.location.search];
      fetch(`${API}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, path }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {}
  }, []);

  // related (by same category)
  const relUrl = useMemo(() => {
    const catId = product.category?.id;
    if (!catId) return null;
    const p = new URLSearchParams({ category: catId, page: '1', limit: '8' });
    return `${API}/products?${p.toString()}`;
  }, [product.category?.id]);

  const { data: rel } = useSWR<GridResponse>(relUrl, relUrl ? fetcher : null, { revalidateOnFocus: false });

  const worldOfBooksUrl =
    product.sourceUrl ??
    (product.detail?.specs && typeof product.detail.specs['wobUrl'] === 'string'
      ? (product.detail!.specs!['wobUrl'] as string)
      : null);

  const safeImg = toHttps(product.image);
  const priceText = money(product.price, product.currency);

  return (
    <>
      <Link href={backHref} className="btn">
        ← Back
      </Link>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeImg ?? ''} alt={product.title} className="max-h-[420px] object-contain" />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>
          {priceText ? <div className="text-xl font-semibold">{priceText}</div> : <div className="opacity-70">—</div>}

          <div className="flex gap-3">
            {worldOfBooksUrl && (
              <a
                href={toHttps(worldOfBooksUrl) ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                aria-label="View this book on World of Books"
              >
                View on World of Books
              </a>
            )}

            <Link href={`/product/${id}?refresh=true`} className="btn btn-ghost">
              Force refresh
            </Link>
          </div>

          {product?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">{product.detail.description}</div>

              <div className="mt-2 text-xs opacity-60 flex gap-4 items-center">
                {product.detail.ratingAverage != null && (
                  <span>Rating: {Number(product.detail.ratingAverage).toFixed(1)} / 5</span>
                )}
                {product.detail.lastScrapedAt && (
                  <span>Last scraped: {new Date(product.detail.lastScrapedAt).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {rel?.items?.length ? (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">
            Related in {product.category?.title ?? 'this category'}
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rel.items
              .filter((p) => p.id !== id)
              .slice(0, 6)
              .map((p) => (
                <li key={p.id} className="card p-4">
                  <div className="relative overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={toHttps(p.image) ?? ''}
                      alt={p.title}
                      className="h-40 w-full rounded-xl bg-slate-900/60 object-contain"
                    />
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-medium">{p.title}</h3>
                  <div className="opacity-70 text-sm">{money(p.price, p.currency) ?? '—'}</div>
                  <Link
                    href={`/product/${p.id}`}
                    className="btn mt-3"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem(
                          'lastListPath',
                          window.location.pathname.replace(`/product/${id}`, `/products/${product.category?.slug ?? ''}`),
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
