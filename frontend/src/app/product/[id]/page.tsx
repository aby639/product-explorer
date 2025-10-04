import Link from 'next/link';
import { headers } from 'next/headers';
import ProductClient from './ProductClient';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Build a safe back link using the request's Referer header
  const hdrs = headers();
  const referer = hdrs.get('referer');
  const host = hdrs.get('host');
  let backHref = '/';
  if (referer && host) {
    try {
      const u = new URL(referer);
      if (u.host === host) backHref = u.pathname + u.search;
    } catch {}
  }

  return <ProductClient id={id} backHref={backHref} />;
}
