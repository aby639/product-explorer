// frontend/src/app/products/page.tsx
import { redirect } from 'next/navigation';

export default function ProductsIndex() {
  // Send users somewhere sensible (top-level categories)
  redirect('/categories/books');
}
