import Link from 'next/link';
import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL!;

async function getProduct(id: string, force = false) {
  const url = `${API}/products/${id}${force ? '?refresh=true' : ''}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { refresh?: string };
}) {
  const product = await getProduct(params.id, searchParams?.refresh === 'true');

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href="/" className="btn">← Back</Link>

      {!product ? (
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
          <p className="opacity-70 mt-1">Please try again in a moment.</p>
          <div className="mt-4 flex gap-3">
            <Link href={`/product/${params.id}?refresh=true`} className="btn">Try refresh</Link>
            <Link href="/categories/books" className="btn btn-ghost">Browse categories</Link>
          </div>
        </div>
      ) : (
        <ProductClient product={product} />
      )}
    </main>
  );
}
