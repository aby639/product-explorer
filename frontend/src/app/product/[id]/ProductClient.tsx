'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
    lastScrapedAt?: string | null;      // timestamptz from DB
    specs?: Record<string, any> | null; // JSON bag (can mirror timestamp, review count, status)
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

// Extract the canonical source URL from multiple places
const getSourceUrl = (p: Product) =>
  (p.detail?.specs?.sourceUrl as string | undefined) ??
  (p.detail?.specs?.source_url as string | undefined) ??
  p.sourceUrl ??
  (p.detail?.specs?.url as string | undefined);

// Pick the best available "last scraped" timestamp
const getLastScrapedIso = (p: Product) =>
  p.detail?.lastScrapedAt ??
  (p.detail?.specs?.lastScrapedAtISO as string | undefined) ??
  (p.detail as any)?.updatedAt ??
  (p.detail as any)?.createdAt ??
  null;

// Reviews count is kept in specs.reviewsCount by the scraper
const getReviewsCount = (p: Product) => {
  const raw = p.detail?.specs && (p.detail.specs as any).reviewsCount;
  return typeof raw === 'number' && isFinite(raw) ? raw : null;
};

export default function ProductClient({ product: initial }: { product: Product }) {
  const sp = useSearchParams();
  const forced = (sp.get('refresh') || '').toLowerCase() === 'true';

  // ---- live polling only when refresh=true ----
  // We poll the plain endpoint *without* refresh=true (scrape is already triggered)
  // with a short interval so the UI flips as soon as the DB has the new timestamp.
  const { data: liveAfterRefresh } = useSWR<Product>(
    forced ? `${API}/products/${initial.id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: forced ? 1500 : 0,     // poll while the query param is present
      dedupingInterval: 500,                  // allow quick successive checks
    }
  );

  // Prefer the “live” copy if it has a newer timestamp than the initial server render
  const initialTs = getLastScrapedIso(initial);
  const liveTs = liveAfterRefresh ? getLastScrapedIso(liveAfterRefresh) : null;
  const useLive =
    !!liveAfterRefresh &&
    !!liveTs &&
    !!initialTs &&
    new Date(liveTs).getTime() > new Date(initialTs).getTime();

  const product = useLive ? liveAfterRefresh! : initial;

  // ---------------- UI derivations ----------------
  const price = money(product.price, product.currency);
  const sourceUrl = getSourceUrl(product);
  const lastIso = getLastScrapedIso(product);

  const ratingValue =
    typeof product.detail?.ratingAverage === 'number'
      ? product.detail!.ratingAverage!
      : null;
  const reviewsCount = getReviewsCount(product);

  const ratingStars =
    ratingValue != null ? '★'.repeat(Math.min(5, Math.max(1, Math.round(ratingValue)))) : '';

  // Related list (same category)
  const relatedUrl = product.category?.id
    ? `${API}/products?category=${encodeURIComponent(product.category.id)}&limit=6`
    : null;

  const { data: related } = useSWR<GridResponse>(relatedUrl ?? null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const relatedItems = (related?.items ?? []).filter((p) => p.id !== product.id).slice(0, 6);

  // Back button smarter behavior
  const handleBack = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lastListPath') : null;
    if (saved) window.location.href = saved;
    else if (history.length > 1) history.back();
    else window.location.href = '/';
  };

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
            {/* keep prefetch off; query param triggers the scrape */}
            <Link href={`/product/${product.id}?refresh=true`} prefetch={false} className="btn btn-ghost">
              Force refresh
            </Link>
            {forced && !useLive && (
              <span className="text-xs opacity-60 self-center">refreshing…</span>
            )}
          </div>

          {product?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Scraped description</div>
              <div className="whitespace-pre-line leading-relaxed">
                {product.detail.description}
              </div>

              <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-4 items-center">
                <span>Last scraped: {lastIso ? new Date(lastIso).toLocaleString() : '—'}</span>

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
                  Reviews: {reviewsCount != null ? reviewsCount : 'Not available'}
                </span>
              </div>
            </div>
          )}
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
