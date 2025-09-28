import Link from 'next/link';
import ClientGrid from './ClientGrid';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  return (
    <div className="space-y-6">
      <Link href="/categories/books" className="btn">← Back</Link>
      <h1 className="section-title">Products: {categoryId}</h1>
      <ClientGrid categoryId={categoryId} />
    </div>
  );
}
