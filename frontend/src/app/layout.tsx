import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import Providers from './providers';
import TrackView from './TrackView';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Product Explorer',
  icons: { icon: '/pe-logo.svg' }, // favicon
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Background: gradient + faint grid */}
        <div className="fixed inset-0 -z-20 bg-canvas" />
        <div className="fixed inset-0 -z-10 pointer-events-none opacity-[0.06] bg-grid" />

        <Providers>
          <header className="sticky top-0 z-20 border-b border-white/10 backdrop-blur supports-[backdrop-filter]:bg-black/30">
            <div className="container-xl flex flex-wrap items-center justify-between gap-2 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight no-underline">
                <img src="/pe-logo.svg" alt="" className="h-6 w-6 rounded-xl ring-1 ring-emerald-400/30" />
                <span className="hover:opacity-90">Product Explorer</span>
              </Link>
              <nav aria-label="Main navigation" className="flex items-center gap-2 text-sm">
                <Link className="btn btn-ghost" href="/categories/books">Books</Link>
                <Link className="btn btn-ghost" href="/about">About</Link>
              </nav>
            </div>
          </header>

          <main className="container-xl py-8">{children}</main>

          <footer className="mt-16 border-t border-white/10">
            <div className="container-xl py-8 text-xs opacity-70">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>© {new Date().getFullYear()} Product Explorer</div>
                <a href="https://github.com/aby639/product-explorer">Source code</a>
              </div>
            </div>
          </footer>

          <TrackView />
        </Providers>
      </body>
    </html>
  );
}
