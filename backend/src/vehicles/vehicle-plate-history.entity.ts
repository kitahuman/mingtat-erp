import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';

@Entity('vehicle_plate_history')
export class VehiclePlateHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vehicle_id: number;

  @ManyToOne(() => Vehicle, (v) => v.plate_history)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column()
  old_plate: string;

  @Column()
  new_plate: string;

  @Column({ type: 'date' })
  change_date: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
