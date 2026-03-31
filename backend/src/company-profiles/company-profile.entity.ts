import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string; // DCL, DTC, DDL, DTL, MCL, CNL

  @Column()
  chinese_name: string;

  @Column({ nullable: true })
  english_name: string;

  @Column({ nullable: true })
  registration_date: string; // 註冊日期

  @Column({ nullable: true })
  br_number: string; // 商業登記證號碼

  @Column({ nullable: true })
  br_expiry_date: string; // 商業登記屆滿日

  @Column({ nullable: true })
  cr_number: string; // 公司註冊證明編號

  @Column({ nullable: true, type: 'text' })
  registered_address: string; // 公司註冊地址

  @Column({ nullable: true, type: 'text' })
  directors: string; // 董事

  @Column({ nullable: true, type: 'text' })
  shareholders: string; // 股東

  @Column({ nullable: true })
  secretary: string; // 秘書

  @Column({ nullable: true })
  subcontractor_reg_no: string; // 分包商註冊編號

  @Column({ nullable: true })
  subcontractor_reg_date: string; // 分包商註冊日期

  @Column({ nullable: true })
  subcontractor_reg_expiry: string; // 分包商註冊到期日

  @Column({ nullable: true, type: 'text' })
  subcontractor_work_types: string; // 分包商工種

  @Column({ nullable: true, type: 'text' })
  subcontractor_specialties: string; // 分包商專長項目

  @Column({ nullable: true })
  office_phone: string; // 辦事處電話

  @Column({ nullable: true })
  office_fax: string; // 辦事處傳真

  @Column({ nullable: true })
  office_email: string; // 辦事處電郵

  @Column({ nullable: true, type: 'text' })
  office_address: string; // 辦事處地址

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
