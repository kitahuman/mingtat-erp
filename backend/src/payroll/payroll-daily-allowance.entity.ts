import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Payroll } from './payroll.entity';

@Entity('payroll_daily_allowances')
export class PayrollDailyAllowance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payroll_id: number;

  @ManyToOne(() => Payroll, (p) => p.daily_allowances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_id' })
  payroll: Payroll;

  // 日期
  @Column({ type: 'date' })
  date: string;

  // 津貼類型 key（例如 allowance_rent, allowance_night, custom:xxx）
  @Column()
  allowance_key: string;

  // 津貼名稱（顯示用）
  @Column()
  allowance_name: string;

  // 津貼金額
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
