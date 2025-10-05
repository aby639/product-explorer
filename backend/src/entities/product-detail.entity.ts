import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class ProductDetail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Product, (p) => p.detail, { onDelete: 'CASCADE' })
  @JoinColumn()
  product!: Product;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  // Average rating out of 5 (if available)
  @Column({ type: 'float', nullable: true })
  ratingAverage?: number | null;

  /**
   * Flexible JSON bag for extras:
   * - reviewCount: number
   * - lastStatus: number | null
   * - unavailable: boolean
   * - priceProbes: string[]
   * - lastScrapedAtISO: string (ISO)
   * - sourceUrl: string | null
   * …and anything else you want to store.
   */
  @Column({ type: 'jsonb', nullable: true, default: () => `'{}'::jsonb` })
  specs?: Record<string, any> | null;

  // explicit column name + timestamptz ensures reliable read/write
  @Column({ name: 'last_scraped_at', type: 'timestamptz', nullable: true })
  lastScrapedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
