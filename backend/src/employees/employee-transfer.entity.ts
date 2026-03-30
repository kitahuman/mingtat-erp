import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Employee } from './employee.entity';
import { Company } from '../companies/company.entity';

@Entity('employee_transfers')
export class EmployeeTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @ManyToOne(() => Employee, (e) => e.transfers)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

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
