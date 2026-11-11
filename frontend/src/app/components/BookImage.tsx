'use client';
import { useState } from 'react';
import { webUrl } from '../../lib/products';

export default function BookImage({ src, title, className }: {
  src?: string | null; title: string; className: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = webUrl(src);
  if (!source || failedSource === source) return (
    <div role="img" aria-label={`No cover available for ${title}`}
      className={`${className} flex items-center justify-center p-4 text-center text-sm text-slate-400`}>
      No cover available
    </div>
  );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt={title} loading="lazy" className={className}
    onError={() => setFailedSource(source)} />;
}
