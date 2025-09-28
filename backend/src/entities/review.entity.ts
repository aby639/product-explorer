import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  text?: string | null;

  @ManyToOne(() => Product, (p) => p.reviews, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;
}
