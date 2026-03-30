import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from '../companies/company.entity';
import { EmployeeSalarySetting } from './employee-salary-setting.entity';
import { EmployeeTransfer } from './employee-transfer.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  emp_code: string;

  @Column()
  name_zh: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ type: 'varchar', default: 'worker' })
  role: string; // driver, operator, worker, admin

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  emergency_contact: string;

  @Column({ nullable: true, type: 'date' })
  join_date: string;

  @Column({ nullable: true })
  bank_account: string;

  // 證照
  @Column({ nullable: true })
  green_card_no: string; // 平安卡號碼

  @Column({ nullable: true, type: 'date' })
  green_card_expiry: string;

  @Column({ nullable: true })
  construction_card_no: string; // 工卡號碼

  @Column({ nullable: true, type: 'date' })
  construction_card_expiry: string;

  @Column({ nullable: true })
  driving_license_no: string;

  @Column({ nullable: true, type: 'date' })
  driving_license_expiry: string;

  @Column({ nullable: true })
  driving_license_class: string;

  @Column({ type: 'int' })
  company_id: number;

  @ManyToOne(() => Company, (c) => c.employees)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ default: 'active' })
  status: string; // active, inactive

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => EmployeeSalarySetting, (s) => s.employee)
  salary_settings: EmployeeSalarySetting[];

  @OneToMany(() => EmployeeTransfer, (t) => t.employee)
  transfers: EmployeeTransfer[];
}
