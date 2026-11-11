export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  category?: { id: string; title: string; slug?: string | null } | null;
  detail?: {
    description?: string | null;
    ratingAverage?: number | null;
    lastScrapedAt?: string | null;
    specs?: Record<string, unknown> | null;
  } | null;
};
export type GridResponse = { items: Product[]; total: number; page: number; limit: number };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(90_000), ...init });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

export function webUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://www.worldofbooks.com');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function money(value?: number | null, currency?: string | null): string | null {
  if (value == null || !Number.isFinite(value) || !currency) return null;
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value); }
  catch { return null; }
}

export function lastScraped(product: Product): string | null {
  const date = product.detail?.lastScrapedAt ?? product.detail?.specs?.lastScrapedAtISO;
  return typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null;
}
