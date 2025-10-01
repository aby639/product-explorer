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

  // DECIMAL in DB, number in JS; must be nullable so we can clear on "Unavailable"
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

  // keep simple varchar; nullable is fine
  @Column({ type: 'varchar', length: 8, nullable: true })
  currency?: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl?: string | null;

  @ManyToOne(() => Category, (c) => c.products, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @Index('idx_product_category')
  category!: Category;

  @OneToOne(() => ProductDetail, (d) => d.product, { cascade: true })
  detail?: ProductDetail | null;

  @OneToMany(() => Review, (r) => r.product, { cascade: true })
  reviews!: Review[];
}
