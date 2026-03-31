import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Quotation } from './quotation.entity';

@Entity('quotation_items')
export class QuotationItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  quotation_id: number;

  @ManyToOne(() => Quotation, (q) => q.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ type: 'int', default: 1 })
  sort_order: number; // 編號/排序

  @Column({ nullable: true })
  item_name: string; // 項目名稱（短文字）

  @Column({ nullable: true, type: 'text' })
  item_description: string; // 項目描述（長文字）

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  quantity: number; // 數量

  @Column({ nullable: true })
  unit: string; // 單位

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unit_price: number; // 單價

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number; // 金額 = 數量 x 單價

  @Column({ nullable: true, type: 'text' })
  remarks: string;
}
