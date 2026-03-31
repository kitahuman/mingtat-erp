import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  project_no: string; // 自動生成：{公司代碼}-{年份}-P{序號}

  @Column()
  project_name: string;

  @Column({ type: 'int' })
  company_id: number; // 開立公司

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'int', nullable: true })
  client_id: number; // 客戶

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ default: 'quoting' })
  status: string; // quoting（報價中）, in_progress（進行中）, completed（已完成）, cancelled（已取消）

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true })
  address: string; // 工程地址

  @Column({ nullable: true, type: 'date' })
  start_date: string; // 預計開始日期

  @Column({ nullable: true, type: 'date' })
  end_date: string; // 預計結束日期

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
