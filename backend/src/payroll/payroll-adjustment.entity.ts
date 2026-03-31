import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Payroll } from './payroll.entity';

@Entity('payroll_adjustments')
export class PayrollAdjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payroll_id: number;

  @ManyToOne(() => Payroll, (p) => p.adjustments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_id' })
  payroll: Payroll;

  // 項目名稱（例如：交通津貼、遲到扣款、獎金等）
  @Column()
  item_name: string;

  // 金額（正數為加項，負數為減項）
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  // 備註（可選）
  @Column({ nullable: true, type: 'text' })
  remarks: string;

  // 排序
  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
