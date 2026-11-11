import Link from 'next/link';
import ProductClient from './ProductClient';
import { API, fetchJson, type Product } from '../../../lib/products';
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  let product: Product | null = null;
  try { product = await fetchJson<Product>(`${API}/products/${encodeURIComponent(params.id)}`); }
  catch { /* Keep navigation available when the API is offline or the book is missing. */ }
  return product ? <ProductClient key={product.id} product={product} /> : (
    <div className="card p-6 space-y-3">
      <h1 className="text-lg font-semibold">Could not load this book.</h1>
      <p>It may no longer be available, or the server may be offline.</p>
      <a className="btn" href={`/product/${encodeURIComponent(params.id)}`}>Try again</a>
      <Link className="btn" href="/categories/books">Back to categories</Link>
    </div>
  );
}
