import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

type TargetType = 'nav' | 'category' | 'product';
type JobStatus = 'queued' | 'running' | 'done' | 'error';

@Entity('scrape_job')
export class ScrapeJob {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column('text') target!: string;       // a slug or URL
  @Column('text') targetType!: TargetType;
  @Column('text', { default: 'queued' }) status!: JobStatus;
  @Column('text', { nullable: true }) errorLog!: string | null;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
