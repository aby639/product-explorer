import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('view_history')
export class ViewHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // anonymous/browser session id (from cookie/localStorage the client sends)
  @Column('text')
  sessionId!: string;

  // e.g. ["/categories/books","/products/fiction","/product/abc-uuid"]
  @Column('jsonb')
  pathJson!: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
