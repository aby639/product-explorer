import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type Recommendation = {
  href: string
  title?: string | null
  price?: number | null
  currency?: string | null
  sourceId?: string | null
}
type ProductDetail = {
  description?: string | null
  ratingAverage?: number | null
  lastScrapedAt?: string | null
  specs?: { recommendations?: Recommendation[]; [k: string]: any } | null
}
type Product = {
  id: string
  title: string
  image?: string | null
  price?: number | null
  currency?: string | null
  sourceUrl?: string | null
  detail?: ProductDetail | null
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
export const dynamic = 'force-dynamic'

function money(v?: number | null, c?: string | null) {
  if (v == null || !c) return null
  try {
    return new Intl.NumberFormat(
      c === 'GBP' ? 'en-GB' : c === 'EUR' ? 'de-DE' : 'en-US',
      { style: 'currency', currency: c },
    ).format(v)
  } catch {
    return `${Number(v)} ${c}`
  }
}

async function getProduct(id: string, refresh?: boolean): Promise<Product | null> {
  const qs = refresh ? '?refresh=true' : ''
  const res = await fetch(`${API}/products/${encodeURIComponent(id)}${qs}`, {
    next: { revalidate: 0 },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to load product (${res.status}).`)
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text)
}

/** Server action that forces a scrape on the backend, then reloads this page. */
async function forceRefreshAction(id: string) {
  'use server'
  await fetch(`${API}/products/${encodeURIComponent(id)}/refresh`, {
    method: 'POST',
    cache: 'no-store',
  }).catch(() => undefined)
  // Ensure the page refetches fresh data
  revalidatePath(`/product/${id}`)
  redirect(`/product/${id}?refresh=true`)
}

// NOTE: Next.js 15: params/searchParams are Promises
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ refresh?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : undefined
  const refresh = sp?.refresh === 'true'

  const product = await getProduct(id, refresh)

  if (!product) {
    return (
      <div className="space-y-6">
        <Link href="/categories/books" className="btn">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold">Product not found</h1>
        <p className="opacity-80">It may have been removed or the database was reset.</p>
      </div>
    )
  }

  const recs = product.detail?.specs?.recommendations ?? []
  const formattedPrice = money(product.price, product.currency)

  return (
    <div className="space-y-6">
      <Link href="/categories/books" className="btn">
        ← Back
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="card p-3">
          <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-900/60 flex items-center justify-center">
            {product.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.title} className="h-full w-full object-contain" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">{product.title}</h1>
          {formattedPrice && <div className="text-lg">{formattedPrice}</div>}

          <div className="flex gap-3">
            {product.sourceUrl ? (
              <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="btn">
                View on World of Books
              </a>
            ) : (
              <div className="opacity-70 text-sm">No source URL</div>
            )}

            <form action={forceRefreshAction.bind(null, product.id)}>
              <button type="submit" className="btn btn-primary">
                Force refresh
              </button>
            </form>
          </div>

          <div className="card p-4 ring-1 ring-white/10">
            <div className="text-xs uppercase tracking-wide opacity-60 mb-1">Scraped description</div>
            <div className="whitespace-pre-wrap leading-relaxed">
              {product.detail?.description?.trim() || '—'}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs opacity-70">
              {product.detail?.ratingAverage != null && <span>Rating: {product.detail.ratingAverage}</span>}
              {product.detail?.lastScrapedAt && (
                <span>Last scraped: {new Date(product.detail.lastScrapedAt).toLocaleString()}</span>
              )}
            </div>
          </div>

          {Array.isArray(recs) && recs.length > 0 && (
            <div>
              <div className="text-sm uppercase opacity-70 mb-2">You may also like</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recs.map((rec, i) => (
                  <li key={rec.sourceId ?? rec.href ?? i} className="card card-hover p-3">
                    <a className="underline" href={rec.href} target="_blank" rel="noreferrer">
                      {rec.title || rec.href}
                    </a>
                    {rec.price != null && rec.currency && (
                      <div className="text-xs opacity-80 mt-1">{money(rec.price, rec.currency)}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
