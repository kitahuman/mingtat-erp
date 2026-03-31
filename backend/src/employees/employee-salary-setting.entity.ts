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

  // 基本津貼
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_night: number; // 晚間津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_rent: number; // 租車津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_3runway: number; // 3跑津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_rate_standard: number; // 標準OT時薪

  // 新增津貼欄位
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_well: number; // 落井津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_machine: number; // 揸機津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_roller: number; // 火轆津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_crane: number; // 吊/挾車津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_move_machine: number; // 搬機津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_kwh_night: number; // 嘉華-夜間津貼

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  allowance_mid_shift: number; // 中直津貼

  // OT 各時段津貼
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_1800_1900: number; // OT 1800-1900

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_1900_2000: number; // OT 1900-2000

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_0600_0700: number; // OT 0600-0700

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ot_0700_0800: number; // OT 0700-0800

  // 自定義津貼（JSON 格式存儲）
  @Column({ type: 'jsonb', nullable: true })
  custom_allowances: { name: string; amount: number }[];

  // 按車/噸數計佣金 - 關聯到車隊價目表
  @Column({ default: false })
  is_piece_rate: boolean; // 是否按件計酬

  @Column({ type: 'int', nullable: true })
  fleet_rate_card_id: number; // 關聯車隊價目表

  // 薪酬變更記錄
  @Column({ nullable: true })
  change_type: string; // 加薪/減薪/調整

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  change_amount: number; // 變更金額

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
