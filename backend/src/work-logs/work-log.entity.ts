import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';
import { Partner } from '../partners/partner.entity';
import { Quotation } from '../quotations/quotation.entity';
import { Employee } from '../employees/employee.entity';

@Entity('work_logs')
export class WorkLog {
  @PrimaryGeneratedColumn()
  id: number;

  // ── 基礎資訊 ────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  publisher_id: number; // 發佈人 (User)

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'publisher_id' })
  publisher: User;

  @Column({ default: 'editing' })
  status: string;
  // editing 編輯中 | unassigned 未指派 | assigned 已分配
  // in_progress 執行中 | completed 完成 | cancelled 取消

  @Column({ nullable: true })
  service_type: string;
  // 運輸 | 代工 | 工程 | 機械 | 管工工作 | 維修保養 | 雜務 | 上堂 | 緊急情況 | 請假/休息

  @Column({ type: 'date', nullable: true })
  scheduled_date: string; // 約定日期

  @Column({ type: 'int', nullable: true })
  company_profile_id: number; // 明達旗下公司 (CompanyProfile)

  @ManyToOne(() => CompanyProfile, { nullable: true })
  @JoinColumn({ name: 'company_profile_id' })
  company_profile: CompanyProfile;

  @Column({ type: 'int', nullable: true })
  client_id: number; // 客戶公司 (Partner)

  @ManyToOne(() => Partner, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Partner;

  @Column({ type: 'int', nullable: true })
  quotation_id: number; // 合約（來源報價單）

  @ManyToOne(() => Quotation, { nullable: true })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  // ── 執行細節 ────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  employee_id: number; // 司機/員工

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ nullable: true })
  machine_type: string;
  // 車輛類: 平斗|勾斗|夾斗|拖頭|車斗|貨車|輕型貨車|私家車|燈車
  // 機械類: 挖掘機|火轆

  @Column({ nullable: true })
  equipment_number: string;
  // 車輛類 → 車牌號碼 (plate_number)
  // 機械類 → 機械編號 (machine_code)

  @Column({ nullable: true })
  equipment_source: string; // 'vehicle' | 'machinery' — 記錄機號來源

  @Column({ nullable: true })
  tonnage: string;
  // 3噸|5.5噸|8噸|10噸|11噸|13噸|14噸|20噸|24噸|30噸|33噸|35噸|38噸|44噸|49噸

  @Column({ nullable: true })
  day_night: string; // 日 | 夜 | 中直

  @Column({ nullable: true, type: 'text' })
  start_location: string; // 起點

  @Column({ nullable: true })
  start_time: string; // 起點時間 HH:mm

  @Column({ nullable: true, type: 'text' })
  end_location: string; // 終點

  @Column({ nullable: true })
  end_time: string; // 終點時間 HH:mm

  // ── 結算資訊 ────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  quantity: number; // 數量

  @Column({ nullable: true })
  unit: string; // 工資單位

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ot_quantity: number; // OT 數量

  @Column({ nullable: true })
  ot_unit: string; // OT 工資單位

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  goods_quantity: number; // 商品數量

  // ── 自動匹配價格（後台計算，前端列表不顯示）────────────────
  @Column({ type: 'int', nullable: true })
  matched_rate_card_id: number; // 匹配到的 RateCard ID

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  matched_rate: number; // 匹配到的費率

  @Column({ nullable: true })
  matched_unit: string; // 匹配到的計費單位

  @Column({ nullable: true })
  matched_ot_rate: number; // 匹配到的 OT 費率

  @Column({ nullable: true })
  price_match_status: string;
  // 'matched' 已匹配 | 'unmatched' 未匹配 | 'pending' 待匹配

  @Column({ nullable: true, type: 'text' })
  price_match_note: string; // 匹配備註（如：未找到對應價目表）

  // ── 記錄資訊 ────────────────────────────────────────────────
  @Column({ nullable: true })
  receipt_no: string; // 入帳票編號（外部單據，如垃圾處理/磅飛）

  @Column({ nullable: true })
  work_order_no: string; // 單號（明達自己的飛仔編號）

  @Column({ default: false })
  is_confirmed: boolean; // 已確認

  @Column({ default: false })
  is_paid: boolean; // 已付款

  @Column({ nullable: true, type: 'text' })
  remarks: string; // 備註

  // ── 時間戳記 ────────────────────────────────────────────────
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
