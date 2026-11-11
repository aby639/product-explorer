'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import BookImage from '../../components/BookImage';
import { API, fetchJson, money, type GridResponse } from '../../../lib/products';
type Category = { id: string; title: string; slug?: string | null };

export default function ClientGrid({ categoryId, initialPage = 1 }: { categoryId: string; initialPage?: number }) {
  const [page, setPage] = useState(initialPage);
  const { data: categories, error: categoryError, isLoading: categoriesLoading, mutate: retryCategories } =
    useSWR<Category[]>(`${API}/categories/books`, fetchJson, { revalidateOnFocus: false });
  const key = categoryId.toLowerCase();
  const matched = categories?.find(c => c.id.toLowerCase() === key || c.slug?.toLowerCase() === key || c.title.toLowerCase() === key);
  const query = new URLSearchParams({ category: matched?.id ?? '', page: String(page), limit: '12' });
  const { data, error: productsError, isLoading: productsLoading, isValidating, mutate: retryProducts } =
    useSWR<GridResponse>(matched ? `${API}/products?${query}` : null, fetchJson, {
      revalidateOnFocus: false, keepPreviousData: true,
    });
  const error = categoryError || productsError;
  const loading = !error && (categoriesLoading || (Boolean(matched) && productsLoading));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.limit || 12)));

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    const url = new URL(window.location.href);
    url.searchParams.set('page', String(nextPage));
    window.history.replaceState(null, '', url);
  };
  useEffect(() => {
    if (data && !isValidating && !error && page > pages) changePage(pages);
  }, [data, isValidating, error, page, pages]);

  if (error) return <div role="alert" className="card p-5 space-y-3">
    <p>Could not load the books. Please try again.</p>
    <button className="btn" onClick={() => { void retryCategories(); void retryProducts(); }}>Try again</button>
    <Link href="/categories/books" className="btn">Back to categories</Link>
  </div>;
  if (!categoriesLoading && !matched) return <div className="card p-5 space-y-3">
    <h2 className="font-medium">Category not found.</h2>
    <Link href="/categories/books" className="btn">Choose a category</Link>
  </div>;

  return <div className="space-y-5">
    {loading && <p role="status" className="text-sm text-slate-300">Loading books…</p>}
    <ul aria-label="Books" aria-busy={loading} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {loading ? Array.from({ length: 6 }, (_, i) => <li key={i} aria-hidden="true" className="card p-4">
        <div className="h-48 rounded-xl bg-white/10 animate-pulse" />
        <div className="mt-3 h-5 w-2/3 rounded bg-white/10 animate-pulse" />
      </li>) : (data?.items ?? []).map(product => <li key={product.id} className="group card card-hover card-raise p-4">
        <BookImage src={product.image} title={product.title}
          className="h-48 w-full rounded-xl bg-slate-900/60 object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
        <h2 className="mt-3 line-clamp-2 text-lg font-medium leading-snug">{product.title}</h2>
        <p className="mt-2 text-sm text-slate-300">{money(product.price, product.currency) ?? 'Price not available'}</p>
        <Link href={`/product/${product.id}`} onClick={() => {
          try { localStorage.setItem('lastListPath', window.location.pathname + window.location.search); } catch { /* Optional navigation preference. */ }
        }} className="btn mt-4" aria-label={`View details for ${product.title}`}>View details</Link>
      </li>)}
    </ul>
    {!loading && data?.items.length === 0 && <div className="card p-6">No books in this category yet.</div>}
    <nav aria-label="Book pages" className="flex flex-wrap items-center gap-3 pt-1">
      <button className="btn disabled:opacity-50" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>Previous</button>
      <span className="text-sm">Page {Math.min(page, pages)} of {pages}</span>
      <button className="btn disabled:opacity-50" disabled={page >= pages || loading} onClick={() => changePage(page + 1)}>Next</button>
      <span className="text-xs text-slate-300">Total: {total}</span>
    </nav>
  </div>;
}
