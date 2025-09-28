'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const fetcher = (url: string) => fetch(url).then(r => r.json());

type Product = { id?: string; title: string; image?: string | null };

// Fallback covers from WoB CDN — only used if API returns too few
const FALLBACKS: Product[] = [
  { title: 'The Midnight Library', image: 'https://images.worldofbooks.com/m/3551232.jpg' },
  { title: 'Normal People',        image: 'https://images.worldofbooks.com/m/3575201.jpg' },
  { title: 'Then She Was Gone',    image: 'https://images.worldofbooks.com/m/3582681.jpg' },
  { title: 'Evelyn Hugo',          image: 'https://images.worldofbooks.com/m/3550035.jpg' },
  { title: 'Before the Coffee…',   image: 'https://images.worldofbooks.com/m/3869133.jpg' },
];

function uniqBy<T>(arr: T[], key: (x: T) => string) {
  const m = new Map<string, T>();
  for (const it of arr) {
    const k = key(it);
    if (!m.has(k)) m.set(k, it);
  }
  return [...m.values()];
}

export default function HeroShowcase() {
  // Pull a handful from both categories
  const { data: f } = useSWR(`${API}/products?category=fiction&limit=8`, fetcher);
  const { data: n } = useSWR(`${API}/products?category=non-fiction&limit=8`, fetcher);

  const fromApi: Product[] = useMemo(() => {
    const a: Product[] = [
      ...(f?.items ?? []),
      ...(n?.items ?? []),
    ].map((p: any) => ({ id: p.id, title: p.title, image: p.image }));

    // de-dupe by title, cap to 8
    return uniqBy(a, x => (x.title ?? '').toLowerCase()).slice(0, 8);
  }, [f, n]);

  const covers: Product[] = (fromApi.length >= 5 ? fromApi : [...fromApi, ...FALLBACKS]).slice(0, 8);

  return (
    <div className="card p-6">
      {/* Cover rail */}
      <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-white/10">
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-1 py-2 mask-fade-x">
          {covers.map((c, i) => (
            <div
              key={(c.id ?? c.title) + i}
              className="snap-start shrink-0 w-44 h-64 rounded-xl bg-slate-950/40 ring-1 ring-white/10 overflow-hidden flex items-center justify-center"
              title={c.title}
            >
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.image}
                  alt={c.title}
                  loading="lazy"
                  className="h-full w-full object-contain transition-transform duration-300 hover:scale-[1.02]"
                />
              ) : (
                <div className="h-full w-full bg-white/5" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: CTA + quick facts */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/categories/books"
          className="tile p-4 border-emerald-400/20 bg-emerald-400/10 hover:bg-emerald-400/15"
        >
          <div className="text-xs uppercase tracking-wide opacity-70">Jump in</div>
          <div className="mt-1 font-semibold">Discover bestsellers →</div>
          <div className="mt-1 text-sm opacity-80">
            Browse fiction & non-fiction with prices and live details.
          </div>
        </Link>

        <div className="tile p-4">
          <div className="text-xs uppercase tracking-wide opacity-70">Fresh scrape</div>
          <div className="mt-1 font-semibold">Up-to-date details</div>
          <div className="mt-1 text-sm opacity-80">
            Force refresh any product to pull the newest info.
          </div>
        </div>

        <div className="tile p-4">
          <div className="text-xs uppercase tracking-wide opacity-70">Nice & polite</div>
          <div className="mt-1 font-semibold">Short-term caching</div>
          <div className="mt-1 text-sm opacity-80">
            We keep load light on the source while you browse.
          </div>
        </div>
      </div>
    </div>
  );
}
