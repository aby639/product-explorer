'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load (${r.status})`)
    return r.json()
  })

type Product = {
  id: string
  title: string
  image?: string | null
  price?: number | null
  currency?: string | null
}

type GridResponse = {
  items: Product[]
  total: number
  /** backend returns `limit`, not `pageSize` */
  limit: number
  /** backend may also return page (but we don’t really need it) */
  page?: number
}

function money(value?: number | null, currency?: string | null) {
  if (value == null || !currency) return '—'
  try {
    return new Intl.NumberFormat(
      currency === 'GBP' ? 'en-GB' : currency === 'EUR' ? 'de-DE' : 'en-US',
      { style: 'currency', currency }
    ).format(value)
  } catch {
    return `${Number(value)} ${currency}`
  }
}

function CardSkeleton() {
  return (
    <li className="card p-4">
      <div className="h-48 w-full rounded-xl bg-white/10 animate-pulse" />
      <div className="mt-3 h-5 w-2/3 rounded bg-white/10 animate-pulse" />
      <div className="mt-2 h-4 w-20 rounded bg-white/10 animate-pulse" />
      <div className="mt-4 h-8 w-28 rounded-full bg-white/10 animate-pulse" />
    </li>
  )
}

export default function ClientGrid({ categoryId }: { categoryId: string }) {
  const [page, setPage] = useState(1)
  const limit = 12

  // Reset to page 1 when the category changes
  useEffect(() => setPage(1), [categoryId])

  const url = useMemo(
    () =>
      `${API}/products?category=${encodeURIComponent(categoryId)}&page=${page}&limit=${limit}`,
    [categoryId, page]
  )

  const { data, error, isLoading } = useSWR<GridResponse>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const items = data?.items ?? []
  const total = typeof data?.total === 'number' ? data!.total : 0
  const pageSize = typeof data?.limit === 'number' ? data!.limit : limit
  const pages = Math.max(1, Math.ceil(total / pageSize))

  // Clamp page if total/pageSize changed
  useEffect(() => {
    if (!isLoading && page > pages) setPage(pages)
  }, [isLoading, page, pages])

  return (
    <div className="space-y-5">
      {/* Error state */}
      {error && (
        <div className="card p-4 text-sm">
          <div className="font-medium">Oops, failed to load products.</div>
          <div className="opacity-70">Try again or go back and pick another category.</div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div className="card p-6 text-sm">
          <div className="font-medium">No products found.</div>
          <div className="opacity-70">This category is empty right now.</div>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : items.map((p) => (
              <li
                key={p.id}
                className="group card card-hover card-raise p-4 hover:border-white/20"
              >
                <div className="relative overflow-hidden rounded-xl">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      className="h-48 w-full rounded-xl bg-slate-900/60 object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="h-48 w-full rounded-xl bg-slate-900/60" />
                  )}
                  <div className="absolute left-3 top-3">
                    <span className="badge">{money(p.price, p.currency)}</span>
                  </div>
                </div>
                <h3 className="mt-3 line-clamp-2 text-lg font-medium leading-snug">{p.title}</h3>
                <Link href={`/product/${p.id}`} className="btn mt-4" aria-label={`View details for ${p.title}`}>
                  View details
                </Link>
              </li>
            ))}
      </ul>

      {/* Pager */}
      <div className="flex items-center gap-3 pt-1">
        <button
          className="btn disabled:opacity-50"
          aria-label="Previous page"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>

        <span className="rounded-full border border-white/15 px-4 py-2 text-sm">
          {Math.min(page, pages)} / {pages}
        </span>

        <button
          className="btn disabled:opacity-50"
          aria-label="Next page"
          disabled={page >= pages || isLoading}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
        >
          Next
        </button>

        <div className="ml-auto text-xs opacity-70">Total: {total}</div>
      </div>
    </div>
  )
}
