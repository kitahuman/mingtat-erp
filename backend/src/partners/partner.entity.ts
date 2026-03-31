import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  code: string; // 代碼/簡稱，例如「金門」「榮興」「南星」

  @Column({ nullable: true })
  english_code: string; // 英文代碼，用於發票編號，例如 G=金門, WH=榮興

  @Column()
  name: string; // 公司/個人名稱

  @Column({ nullable: true })
  name_en: string; // 英文名稱

  @Column()
  partner_type: string; // 'client' 客戶, 'supplier' 供應商, 'subcontractor' 判頭, 'street_vehicle_owner' 街車車主

  @Column({ nullable: true })
  category: string; // 細分類別：建築公司, 保險公司, 維修廠, 油站 等

  @Column({ nullable: true })
  contact_person: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  mobile: string; // 手提電話

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  fax: string; // 傳真

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true })
  bank_name: string; // 銀行名

  @Column({ nullable: true })
  bank_account: string; // 銀行賬戶

  @Column({ nullable: true })
  invoice_title: string; // 發票標題

  @Column({ nullable: true, type: 'text' })
  invoice_description: string; // 發票描述

  @Column({ nullable: true, type: 'text' })
  quotation_remarks: string; // 報價備註

  @Column({ nullable: true, type: 'text' })
  invoice_remarks: string; // 發票備註

  @Column({ default: false })
  is_subsidiary: boolean; // 是否旗下公司

  @Column({ type: 'simple-array', nullable: true })
  subsidiaries: string[]; // 旗下公司: DCL, DTC, DDL, DTL, MCL, 卓嵐

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
