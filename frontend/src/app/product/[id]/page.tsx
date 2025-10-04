import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

async function getProduct(id: string, refresh: boolean) {
  const url = `${API}/products/${id}${refresh ? '?refresh=true' : ''}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
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
      {!product ? (
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
        </div>
      ) : (
        <ProductClient product={product} id={params.id} />
      )}
    </main>
  );
}
