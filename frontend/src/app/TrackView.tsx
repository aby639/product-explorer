'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

function makeSid(): string {
  // Prefer Web Crypto if available
  const wc = (typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined) as
    | Crypto
    | undefined;

  if (wc?.randomUUID) return wc.randomUUID();

  // RFC4122 v4 via getRandomValues (available even when randomUUID isn't)
  if (wc?.getRandomValues) {
    const b = new Uint8Array(16);
    wc.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Last-ditch non-crypto fallback (dev only)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export default function TrackView() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const path = pathname ?? '/';
    if (lastSent.current === path) return;

    let sid = window.localStorage.getItem('sid');
    if (!sid) {
      sid = makeSid();
      window.localStorage.setItem('sid', sid);
    }

    lastSent.current = path;

    fetch(`${API}/views`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, path }),
      keepalive: true, // avoids drop on fast nav/unload
    }).catch(() => {});
  }, [pathname]);

  return null;
}
