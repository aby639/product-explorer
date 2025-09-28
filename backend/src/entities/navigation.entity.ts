import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';

@Entity()
export class Navigation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ length: 120, unique: true })
  slug!: string;

  @OneToMany(() => Category, (c) => c.navigation, { cascade: false })
  categories!: Category[];
}
