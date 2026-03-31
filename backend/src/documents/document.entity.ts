import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  // Polymorphic relation: entity_type + entity_id
  @Column()
  entity_type: string; // 'employee', 'vehicle', 'machinery'

  @Column({ type: 'int' })
  entity_id: number;

  @Column()
  doc_type: string; // 文件類型：牌簿, 行車證, 保險單, 身份證, 平安卡, 驗機紙 等

  @Column()
  file_name: string; // 原始檔名

  @Column()
  file_path: string; // 儲存路徑

  @Column({ nullable: true })
  file_size: number; // bytes

  @Column({ nullable: true })
  mime_type: string;

  @Column({ nullable: true, type: 'date' })
  expiry_date: string; // 到期日（可選）

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: 'active' })
  status: string; // active, archived

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
