import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CustomField } from './custom-field.entity';

@Entity('custom_field_values')
export class CustomFieldValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  custom_field_id: number;

  @Column()
  entity_id: number; // 對應的記錄 ID

  @Column()
  module: string; // 跟 CustomField 一樣

  @Column({ type: 'text', nullable: true })
  value: string; // 所有值都存為 string

  @ManyToOne(() => CustomField, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'custom_field_id' })
  custom_field: CustomField;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
