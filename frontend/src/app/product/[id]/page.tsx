// /app/product/[id]/page.tsx
import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    ratingAverage?: number | null;
    lastScrapedAt?: string | null;       // ISO string from backend
    specs?: Record<string, any> | null;  // may include lastScrapedAtISO
  } | null;
};

const get = (id: string) =>
  fetch(`${API}/products/${id}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Product> : null);

const postRefresh = (id: string) =>
  fetch(`${API}/products/${id}/refresh`, { method: 'POST', cache: 'no-store' }).then(() => undefined);

const pickTime = (p?: Product | null) =>
  p?.detail?.lastScrapedAt ??
  (p?.detail?.specs as any)?.lastScrapedAtISO ??
  null;

export default async function Page({
  params,
  searchParams,
}: { params: { id: string }, searchParams?: { refresh?: string } }) {
  const id = params.id;
  const doRefresh = (searchParams?.refresh ?? '').toLowerCase() === 'true';

  // 1) get current snapshot (for comparison)
  const before = await get(id);
  let product = before;

  // 2) if refresh requested, trigger then poll until timestamp changes
  if (doRefresh) {
    await postRefresh(id); // wait for server to start & finish scrape (see Option B for server behavior)

    const prev = pickTime(before);
    const deadline = Date.now() + 10_000; // up to ~10s
    // 4–6 quick polls; bail as soon as we see a newer timestamp
    while (Date.now() < deadline) {
      const p = await get(id);
      const nowT = pickTime(p);
      if (nowT && (!prev || new Date(nowT).getTime() > new Date(prev).getTime())) {
        product = p;
        break;
      }
      // small delay between polls (server needs time to persist)
      await new Promise(r => setTimeout(r, 800));
    }
    // if it never moved, still render whatever we have
  }

  return (
    <main className="container-xl py-8 space-y-6">
      {product ? <ProductClient product={product} /> : (
        <div className="card p-6">
          <div className="text-lg font-semibold">Couldn’t load this product right now.</div>
          <p className="opacity-70 mt-1">Please try again in a moment or go back and pick another one.</p>
        </div>
      )}
    </main>
  );
}
