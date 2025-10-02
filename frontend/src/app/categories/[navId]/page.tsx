import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL!;

type Category = { id: string; title: string; slug: string };

async function getData(navId: string) {
  const res = await fetch(`${API}/categories/${navId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load categories");
  return (await res.json()) as Category[];
}

export default async function Page({ params }: { params: { navId: string } }) {
  const cats = await getData(params.navId);

  return (
    <main className="container-xl py-8 space-y-6">
      <Link href="/" className="btn">← Back</Link>
      <h1 className="section-title">Categories: {params.navId}</h1>
      <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-4">
            <div>{c.title}</div>
            <Link href={`/products/${c.slug}?page=1&limit=12`} className="btn">
              Browse
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
