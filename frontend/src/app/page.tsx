import Link from 'next/link';
import HeroShowcase from './components/HeroShowcase';

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <h1 className="section-title text-4xl">Product Explorer</h1>
          <p className="max-w-xl opacity-80 leading-relaxed">
            Browse categories and view live-scraped details from <span className="font-medium">World of Books</span>.
            Data is cached briefly so we’re polite to the source.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/categories/books" className="btn btn-primary">Explore Books →</Link>
            <Link href="/about" className="btn">About this app</Link>
          </div>
        </div>

        <HeroShowcase />
      </div>

      <div className="card p-5">
        <div className="section-head">
          <h2 className="text-xl font-semibold">What’s inside</h2>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="badge mb-2">Books</div>
            <div className="font-medium">Fiction & Non-fiction</div>
            <p className="opacity-70 text-sm mt-1">Paginated, image-rich cards with prices.</p>
          </li>
          <li className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="badge mb-2">Live scrape</div>
            <div className="font-medium">Fresh details</div>
            <p className="opacity-70 text-sm mt-1">Force refresh a product when you need updates.</p>
          </li>
          <li className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="badge mb-2">Polite</div>
            <div className="font-medium">Short-term caching</div>
            <p className="opacity-70 text-sm mt-1">Limits hammering the source site.</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
