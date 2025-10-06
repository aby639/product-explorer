import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export const dynamic = 'force-dynamic';

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    ratingAverage?: number | null;
    lastScrapedAt?: string | null;
    specs?: Record<string, any> | null;
  } | null;
  /** some seeds store this at the root; keep it optional */
  sourceUrl?: string | null;
};

async function getProduct(id: string, refresh: boolean) {
  const url = `${API}/products/${id}${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as Product;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { refresh?: string };
}) {
  const product = await getProduct(params.id, (searchParams?.refresh ?? '').toLowerCase() === 'true');

  return (
    <main className="container-xl py-8 space-y-6">
      {product ? (
        <ProductClient product={product} />
      ) : (
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
          <p className="opacity-70 mt-1">Please try again in a moment or go back and pick another one.</p>
        </div>
      )}
    </main>
  );
}
