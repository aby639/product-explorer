import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('view_history')
export class ViewHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column('text') sessionId!: string;

  // e.g., "/product/123", "/categories/books"
  @Column('jsonb') pathJson!: string[];

  @CreateDateColumn() createdAt!: Date;
}
