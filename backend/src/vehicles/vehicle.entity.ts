import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from '../companies/company.entity';
import { VehiclePlateHistory } from './vehicle-plate-history.entity';
import { VehicleTransfer } from './vehicle-transfer.entity';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plate_number: string;

  @Column({ nullable: true })
  vehicle_type: string;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  tonnage: number;

  @Column({ type: 'int' })
  owner_company_id: number;

  @ManyToOne(() => Company, (c) => c.vehicles)
  @JoinColumn({ name: 'owner_company_id' })
  owner_company: Company;

  @Column({ nullable: true, type: 'date' })
  insurance_expiry: string; // 保險到期日

  @Column({ nullable: true, type: 'date' })
  permit_fee_expiry: string; // 牌費到期日

  @Column({ nullable: true, type: 'date' })
  inspection_date: string; // 驗車到期日

  @Column({ nullable: true, type: 'date' })
  license_expiry: string; // 行車證到期日

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => VehiclePlateHistory, (h) => h.vehicle)
  plate_history: VehiclePlateHistory[];

  @OneToMany(() => VehicleTransfer, (t) => t.vehicle)
  transfers: VehicleTransfer[];
}
