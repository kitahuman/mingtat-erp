import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('field_options')
export class FieldOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  category: string; // machine_type, tonnage, wage_unit, service_type, day_night

  @Column()
  label: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
