import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('project_sequences')
@Unique(['prefix', 'year'])
export class ProjectSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prefix: string; // 公司代碼，如 DCL, DTC

  @Column()
  year: string; // 年份，如 2026

  @Column({ type: 'int', default: 0 })
  last_seq: number;
}
