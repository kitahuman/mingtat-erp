import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('custom_fields')
export class CustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  module: string; // 'company', 'partner', 'vehicle', 'machinery', 'employee'

  @Column()
  field_name: string; // 用戶自定義欄位名稱

  @Column()
  field_type: string; // 'text', 'number', 'date', 'boolean', 'select', 'textarea'

  @Column({ type: 'text', nullable: true })
  options: string; // JSON string, 用於 select 類型的選項列表

  @Column({ default: false })
  is_required: boolean;

  @Column({ default: false })
  has_expiry_alert: boolean; // 只有 date 類型可用，啟用後會在 Dashboard 顯示到期提醒

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
