import Link from 'next/link';
import ClientGrid from './ClientGrid';
export default function Page({ params, searchParams }: {
  params: { categoryId: string }; searchParams?: { page?: string };
}) {
  const requestedPage = Number(searchParams?.page ?? 1);
  const initialPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return <div className="space-y-6">
    <Link href="/categories/books" className="btn">← Categories</Link>
    <h1 className="section-title">Books</h1>
    <ClientGrid key={params.categoryId} categoryId={params.categoryId} initialPage={initialPage} />
  </div>;
}
