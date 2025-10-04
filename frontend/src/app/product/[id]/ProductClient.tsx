'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    id?: string;
    description?: string | null;
    ratingAverage?: number | null;
    specs?: Record<string, unknown> | null;
    lastScrapedAt?: string | null;
  } | null;
};

function toHttps(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u, 'https://www.worldofbooks.com');
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
}

function money(value?: number | null, currency?: string | null) {
  if (value == null || !currency) return null;
  try {
    return new Intl.NumberFormat(
      currency === 'GBP' ? 'en-GB' : currency === 'EUR' ? 'de-DE' : 'en-US',
      { style: 'currency', currency },
    ).format(value);
  } catch {
    return `${Number(value)} ${currency}`;
  }
}

export default function ProductClient({ product }: { product: Product }) {
  const router = useRouter();

  // —— Resolve source/origin URL without TS index errors ——
  const pAny = product as unknown as Record<string, any>;
  const sourceUrl: string | null =
    toHttps(
      pAny?.detail?.specs?.sourceUrl ??
        pAny?.detail?.specs?.source_url ??
        pAny?.sourceUrl ??
        pAny?.source_url ??
        null,
    ) ?? null;

  const priceFormatted = money(product.price, product.currency);

  // Small helper: go “Back” to the last list path if we saved one from the grid
  const doBack = () => {
    if (typeof window !== 'undefined') {
      const last = localStorage.getItem('lastListPath');
      if (last) {
        router.push(last);
        return;
      }
      // Fallback: history back or home
      if (window.history.length > 1) window.history.back();
      else router.push('/');
    }
  };

  // Related strip: naive — same category, excluding this product
  const relatedUrl = useMemo(() => {
    if (!product?.category?.id) return null;
    const params = new URLSearchParams({
      category: product.category.id,
      page: '1',
      limit: '8',
    });
    return `${API}/products?${params.toString()}`;
  }, [product?.category?.id]);

  return (
    <>
      <button className="btn" onClick={doBack}>
        ← Back
      </button>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image ?? ''}
            alt={product.title}
            className="max-h-[480px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>

          {priceFormatted ? (
            <div className="text-xl font-semibold">{priceFormatted}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex flex-wrap gap-3">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                View on World of Books
              </a>
            )}
            <Link href={`/product/${product.id}?refresh=true`} className="btn btn-ghost">
              Force refresh
            </Link>
          </div>

          {product?.detail?.ratingAverage != null && (
            <div className="text-sm">
              <span className="opacity-70">Rating:</span>{' '}
              <span className="font-medium">{product.detail.ratingAverage} / 5</span>
            </div>
          )}

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

      {/* Related strip */}
      {relatedUrl && (
        <RelatedStrip
          url={relatedUrl}
          currentId={product.id}
          sectionTitle={`Related in ${product?.category?.title ?? 'category'}`}
        />
      )}
    </>
  );
}

/* -------------------------- Related strip (SWR) -------------------------- */

import useSWR from 'swr';

type RelatedResp = {
  items: Array<{ id: string; title: string; image?: string | null; price?: number | null; currency?: string | null }>;
};

function RelatedStrip({
  url,
  currentId,
  sectionTitle,
}: {
  url: string;
  currentId: string;
  sectionTitle: string;
}) {
  const { data } = useSWR<RelatedResp>(url, (u) => fetch(u).then((r) => r.json()), {
    revalidateOnFocus: false,
  });

  const items = (data?.items ?? []).filter((x) => x.id !== currentId);

  if (!items.length) return null;

  return (
    <section className="mt-10 space-y-4">
      <h2 className="text-lg font-semibold">{sectionTitle}</h2>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((p) => (
          <li key={p.id} className="card p-4">
            <div className="relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toHttps(p.image) ?? ''}
                alt={p.title}
                className="h-40 w-full rounded-xl bg-slate-900/60 object-contain"
                loading="lazy"
              />
            </div>
            <div className="mt-3 text-base font-medium line-clamp-2">{p.title}</div>
            <div className="mt-1 text-sm opacity-70">
              {money(p.price, p.currency) ?? ''}
            </div>
            <Link
              href={`/product/${p.id}`}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem(
                    'lastListPath',
                    window.location.pathname + window.location.search,
                  );
                }
              }}
              className="btn mt-3"
            >
              View
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
