import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';
import { RateCardOtRate } from './rate-card-ot-rate.entity';

@Entity('rate_cards')
export class RateCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number; // 開票公司

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'int' })
  client_id: number; // 客戶

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ nullable: true })
  contract_no: string; // 合約編號

  @Column({ nullable: true })
  service_type: string; // 運輸/機械租賃/人工/物料/服務

  @Column({ nullable: true })
  name: string; // 名稱

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true })
  vehicle_tonnage: string; // 車輛噸數

  @Column({ nullable: true })
  vehicle_type: string; // 車輛類型

  @Column({ nullable: true })
  origin: string; // 起點

  @Column({ nullable: true })
  destination: string; // 終點

  // 日間費率
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  day_rate: number;

  @Column({ nullable: true })
  day_unit: string;

  // 夜間費率
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  night_rate: number;

  @Column({ nullable: true })
  night_unit: string;

  // 中直費率
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  mid_shift_rate: number;

  @Column({ nullable: true })
  mid_shift_unit: string;

  // OT 費率（標準）
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ot_rate: number;

  @Column({ nullable: true })
  ot_unit: string;

  @Column({ nullable: true, type: 'text' })
  remarks: string; // 備註（包油/不包油、包司機等）

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => RateCardOtRate, (ot) => ot.rate_card, { cascade: true })
  ot_rates: RateCardOtRate[];
}
