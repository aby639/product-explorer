import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('view_history')
export class ViewHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  sessionId!: string;

  // e.g. ["/", "/categories/books", "/products/fiction"]
  @Column('jsonb')
  pathJson!: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
