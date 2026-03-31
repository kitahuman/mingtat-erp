import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Payroll } from './payroll.entity';

@Entity('payroll_items')
export class PayrollItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payroll_id: number;

  @ManyToOne(() => Payroll, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_id' })
  payroll: Payroll;

  // 項目類型: base_salary | allowance | ot | commission | mpf_deduction
  @Column()
  item_type: string;

  // 項目名稱 (e.g. 日薪, 夜班津貼, OT, 分傭, 強積金)
  @Column()
  item_name: string;

  // 單價
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unit_price: number;

  // 數量/天數/小時
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantity: number;

  // 金額 (正數為收入，負數為扣除)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  // 備註 (e.g. 工作日期範圍, 來源工作記錄)
  @Column({ nullable: true, type: 'text' })
  remarks: string;

  // 排序
  @Column({ type: 'int', default: 0 })
  sort_order: number;
}
