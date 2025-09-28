import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { Navigation } from './navigation.entity';
import { Product } from './product.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Navigation, (n) => n.categories, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'navigation_id' })
  navigation!: Navigation;

  @Column({ length: 180 })
  title!: string;

  @Column({ length: 180, unique: true })
  slug!: string;

  @OneToMany(() => Product, (p) => p.category)
  products!: Product[];
}
