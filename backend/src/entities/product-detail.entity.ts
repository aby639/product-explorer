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

  @Column({ type: 'float', nullable: true })
  ratingAverage?: number | null;

  // Flexible JSON bag for extras (recommendations, specs, probes, etc.)
  @Column({ type: 'jsonb', nullable: true, default: () => `'{}'::jsonb` })
  specs?: Record<string, any> | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastScrapedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
