import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Partner } from '../partners/partner.entity';

@Entity('subcon_rate_cards')
export class SubconRateCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  subcon_id: number; // 街車公司/司機（合作單位）

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'subcon_id' })
  subcontractor: Partner;

  @Column({ nullable: true })
  plate_no: string; // 車牌

  @Column({ nullable: true })
  vehicle_tonnage: string; // 噸數/類別

  @Column({ type: 'int', nullable: true })
  client_id: number; // 客戶

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ nullable: true })
  contract_no: string; // 合約

  @Column({ nullable: true })
  day_night: string; // 日/夜

  @Column({ nullable: true })
  origin: string; // 起點

  @Column({ nullable: true })
  destination: string; // 終點

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unit_price: number; // 單價

  @Column({ nullable: true })
  unit: string; // 天/晚/車/噸/小時

  @Column({ default: false })
  exclude_fuel: boolean; // 不包油

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
