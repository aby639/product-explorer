import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL!;

type Product = {
  id: string;
  title: string;
  image?: string | null;
  price?: number | null;
  currency?: string | null;
  sourceUrl?: string | null; // <-- used for the external link
  category?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  detail?: {
    description?: string | null;
    lastScrapedAt?: string | null;
    ratingAverage?: number | null;
    specs?: unknown;
  } | null;
};

async function getProduct(id: string, force = false) {
  const url = `${API}/products/${id}${force ? "?refresh=true" : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Product;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { refresh?: string };
}) {
  const id = params.id;
  const force = String(searchParams?.refresh || "").toLowerCase() === "true";
  const product = await getProduct(id, force);

  if (!product) {
    return (
      <main className="container-xl py-8 space-y-6">
        <Link href="/" className="btn">
          ← Back
        </Link>
        <div className="card p-6">
          <div className="text-lg font-semibold">
            Couldn’t load this product right now.
          </div>
          <p className="opacity-70 mt-1">
            Please try again in a moment or go back and pick another one.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={`/product/${id}?refresh=true`} className="btn">
              Try refresh
            </Link>
            <Link href="/categories/books" className="btn btn-ghost">
              Browse categories
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const money =
    product.price != null && product.currency
      ? new Intl.NumberFormat(
          product.currency === "GBP"
            ? "en-GB"
            : product.currency === "EUR"
            ? "de-DE"
            : "en-US",
          { style: "currency", currency: product.currency }
        ).format(product.price)
      : null;

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href="/" className="btn">
        ← Back
      </Link>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="card p-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image || "/placeholder.png"}
            alt={product.title || "Book cover"}
            className="max-h-[420px] object-contain"
          />
        </div>

        <div className="space-y-4">
          <h1 className="section-title">{product.title}</h1>
          {money ? (
            <div className="text-xl font-semibold">{money}</div>
          ) : (
            <div className="opacity-70">Price not available</div>
          )}

          <div className="flex gap-3">
            {product.sourceUrl && (
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                aria-label="View on World of Books (opens in a new tab)"
              >
                View on World of Books
              </a>
            )}

            <Link
              href={`/product/${product.id}?refresh=true`}
              className="btn btn-ghost"
            >
              Force refresh
            </Link>
          </div>

          {product?.detail?.description && (
            <div className="card p-4">
              <div className="text-xs uppercase opacity-70 mb-2">
                Scraped description
              </div>
              <div className="whitespace-pre-line leading-relaxed">
                {product.detail.description}
              </div>
              {product.detail.lastScrapedAt && (
                <div className="mt-2 text-xs opacity-60">
                  Last scraped:{" "}
                  {new Date(product.detail.lastScrapedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
