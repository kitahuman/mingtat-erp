import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // 公司/個人名稱

  @Column({ nullable: true })
  name_en: string;

  @Column()
  partner_type: string; // 'client' 客戶, 'supplier' 供應商, 'subcontractor' 判頭, 'street_vehicle_owner' 街車車主

  @Column({ nullable: true })
  category: string; // 細分類別：建築公司, 保險公司, 維修廠, 油站 等

  @Column({ nullable: true })
  contact_person: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  fax: string;

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
