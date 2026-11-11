'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import BookImage from '../../components/BookImage';
import { API, fetchJson, lastScraped, money, webUrl, type Product, type GridResponse } from '../../../lib/products';

export default function ProductClient({ product: initialProduct }: { product: Product }) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const requestActive = useRef(false);
  const [checkedAt, setCheckedAt] = useState('Not checked yet');

  useEffect(() => {
    setProduct(initialProduct);
    setMessage('');
    return () => request.current?.abort();
  }, [initialProduct]);

  const scrapedAt = lastScraped(product);
  useEffect(() => {
    setCheckedAt(scrapedAt ? new Date(scrapedAt).toLocaleString() : 'Not checked yet');
  }, [scrapedAt]);

  const handleBack = () => {
    try {
      const saved = localStorage.getItem('lastListPath');
      if (saved && /^\/products\//.test(saved)) {
        const url = new URL(saved, window.location.origin);
        if (url.origin === window.location.origin) {
          router.push(url.pathname + url.search);
          return;
        }
      }
    } catch { /* Navigation still works when browser storage is unavailable. */ }
    const category = product.category?.slug ?? product.category?.id;
    router.push(category ? `/products/${encodeURIComponent(category)}` : '/categories/books');
  };

  const refresh = async () => {
    if (requestActive.current) return;
    requestActive.current = true;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    setRefreshing(true);
    setRefreshFailed(false);
    setMessage('Checking the source website…');
    try {
      const updated = await fetchJson<Product>(`${API}/products/${product.id}/refresh`, {
        method: 'POST', signal: controller.signal,
      });
      setProduct(updated);
      setMessage(lastScraped(updated) === scrapedAt
        ? 'No newer details were returned. Wait a few seconds before trying again.'
        : 'Book details updated.');
    } catch {
      setRefreshFailed(true);
      setMessage('Could not refresh this book. Your saved details are still shown. Please try again later.');
    } finally {
      window.clearTimeout(timeout);
      requestActive.current = false;
      if (request.current === controller) request.current = null;
      setRefreshing(false);
    }
  };

  const sourceUrl = webUrl(product.detail?.specs?.sourceUrl ?? product.sourceUrl);
  const relatedUrl = product.category?.id
    ? `${API}/products?category=${encodeURIComponent(product.category.id)}&limit=7` : null;
  const { data: related } = useSWR<GridResponse>(relatedUrl, fetchJson, { revalidateOnFocus: false });
  const relatedItems = (related?.items ?? []).filter(p => p.id !== product.id).slice(0, 6);
  const rating = product.detail?.ratingAverage;
  const validRating = typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 5;
  const count = product.detail?.specs?.reviewCount ?? product.detail?.specs?.reviewsCount;
  const validCount = typeof count === 'number' && Number.isInteger(count) && count >= 0;

  return (
    <div className="space-y-6">
      <button onClick={handleBack} className="btn">← Back to books</button>
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center min-w-0">
          <BookImage src={product.image} title={product.title} className="h-[360px] max-w-full object-contain" />
        </div>
        <div className="space-y-4 min-w-0">
          <h1 className="section-title break-words">{product.title}</h1>
          <div className="text-xl font-semibold">{money(product.price, product.currency) ?? 'Price not available'}</div>
          {product.detail?.specs?.unavailable === true && <p>Out of stock at the last check.</p>}
          <div className="flex flex-wrap gap-3">
            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">View source page</a>}
            <button onClick={refresh} disabled={refreshing} aria-busy={refreshing} className="btn disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh details'}
            </button>
          </div>
          <p role={refreshFailed ? 'alert' : 'status'} className="text-sm text-slate-300">{message}</p>
          <div className="card p-4 space-y-3">
            <h2 className="font-medium">Description</h2>
            <p className="whitespace-pre-line leading-relaxed">{product.detail?.description?.trim() || 'No description available.'}</p>
            <dl className="space-y-2 text-sm text-slate-300">
              <div><dt className="inline">Last checked: </dt><dd className="inline">{checkedAt}</dd></div>
              <div><dt className="inline">Rating: </dt><dd className="inline">{validRating ? `${rating.toFixed(1)} / 5` : 'Not available'}</dd></div>
              <div><dt className="inline">Reviews: </dt><dd className="inline">{validCount ? count : 'Not available'}</dd></div>
            </dl>
          </div>
        </div>
      </section>
      {relatedItems.length > 0 && <section className="space-y-3">
        <h2 className="text-lg font-semibold">More in {product.category?.title ?? 'this category'}</h2>
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {relatedItems.map(p => <li key={p.id} className="card p-4">
            <BookImage src={p.image} title={p.title} className="h-40 w-full rounded-xl object-contain bg-slate-900/60" />
            <h3 className="mt-3 line-clamp-2 font-medium">{p.title}</h3>
            <p className="text-sm text-slate-300 mt-1">{money(p.price, p.currency) ?? 'Price not available'}</p>
            <Link href={`/product/${p.id}`} className="btn mt-3" aria-label={`View details for ${p.title}`}>View details</Link>
          </li>)}
        </ul>
      </section>}
    </div>
  );
}
