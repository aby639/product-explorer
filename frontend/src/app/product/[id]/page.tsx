import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL!;

async function getProduct(id: string, refresh: boolean) {
  const url = `${API}/products/${id}${refresh ? '?refresh=true' : ''}`;
  // Use a single cache directive to avoid the Next warning
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load product');
  return res.json();
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { refresh?: string };
}) {
  const { id } = params;
  const product = await getProduct(id, searchParams?.refresh === 'true');

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href="/" className="btn">← Back</Link>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image ?? ''}
            alt={product.title}
            className="mx-auto max-h-[420px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>

          {product.price != null && product.currency && (
            <div className="text-xl font-semibold">
              {new Intl.NumberFormat(
                product.currency === 'GBP' ? 'en-GB' : 'en-US',
                { style: 'currency', currency: product.currency }
              ).format(product.price)}
            </div>
          )}

          {product.sourceUrl && (
            <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="btn">
              View on World of Books
            </a>
          )}

          <a href={`/product/${id}?refresh=true`} className="btn btn-ghost">
            Force refresh
          </a>

          {product.detail?.description && (
            <div className="card p-4">
              <div className="text-xs tracking-wider opacity-70 mb-2">SCRAPED DESCRIPTION</div>
              <p className="whitespace-pre-wrap leading-relaxed">{product.detail.description}</p>
              {product.detail.lastScrapedAt && (
                <div className="mt-2 text-xs opacity-60">
                  Last scraped: {new Date(product.detail.lastScrapedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
