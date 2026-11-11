import Link from 'next/link';
import HeroShowcase from './components/HeroShowcase';

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <h1 className="section-title text-4xl">Product Explorer</h1>
          <p className="max-w-xl opacity-80 leading-relaxed">
            Browse fiction and non-fiction books from <span className="font-medium">World of Books</span>.
            Open a book to see its saved details or check the source for an update.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/categories/books" className="btn btn-primary">Browse books →</Link>
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
            <p className="opacity-70 text-sm mt-1">Browse books by category.</p>
          </li>
          <li className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="badge mb-2">Details</div>
            <div className="font-medium">Prices and descriptions</div>
            <p className="opacity-70 text-sm mt-1">See what was available at the last check.</p>
          </li>
          <li className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="badge mb-2">Refresh</div>
            <div className="font-medium">Check for updates</div>
            <p className="opacity-70 text-sm mt-1">Request new details from the source page.</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
