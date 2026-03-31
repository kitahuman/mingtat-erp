import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';
import { QuotationItem } from './quotation-item.entity';

@Entity('quotations')
export class Quotation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  quotation_no: string; // 自動生成的報價單編號

  @Column({ type: 'int' })
  company_id: number; // 開立公司

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'int', nullable: true })
  client_id: number; // 客戶（合作單位）

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ type: 'date' })
  quotation_date: string;

  @Column({ nullable: true })
  project_name: string; // 工程名稱

  @Column({ nullable: true })
  project_no: string; // 工程編號

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_amount: number; // 總金額

  @Column({ default: 'draft' })
  status: string; // draft, sent, accepted, rejected

  @Column({ nullable: true, type: 'text' })
  validity_period: string; // 有效期

  @Column({ nullable: true, type: 'text' })
  payment_terms: string; // 付款條件

  @Column({ nullable: true, type: 'text' })
  exclusions: string; // 除外責任

  @Column({ nullable: true, type: 'text' })
  remarks: string; // 其他備註

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => QuotationItem, (item) => item.quotation, { cascade: true })
  items: QuotationItem[];
}
