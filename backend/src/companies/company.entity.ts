import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EmployeeTransfer } from '../employees/employee-transfer.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ type: 'varchar', default: 'internal' })
  company_type: string; // internal, client, subcontractor

  @Column({ nullable: true, unique: true })
  internal_prefix: string; // DCL, DTC, CNL, MCL, DTL

  @Column({ nullable: true })
  contact_person: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: 'active' })
  status: string; // active, inactive

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Employee, (e) => e.company)
  employees: Employee[];

  @OneToMany(() => Vehicle, (v) => v.owner_company)
  vehicles: Vehicle[];

  @OneToMany(() => Machinery, (m) => m.owner_company)
  machinery: Machinery[];
}
