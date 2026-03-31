import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Partner } from '../partners/partner.entity';

@Entity('fleet_rate_cards')
export class FleetRateCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  client_id: number; // 客戶

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ nullable: true })
  contract_no: string; // 合約

  @Column({ nullable: true })
  vehicle_tonnage: string; // 車輛噸數

  @Column({ nullable: true })
  vehicle_type: string; // 車輛類型

  @Column({ nullable: true })
  origin: string; // 起點

  @Column({ nullable: true })
  destination: string; // 終點

  // 日間分傭
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  day_rate: number;

  // 夜間分傭
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  night_rate: number;

  // 中直分傭
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  mid_shift_rate: number;

  // OT 分傭
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ot_rate: number;

  @Column({ nullable: true })
  unit: string; // 車/噸/天/晚/小時

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
