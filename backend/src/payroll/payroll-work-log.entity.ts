import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Payroll } from './payroll.entity';
import { WorkLog } from '../work-logs/work-log.entity';

@Entity('payroll_work_logs')
export class PayrollWorkLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payroll_id: number;

  @ManyToOne(() => Payroll, (p) => p.payroll_work_logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_id' })
  payroll: Payroll;

  @Column({ type: 'int' })
  work_log_id: number;

  @ManyToOne(() => WorkLog, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'work_log_id' })
  work_log: WorkLog;

  // ── 快照欄位（從 work_log 複製，支持「只改糧單記錄」）──
  @Column({ nullable: true })
  service_type: string;

  @Column({ type: 'date', nullable: true })
  scheduled_date: string;

  @Column({ nullable: true })
  day_night: string;

  @Column({ nullable: true, type: 'text' })
  start_location: string;

  @Column({ nullable: true, type: 'text' })
  end_location: string;

  @Column({ nullable: true })
  machine_type: string;

  @Column({ nullable: true })
  tonnage: string;

  @Column({ nullable: true })
  equipment_number: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  quantity: number;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ot_quantity: number;

  @Column({ nullable: true })
  ot_unit: string;

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  // ── 價格匹配資訊 ──
  @Column({ type: 'int', nullable: true })
  matched_rate_card_id: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  matched_rate: number;

  @Column({ nullable: true })
  matched_unit: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  matched_ot_rate: number;

  @Column({ nullable: true })
  price_match_status: string; // matched | unmatched | pending

  @Column({ nullable: true, type: 'text' })
  price_match_note: string;

  // ── 計算金額 ──
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  line_amount: number; // 該筆記錄的價錢金額

  // ── 歸組鍵（用於歸組結算）──
  @Column({ nullable: true, type: 'text' })
  group_key: string;

  // ── 關聯資訊快照 ──
  @Column({ type: 'int', nullable: true })
  client_id: number;

  @Column({ nullable: true })
  client_name: string;

  @Column({ type: 'int', nullable: true })
  company_profile_id: number;

  @Column({ nullable: true })
  company_profile_name: string;

  @Column({ type: 'int', nullable: true })
  quotation_id: number;

  @Column({ nullable: true })
  contract_no: string;

  // 是否已被修改（與原始 work_log 不同）
  @Column({ default: false })
  is_modified: boolean;

  // 是否已從糧單移除（軟刪除）
  @Column({ default: false })
  is_excluded: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
