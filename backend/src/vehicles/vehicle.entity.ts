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
  vehicle_type: string; // 泥頭車, 夾車, 勾斗車, 吊車, 拖架, 拖頭, 輕型貨車, 領航車

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  tonnage: number;

  @Column({ type: 'int' })
  owner_company_id: number;

  @ManyToOne(() => Company, (c) => c.vehicles)
  @JoinColumn({ name: 'owner_company_id' })
  owner_company: Company;

  @Column({ nullable: true, type: 'date' })
  insurance_expiry: string;

  @Column({ nullable: true, type: 'date' })
  inspection_date: string;

  @Column({ nullable: true, type: 'date' })
  license_expiry: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ default: 'active' })
  status: string; // active, inactive, maintenance

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
