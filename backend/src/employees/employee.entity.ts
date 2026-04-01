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

  @Column({ nullable: true })
  nickname: string; // 別名

  @Column({ type: 'varchar', default: 'worker' })
  role: string; // driver, operator, worker, admin, subcontractor, casual_operator, foreman, safety_officer, director, t1

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  emergency_contact: string;

  @Column({ nullable: true, type: 'date' })
  join_date: string; // 入職日期 (hire_date)

  @Column({ nullable: true, type: 'date' })
  termination_date: string; // 離職日期

  @Column({ nullable: true, type: 'text' })
  termination_reason: string; // 離職原因

  @Column({ nullable: true })
  bank_name: string; // 銀行名稱

  @Column({ nullable: true })
  bank_account: string; // 銀行戶口號碼

  @Column({ nullable: true })
  id_number: string; // 身份證號碼 (hk_id)

  @Column({ nullable: true, type: 'date' })
  date_of_birth: string; // 出生日期

  @Column({ nullable: true })
  gender: string; // 性別: M/F

  @Column({ nullable: true, type: 'text' })
  address: string; // 聯絡地址

  @Column({ nullable: true })
  frequent_vehicle: string; // 常用車牌

  // 強積金
  @Column({ nullable: true })
  mpf_plan: string; // 強積金計劃 (mpf_scheme)

  @Column({ nullable: true })
  mpf_account_number: string; // 強積金戶口號碼

  @Column({ nullable: true, type: 'date' })
  mpf_employment_date: string; // 受僱日期(MPF)

  @Column({ nullable: true, type: 'date' })
  mpf_old_employment_date: string; // 舊受僱日期

  // 薪資備註
  @Column({ nullable: true, type: 'text' })
  salary_notes: string; // 日/月薪備註

  // ===== 證書/牌照 =====
  // 駕駛執照
  @Column({ nullable: true })
  driving_license_no: string;

  @Column({ nullable: true, type: 'date' })
  driving_license_expiry: string;

  @Column({ nullable: true })
  driving_license_class: string;

  // 核准工人證明書
  @Column({ nullable: true })
  approved_worker_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  approved_worker_cert_expiry: string;

  // 建造業安全訓練證明書 (平安卡/綠卡)
  @Column({ nullable: true })
  green_card_no: string;

  @Column({ nullable: true, type: 'date' })
  green_card_expiry: string;

  // 建造業工人註冊證 (工卡)
  @Column({ nullable: true })
  construction_card_no: string;

  @Column({ nullable: true, type: 'date' })
  construction_card_expiry: string;

  // 操作搬土機證明書
  @Column({ nullable: true })
  earth_mover_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  earth_mover_cert_expiry: string;

  // 操作挖掘機證明書
  @Column({ nullable: true })
  excavator_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  excavator_cert_expiry: string;

  // 起重機操作員證明書
  @Column({ nullable: true })
  crane_operator_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  crane_operator_cert_expiry: string;

  // 操作貨車吊機證明書
  @Column({ nullable: true })
  lorry_crane_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  lorry_crane_cert_expiry: string;

  // 操作履帶式固定吊臂起重機證明書
  @Column({ nullable: true })
  crawler_crane_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  crawler_crane_cert_expiry: string;

  // 操作輪胎式液壓伸縮吊臂起重機證明書
  @Column({ nullable: true })
  hydraulic_crane_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  hydraulic_crane_cert_expiry: string;

  // 機場禁區通行證
  @Column({ nullable: true })
  airport_pass_no: string;

  @Column({ nullable: true, type: 'date' })
  airport_pass_expiry: string;

  // 金門證
  @Column({ nullable: true })
  gammon_pass_no: string;

  @Column({ nullable: true, type: 'date' })
  gammon_pass_expiry: string;

  // 禮頓證
  @Column({ nullable: true })
  leighton_pass_no: string;

  @Column({ nullable: true, type: 'date' })
  leighton_pass_expiry: string;

  // 密閉空間作業核准工人證明書
  @Column({ nullable: true })
  confined_space_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  confined_space_cert_expiry: string;

  // 操作壓實機證明書
  @Column({ nullable: true })
  compactor_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  compactor_cert_expiry: string;

  // 吊索銀咭
  @Column({ nullable: true })
  slinging_silver_card_no: string;

  @Column({ nullable: true, type: 'date' })
  slinging_silver_card_expiry: string;

  // 工藝測試證明書
  @Column({ nullable: true })
  craft_test_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  craft_test_cert_expiry: string;

  // 壓實負荷物移動機械操作員機證明書
  @Column({ nullable: true })
  compaction_load_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  compaction_load_cert_expiry: string;

  // 升降台安全使用訓練證書
  @Column({ nullable: true })
  aerial_platform_cert_no: string;

  @Column({ nullable: true, type: 'date' })
  aerial_platform_cert_expiry: string;

  // 其他證書 (JSON 格式存儲額外證書)
  @Column({ nullable: true, type: 'jsonb' })
  other_certificates: any; // [{name, cert_no, expiry}]

  // ===== 關聯 =====
  @Column({ type: 'int' })
  company_id: number;

  @ManyToOne(() => Company, (c) => c.employees)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ default: 'active' })
  status: string; // active, inactive (terminated)

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
