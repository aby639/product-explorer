'use client';

import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL!;

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
    lastScrapedAt?: string | null;
    ratingAverage?: number | null;
    specs?: Record<string, any> | null;
  } | null;
};

type ProductsList = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => {
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
});

function formatMoney(p?: number | null, c?: string | null) {
  if (p == null || !c) return null;
  return new Intl.NumberFormat(
    c === 'GBP' ? 'en-GB' : c === 'EUR' ? 'de-DE' : 'en-US',
    { style: 'currency', currency: c },
  ).format(p);
}

// star display (simple)
function Stars({ value }: { value?: number | null }) {
  if (!value || value <= 0) return null;
  const filled = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <div aria-label={`${value} out of 5`} className="text-sm opacity-80">
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)} <span className="ml-1">({value.toFixed(1)})</span>
    </div>
  );
}

export default function ProductClient({
  id,
  backHref,
}: {
  id: string;
  backHref: string;
}) {
  const router = useRouter();

  // primary product
  const { data: product, isLoading, error } = useSWR<Product>(`${API}/products/${id}`, fetcher);

  // track a "view" once the product loads
  useEffect(() => {
    if (!product?.id) return;
    const ctrl = new AbortController();
    fetch(`${API}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id }),
      signal: ctrl.signal,
    }).catch(() => void 0);
    return () => ctrl.abort();
  }, [product?.id]);

  // related: fetch more items from the same category (exclude current)
  const catSlug = product?.category?.slug;
  const { data: related } = useSWR<ProductsList>(
    catSlug ? `${API}/products?category=${encodeURIComponent(catSlug)}&page=1&limit=6` : null,
    fetcher,
  );

  const relatedItems = useMemo(
    () => (related?.items || []).filter((p) => p.id !== product?.id),
    [related?.items, product?.id],
  );

  const money = formatMoney(product?.price, product?.currency);
  const sourceUrl = product?.sourceUrl ?? (product?.detail?.specs as any)?.origin ?? null;

  if (isLoading) {
    return (
      <main className="container-xl py-8 space-y-6">
        <button onClick={() => router.back()} className="btn">← Back</button>
        <div className="card p-6">Loading…</div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="container-xl py-8 space-y-6">
        <Link href={backHref} className="btn">← Back</Link>
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
          <p className="opacity-70 mt-1">Please try again in a moment.</p>
          <div className="mt-4 flex gap-3">
            <button
              className="btn"
              onClick={async () => {
                await mutate(`${API}/products/${id}`); // refetch
              }}
            >
              Try refresh
            </button>
            <Link href="/categories/books" className="btn btn-ghost">Browse categories</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href={backHref} className="btn">← Back</Link>

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
          {money ? <div className="text-xl font-semibold">{money}</div> : <div className="opacity-70">Price not available</div>}
          <Stars value={product?.detail?.ratingAverage ?? null} />

          <div className="flex gap-3">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                View on World of Books
              </a>
            )}
            <button
              className="btn btn-ghost"
              onClick={async () => {
                // Force a fresh scrape on the server, then revalidate SWR keys
                try {
                  await fetch(`${API}/products/${product.id}?refresh=true`, { cache: 'no-store' });
                } catch {}
                await Promise.all([
                  mutate(`${API}/products/${id}`),
                  catSlug ? mutate(`${API}/products?category=${encodeURIComponent(catSlug)}&page=1&limit=6`) : Promise.resolve(),
                ]);
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

      {/* Related/recommendations */}
      {!!relatedItems.length && (
        <section className="space-y-3">
          <h2 className="section-subtitle">Related in {product.category?.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedItems.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="card p-4 hover:opacity-90 transition">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image ?? ''} alt={p.title} className="h-40 w-full object-contain mb-3" />
                <div className="font-medium">{p.title}</div>
                <div className="opacity-70 text-sm mt-1">
                  {formatMoney(p.price, p.currency) ?? '—'}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
