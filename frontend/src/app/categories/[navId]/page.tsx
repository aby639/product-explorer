import Link from 'next/link';
import { API, fetchJson } from '../../../lib/products';
type Category = { id: string; title: string; slug?: string | null };

export default async function Page({ params }: { params: { navId: string } }) {
  let categories: Category[] | null = null;
  try { categories = await fetchJson<Category[]>(`${API}/categories/${encodeURIComponent(params.navId)}`); }
  catch { /* Keep navigation available during an API outage. */ }
  return (
    <div className="space-y-6">
      <Link href="/" className="btn">← Home</Link>
      <h1 className="section-title">Book categories</h1>
      {categories ? (
        categories.length ? <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {categories.map(category => <li key={category.id} className="flex items-center justify-between gap-4 p-4">
            <h2>{category.title}</h2>
            <Link href={`/products/${encodeURIComponent(category.slug ?? category.id)}`}
              aria-label={`Browse ${category.title}`} className="btn">Browse</Link>
          </li>)}
        </ul> : <p>No categories are available yet.</p>
      ) : <div className="card p-5 space-y-3">
        <p>Could not load the categories. Please try again in a moment.</p>
        <a className="btn" href={`/categories/${encodeURIComponent(params.navId)}`}>Try again</a>
      </div>}
    </div>
  );
}
