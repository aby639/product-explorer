// backend/src/entities/product.entity.ts
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { Category } from './category.entity';
import { ProductDetail } from './product-detail.entity';
import { Review } from './review.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 240 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  image?: string | null;

  // Store as DECIMAL in PG, expose as number in JS
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v?: number | null) => v,
      from: (v: any) => (v == null ? null : Number(v)),
    },
  })
  price?: number | null;

  // ✅ use a concrete text type (varchar) — NOT Object
  @Column({ type: 'varchar', length: 8, nullable: true })
  currency?: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl?: string | null;

  // ----- relations -----

  @ManyToOne(() => Category, (c) => c.products, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @Index('idx_product_category')
  category!: Category;

  // inverse side lives on ProductDetail with @JoinColumn there
  @OneToOne(() => ProductDetail, (d) => d.product, { cascade: true })
  detail?: ProductDetail | null;

  @OneToMany(() => Review, (r) => r.product, { cascade: true })
  reviews!: Review[];
}
