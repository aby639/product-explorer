import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL!;

async function getProduct(id: string, force = false) {
  const url = `${API}/products/${id}${force ? '?refresh=true' : ''}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
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
  const initial = await getProduct(id, sp?.refresh === 'true');

  return <ProductClient id={id} initial={initial} />;
}
