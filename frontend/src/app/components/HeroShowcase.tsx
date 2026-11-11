'use client';

import useSWR from 'swr';
import Link from 'next/link';
import BookImage from './BookImage';
import { API, fetchJson, type GridResponse } from '../../lib/products';

export default function HeroShowcase() {
  const { data, error, isLoading } = useSWR<GridResponse>(
    `${API}/products?limit=8`, fetchJson, { revalidateOnFocus: false },
  );
  return <div className="card p-6 min-w-0 space-y-4">
    <h2 className="text-lg font-semibold">From the catalogue</h2>
    {isLoading ? <p role="status">Loading books…</p> : error ? (
      <p className="text-slate-300">Book previews could not be loaded.</p>
    ) : data?.items.length ? (
      <ul aria-label="Book previews" className="flex gap-4 overflow-x-auto snap-x snap-mandatory p-1">
        {data.items.map(book => <li key={book.id} className="snap-start shrink-0 w-36">
          <Link href={`/product/${book.id}`} className="block rounded-xl focus-visible:outline focus-visible:outline-emerald-400">
            <BookImage src={book.image} title={book.title} className="h-52 w-full rounded-xl bg-slate-900/60 object-contain" />
            <span className="mt-2 block text-sm line-clamp-2">{book.title}</span>
          </Link>
        </li>)}
      </ul>
    ) : <p className="text-slate-300">No books are available yet.</p>}
    <Link href="/categories/books" className="btn">View categories →</Link>
  </div>;
}
