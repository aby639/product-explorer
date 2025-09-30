/* eslint-disable no-console */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  ENTITIES,
  Navigation,
  Category,
  Product,
} from '../src/entities';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ENTITIES,  // 👈 SAME list as App
  synchronize: true,
  logging: false,
});

async function run() {
  await ds.initialize();

  console.log('Loaded entities:', ds.entityMetadatas.map(m => m.name));
  ds.getMetadata(Product); // assert

  const navRepo  = ds.getRepository(Navigation);
  const catRepo  = ds.getRepository(Category);
  const prodRepo = ds.getRepository(Product);

  // nav
  let books = await navRepo.findOne({ where: { slug: 'books' } });
  if (!books) {
    books = navRepo.create({ slug: 'books', title: 'Books' });
    await navRepo.save(books);
  }

  // categories
  const pairs = [
    { slug: 'fiction',     title: 'Fiction' },
    { slug: 'non-fiction', title: 'Non-fiction' },
  ];
  for (const def of pairs) {
    let cat = await catRepo.findOne({ where: { slug: def.slug } });
    if (!cat) {
      cat = catRepo.create({ ...def, navigation: books });
      await catRepo.save(cat);
    }
  }

  const fiction    = await catRepo.findOneByOrFail({ slug: 'fiction' });
  const nonfiction = await catRepo.findOneByOrFail({ slug: 'non-fiction' });

  // products (real WOB URLs)
  const products: Array<Partial<Product>> = [
    {
      title: 'The Silent Patient',
      price: 6.99,
      currency: 'GBP',
      sourceUrl: 'https://www.worldofbooks.com/en-gb/products/silent-patient-book-alex-michaelides-9781250301697',
      category: fiction,
    },
    {
      title: 'Us Three',
      price: 4.99,
      currency: 'GBP',
      sourceUrl: 'https://www.worldofbooks.com/en-gb/products/us-three-book-ruth-jones-9781784162238',
      category: fiction,
    },
    {
      title: 'Atomic Habits',
      price: 7.99,
      currency: 'GBP',
      sourceUrl: 'https://www.worldofbooks.com/en-gb/products/atomic-habits-an-easy-proven-way-to-build-good-habits-and-break-bad-ones-book-9780593189641',
      category: nonfiction,
    },
    {
      title: 'Sapiens',
      price: 8.99,
      currency: 'GBP',
      sourceUrl: 'https://www.worldofbooks.com/en-gb/products/sapiens-book-yuval-noah-harari-9781784873646',
      category: nonfiction,
    },
    {
      title: 'Educated',
      price: 5.99,
      currency: 'GBP',
      sourceUrl: 'https://www.worldofbooks.com/en-gb/products/educated-book-tara-westover-9781786330512',
      category: nonfiction,
    },
  ];

  // upsert by (title, category)
  for (const p of products) {
    const existing = await prodRepo.findOne({
      where: { title: p.title!, category: { id: p.category!.id } },
      relations: { category: true },
    });

    if (!existing) {
      await prodRepo.save(prodRepo.create(p));
    } else {
      existing.sourceUrl = p.sourceUrl!;
      existing.price     = p.price!;
      existing.currency  = p.currency!;
      await prodRepo.save(existing);
    }
  }

  console.log('Seeded! Go /categories/books → category → product → Force refresh');
  await ds.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
