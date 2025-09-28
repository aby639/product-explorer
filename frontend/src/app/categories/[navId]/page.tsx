'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

type Category = { id: string; title: string; slug: string };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export default function CategoriesPage() {
  const { navId } = useParams<{ navId: string }>();
  const { data, isLoading, error } = useQuery<Category[]>({
    queryKey: ['categories', navId],
    queryFn: async () => {
      const r = await fetch(`${API}/categories/${navId}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Failed to load categories');
      return r.json();
    },
  });

  return (
    <div className="space-y-6">
      <Link href="/" className="btn">← Back</Link>
      <h1 className="section-title">Categories: {navId}</h1>

      {isLoading && (
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="skeleton h-14" />
          ))}
        </ul>
      )}

      {error && <div className="opacity-80">Failed to load.</div>}

      {!!data?.length && (
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 overflow-hidden">
          {data.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03]">
              <div className="font-medium">{c.title}</div>
              <Link className="btn btn-primary" href={`/products/${c.slug}`}>Browse</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
