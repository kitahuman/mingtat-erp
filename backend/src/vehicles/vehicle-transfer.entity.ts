import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { Company } from '../companies/company.entity';

@Entity('vehicle_transfers')
export class VehicleTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vehicle_id: number;

  @ManyToOne(() => Vehicle, (v) => v.transfers)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ type: 'int' })
  from_company_id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'from_company_id' })
  from_company: Company;

  @Column({ type: 'int' })
  to_company_id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'to_company_id' })
  to_company: Company;

  @Column({ type: 'date' })
  transfer_date: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
