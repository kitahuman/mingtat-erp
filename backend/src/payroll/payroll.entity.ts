import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';
import { PayrollItem } from './payroll-item.entity';
import { PayrollWorkLog } from './payroll-work-log.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';

@Entity('payrolls')
export class Payroll {
  @PrimaryGeneratedColumn()
  id: number;

  // 計糧月份 (YYYY-MM) - kept for backward compat
  @Column()
  period: string;

  // 計糧日期範圍
  @Column({ nullable: true, type: 'date' })
  date_from: string;

  @Column({ nullable: true, type: 'date' })
  date_to: string;

  @Column({ type: 'int' })
  employee_id: number;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'int', nullable: true })
  company_profile_id: number;

  @ManyToOne(() => CompanyProfile, { nullable: true })
  @JoinColumn({ name: 'company_profile_id' })
  company_profile: CompanyProfile;

  // 薪資類型
  @Column({ default: 'daily' })
  salary_type: string; // daily | monthly

  // 底薪單價
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  base_rate: number;

  // 工作天數
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  work_days: number;

  // 底薪金額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  base_amount: number;

  // 津貼總額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  allowance_total: number;

  // OT 總額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ot_total: number;

  // 分傭總額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  commission_total: number;

  // 強積金扣除
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  mpf_deduction: number;

  // 強積金計劃
  @Column({ nullable: true })
  mpf_plan: string;

  // 僱主強積金供款
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  mpf_employer: number;

  // 自定義調整總額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  adjustment_total: number;

  // 淨額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  net_amount: number;

  // 狀態
  @Column({ default: 'draft' })
  status: string; // draft | confirmed | paid

  // 付款資訊
  @Column({ nullable: true, type: 'date' })
  payment_date: string;

  @Column({ nullable: true })
  cheque_number: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => PayrollItem, (item) => item.payroll, { cascade: true })
  items: PayrollItem[];

  @OneToMany(() => PayrollWorkLog, (pwl) => pwl.payroll, { cascade: true })
  payroll_work_logs: PayrollWorkLog[];

  @OneToMany(() => PayrollAdjustment, (adj) => adj.payroll, { cascade: true })
  adjustments: PayrollAdjustment[];
}
