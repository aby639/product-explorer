'use client';

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
    ratingAverage?: number | null;         // numeric 0..5 if available
    lastScrapedAt?: string | null;         // DB timestamptz (ISO)
    specs?: Record<string, any> | null;    // JSON bag (may have lastScrapedAtISO, reviewsCount, sourceUrl)
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

// Local + relative timestamp
const formatWhen = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const deltaMin = Math.round((Date.now() - d.getTime()) / 60000);
  const rel =
    deltaMin < 1 ? 'just now' :
    deltaMin < 60 ? `${deltaMin} min ago` :
    `${Math.round(deltaMin / 60)} hr ago`;
  return `${d.toLocaleString()} (${rel})`;
};

export default function ProductClient({ product }: { product: Product }) {
  // Back button: prefer saved list path; else history; else home
  const handleBack = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lastListPath') : null;
    if (saved) window.location.href = saved;
    else if (history.length > 1) history.back();
    else window.location.href = '/';
  };

  const price = money(product.price, product.currency);

  // Canonical source URL (prefer JSON bag, then root)
  const sourceUrl: string | undefined =
    (product.detail?.specs?.sourceUrl as string | undefined) ??
    (product.detail?.specs?.source_url as string | undefined) ??
    product.sourceUrl ??
    (product.detail?.specs?.url as string | undefined);

  // Best available "last scraped" timestamp
  const pickDate: string | null =
    product.detail?.lastScrapedAt ??
    (product.detail?.specs?.lastScrapedAtISO as string | undefined) ??
    (product.detail as any)?.updatedAt ??
    (product.detail as any)?.createdAt ??
    null;

  // Related in same category
  const relatedUrl = product.category?.id
    ? `${API}/products?category=${encodeURIComponent(product.category.id)}&limit=6`
    : null;

  const { data: related } = useSWR<GridResponse>(relatedUrl ?? null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const relatedItems = (related?.items ?? []).filter((p) => p.id !== product.id).slice(0, 6);

  // Ratings bits (ratingAverage + specs.reviewsCount)
  const ratingValue =
    typeof product.detail?.ratingAverage === 'number' ? product.detail.ratingAverage : null;

  const reviewsCountRaw =
    product.detail?.specs &&
    (
      (product.detail.specs as any).reviewsCount ??        // our scraper key
      (product.detail.specs as any).reviewCount ??         // fallback spelling
      null
    );

  const reviewsCount =
    typeof reviewsCountRaw === 'number' && isFinite(reviewsCountRaw) ? reviewsCountRaw : null;

  const ratingStars =
    ratingValue != null
      ? '★'.repeat(Math.min(5, Math.max(1, Math.round(ratingValue))))
      : '';

  return (
    <>
      <button onClick={handleBack} className="btn">← Back</button>

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

          {price ? (
            <div className="text-xl font-semibold">{price}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex gap-3">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                View on World of Books
              </a>
            )}
            {/* IMPORTANT: keep prefetch off, and pass ?refresh=true to trigger a scrape server-side */}
            <Link href={`/product/${product.id}?refresh=true`} prefetch={false} className="btn btn-ghost">
              Force refresh
            </Link>
          </div>

          {/* Meta panel: always visible (even if description is empty) */}
          <div className="card p-4">
            <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
            <div className="whitespace-pre-line leading-relaxed">
              {product.detail?.description?.trim() || '—'}
            </div>

            <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-4 items-center">
              <span>Last scraped: {formatWhen(pickDate)}</span>

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
                {reviewsCount != null ? reviewsCount : ' Not available'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {relatedItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Related in {product.category?.title ?? 'this category'}
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
