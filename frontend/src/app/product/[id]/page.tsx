import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL!;

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null; // <-- link back to WOB
  detail?: {
    description?: string | null;
    lastScrapedAt?: string | null;
  } | null;
};

async function getProduct(id: string, force = false) {
  const url = `${API}/products/${id}${force ? '?refresh=true' : ''}`;
  // Remove Next warning: use only cache: 'no-store'
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load product');
  return (await res.json()) as Product;
}

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ refresh?: string }>;
}) {
  const [{ id }, sp = {} as any] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const product = await getProduct(id, sp?.refresh === 'true');

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href="/" className="btn">← Back</Link>

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

          {product.price != null && product.currency ? (
            <div className="text-xl font-semibold">
              {new Intl.NumberFormat(
                product.currency === 'GBP' ? 'en-GB' : product.currency === 'EUR' ? 'de-DE' : 'en-US',
                { style: 'currency', currency: product.currency }
              ).format(product.price)}
            </div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex gap-3">
            {product?.sourceUrl && (
              <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="btn">
                View on World of Books
              </a>
            )}
            <Link href={`/product/${product.id}?refresh=true`} className="btn btn-ghost">
              Force refresh
            </Link>
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
    </main>
  );
}
