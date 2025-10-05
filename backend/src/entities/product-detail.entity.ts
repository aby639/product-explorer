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

  // Average rating out of 5 (nullable if the site doesn't expose it)
  @Column({ type: 'float', nullable: true })
  ratingAverage?: number | null;

  // Flexible JSON bag for extras
  // We'll mirror reviewsCount and other probes here to avoid schema changes.
  @Column({ type: 'jsonb', nullable: true, default: () => `'{}'::jsonb` })
  specs?: Record<string, any> | null;

  // Explicit column name + timestamptz so it persists/reads reliably
  @Column({ name: 'last_scraped_at', type: 'timestamptz', nullable: true })
  lastScrapedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
