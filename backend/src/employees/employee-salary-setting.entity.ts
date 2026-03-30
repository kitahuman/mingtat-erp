import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Employee } from './employee.entity';

@Entity('employee_salary_settings')
export class EmployeeSalarySetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @ManyToOne(() => Employee, (e) => e.salary_settings)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'date' })
  effective_date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  base_salary: number;

  @Column({ default: 'daily' })
  salary_type: string; // daily, monthly

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_night: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_rent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_3runway: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_rate_standard: number;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
