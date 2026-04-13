import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'boolean';
  description?: string;
  lookupModel?: string;
  lookupField?: string;
  aliases?: string[];
}

const MODULE_FIELDS: Record<string, FieldDef[]> = {
  employees: [
    { key: 'emp_code', label: '員工編號', type: 'string' },
    { key: 'name_zh', label: '中文姓名', required: true, type: 'string' },
    { key: 'name_en', label: '英文姓名', type: 'string' },
    { key: 'nickname', label: '暱稱', type: 'string' },
    { key: 'role', label: '職位', type: 'string', description: 'worker/driver/operator/foreman/manager' },
    { key: 'phone', label: '電話', type: 'string' },
    { key: 'emergency_contact', label: '緊急聯絡人', type: 'string' },
    { key: 'join_date', label: '入職日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'company_name', label: '所屬公司', type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'bank_name', label: '銀行名稱', type: 'string' },
    { key: 'bank_account', label: '銀行帳號', type: 'string' },
    { key: 'id_number', label: '身份證號碼', type: 'string' },
    { key: 'gender', label: '性別', type: 'string', description: '男/女' },
    { key: 'address', label: '地址', type: 'string' },
    { key: 'notes', label: '備註', type: 'string' },
  ],
  vehicles: [
    { key: 'plate_number', label: '車牌號碼', required: true, type: 'string' },
    { key: 'machine_type', label: '車輛類型', type: 'string' },
    { key: 'tonnage', label: '噸數', type: 'number' },
    { key: 'company_name', label: '所屬公司', required: true, type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'brand', label: '品牌', type: 'string' },
    { key: 'model', label: '型號', type: 'string' },
    { key: 'insurance_expiry', label: '保險到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'permit_fee_expiry', label: '牌費到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'inspection_date', label: '驗車日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'license_expiry', label: '行車證到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'notes', label: '備註', type: 'string' },
    { key: 'vehicle_first_reg_date', label: '首次登記日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'vehicle_chassis_no', label: '底盤號碼', type: 'string' },
    { key: 'vehicle_electronic_comm', label: '電子通訊', type: 'string' },
    { key: 'vehicle_autotoll_collected', label: '易通行已取', type: 'string' },
    { key: 'vehicle_autotoll', label: '易通行', type: 'string' },
    { key: 'vehicle_inspection_notes', label: '驗車備註', type: 'string' },
    { key: 'vehicle_insurance_agent', label: '保險代理公司', type: 'string' },
    { key: 'vehicle_insurance_company', label: '保險公司', type: 'string' },
    { key: 'vehicle_has_gps', label: 'GPS', type: 'boolean' },
    { key: 'vehicle_mud_tail_expiry', label: '泥尾到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'vehicle_original_plate', label: '原身車牌', type: 'string' },
    { key: 'vehicle_owner_name', label: '車主名稱', type: 'string' },
  ],
  machinery: [
    { key: 'machine_code', label: '機械編號', required: true, type: 'string' },
    { key: 'machine_type', label: '機械類型', type: 'string' },
    { key: 'brand', label: '品牌', type: 'string' },
    { key: 'model', label: '型號', type: 'string' },
    { key: 'tonnage', label: '噸數', type: 'number' },
    { key: 'serial_number', label: '序列號', type: 'string' },
    { key: 'company_name', label: '所屬公司', required: true, type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'inspection_cert_expiry', label: '檢驗證到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'insurance_expiry', label: '保險到期日', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'notes', label: '備註', type: 'string' },
  ],
  partners: [
    { key: 'name', label: '公司名稱', required: true, type: 'string' },
    { key: 'name_en', label: '英文名稱', type: 'string' },
    { key: 'code', label: '簡稱', type: 'string', description: '用於糧單顯示' },
    { key: 'partner_type', label: '類型', required: true, type: 'string', description: 'client/subcontractor/supplier/other' },
    { key: 'category', label: '分類', type: 'string' },
    { key: 'contact_person', label: '聯絡人', type: 'string' },
    { key: 'phone', label: '電話', type: 'string' },
    { key: 'mobile', label: '手機', type: 'string' },
    { key: 'email', label: '電郵', type: 'string' },
    { key: 'fax', label: '傳真', type: 'string' },
    { key: 'address', label: '地址', type: 'string' },
    { key: 'bank_name', label: '銀行名稱', type: 'string' },
    { key: 'bank_account', label: '銀行帳號', type: 'string' },
    { key: 'notes', label: '備註', type: 'string' },
  ],
  'salary-config': [
    { key: 'employee_code', label: '員工編號', required: true, type: 'string', description: '員工編號（系統自動匹配）' },
    { key: 'effective_date', label: '生效日期', required: true, type: 'date', description: 'DD/MM/YYYY' },
    { key: 'salary_type', label: '薪酬類型', type: 'string', description: 'daily/monthly' },
    { key: 'base_salary', label: '底薪', type: 'number' },
    { key: 'allowance_night', label: '晚間津貼', type: 'number' },
    { key: 'allowance_3runway', label: '3跑津貼', type: 'number' },
    { key: 'allowance_rent', label: '租車津貼', type: 'number' },
    { key: 'allowance_well', label: '落井津貼', type: 'number' },
    { key: 'allowance_machine', label: '揸機津貼', type: 'number' },
    { key: 'allowance_roller', label: '火轆津貼', type: 'number' },
    { key: 'allowance_crane', label: '吊/挾車津貼', type: 'number' },
    { key: 'allowance_move_machine', label: '搬機津貼', type: 'number' },
    { key: 'allowance_kwh_night', label: '嘉華-夜間津貼', type: 'number' },
    { key: 'allowance_mid_shift', label: '中直津貼', type: 'number' },
    { key: 'ot_rate_standard', label: '標準OT時薪', type: 'number' },
    { key: 'ot_1800_1900', label: 'OT 1800-1900', type: 'number' },
    { key: 'ot_1900_2000', label: 'OT 1900-2000', type: 'number' },
    { key: 'ot_0600_0700', label: 'OT 0600-0700', type: 'number' },
    { key: 'ot_0700_0800', label: 'OT 0700-0800', type: 'number' },
    { key: 'ot_mid_shift', label: '中直OT津貼', type: 'number' },
    { key: 'notes', label: '備註', type: 'string' },
  ],
  'rate-cards': [
    { key: 'client_name', label: '客戶名稱', required: true, type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'company_name', label: '公司名稱', required: true, type: 'string', description: '公司名稱（系統自動匹配）' },
    { key: 'contract_no', label: '合約編號', type: 'string' },
    { key: 'service_type', label: '服務類型', type: 'string' },
    { key: 'name', label: '名稱', type: 'string' },
    { key: 'tonnage', label: '車輛噸數', type: 'string' },
    { key: 'machine_type', label: '車輛類型', type: 'string' },
    { key: 'origin', label: '起點', type: 'string' },
    { key: 'destination', label: '終點', type: 'string' },
    { key: 'day_rate', label: '日班價格', type: 'number' },
    { key: 'day_unit', label: '日班單位', type: 'string' },
    { key: 'night_rate', label: '夜班價格', type: 'number' },
    { key: 'night_unit', label: '夜班單位', type: 'string' },
    { key: 'mid_shift_rate', label: '中直價格', type: 'number' },
    { key: 'mid_shift_unit', label: '中直單位', type: 'string' },
    { key: 'ot_rate', label: 'OT價格', type: 'number' },
    { key: 'ot_unit', label: 'OT單位', type: 'string' },
    { key: 'effective_date', label: '生效日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'expiry_date', label: '到期日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'remarks', label: '備註', type: 'string' },
  ],
  'fleet-rate-cards': [
    { key: 'service_type', label: '服務類型', type: 'string', description: '租車/運輸/機械' },
    { key: 'name', label: '名稱', type: 'string' },
    { key: 'company_name', label: '公司', type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'client_name', label: '客戶名稱', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'contract_no', label: '合約編號', type: 'string' },
    { key: 'client_contract_no', label: '客戶合約', type: 'string' },
    { key: 'day_night', label: '日/夜班', type: 'string', description: '日/夜/中直' },
    { key: 'tonnage', label: '車輛噸數', type: 'string', description: '例: 25T / 35T / 50T' },
    { key: 'machine_type', label: '車輛/機種類型', type: 'string', description: '例: 吊車/大貨車/挖掘機' },
    { key: 'equipment_number', label: '機號/車牌', type: 'string' },
    { key: 'origin', label: '起點', type: 'string' },
    { key: 'destination', label: '終點', type: 'string' },
    { key: 'rate', label: '費率', type: 'number', aliases: ['日班價格'] },
    { key: 'mid_shift_rate', label: '中直價格', type: 'number' },
    { key: 'ot_rate', label: 'OT價格', type: 'number' },
    { key: 'unit', label: '單位', type: 'string', description: '例: 日/次/趟/小時' },
    { key: 'effective_date', label: '生效日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'expiry_date', label: '到期日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'remarks', label: '備註', type: 'string' },
  ],
  'subcon-rate-cards': [
    { key: 'service_type', label: '服務類型', type: 'string', description: '租車/運輸/機械' },
    { key: 'name', label: '名稱', type: 'string' },
    { key: 'subcon_name', label: '街車公司', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'plate_no', label: '車牌號碼', type: 'string' },
    { key: 'tonnage', label: '車輛噸數', type: 'string', description: '例: 25T / 35T / 50T' },
    { key: 'machine_type', label: '機種類型', type: 'string', description: '例: 吊車/大貨車/挖掘機' },
    { key: 'equipment_number', label: '機號', type: 'string' },
    { key: 'client_name', label: '客戶名稱', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'contract_no', label: '合約編號', type: 'string' },
    { key: 'client_contract_no', label: '客戶合約', type: 'string' },
    { key: 'day_night', label: '日/夜班', type: 'string', description: '日/夜/中直' },
    { key: 'origin', label: '起點', type: 'string' },
    { key: 'destination', label: '終點', type: 'string' },
    { key: 'day_rate', label: '日班價格', type: 'number' },
    { key: 'day_unit', label: '日班單位', type: 'string', description: '例: 日/次/趟/小時' },
    { key: 'night_rate', label: '夜班價格', type: 'number' },
    { key: 'night_unit', label: '夜班單位', type: 'string' },
    { key: 'mid_shift_rate', label: '中直價格', type: 'number' },
    { key: 'mid_shift_unit', label: '中直單位', type: 'string' },
    { key: 'ot_rate', label: 'OT價格', type: 'number' },
    { key: 'ot_unit', label: 'OT單位', type: 'string' },
    { key: 'unit', label: '單位（通用）', type: 'string' },
    { key: 'exclude_fuel', label: '不含油費', type: 'boolean', description: '是/否' },
    { key: 'effective_date', label: '生效日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'expiry_date', label: '到期日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'remarks', label: '備註', type: 'string' },
  ],
  'work-logs': [
    { key: 'scheduled_date', label: '約定日期', required: true, type: 'date', description: 'DD/MM/YYYY' },
    { key: 'service_type', label: '服務類型', type: 'string', description: '租車/運輸/機械' },
    { key: 'company_name', label: '公司', type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'client_name', label: '客戶公司', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'client_contract_no', label: '客戶合約', type: 'string' },
    { key: 'contract_name', label: '合約', type: 'string', description: '合約名稱（系統自動匹配）' },
    { key: 'employee_code', label: '員工', type: 'string', description: '員工編號（系統自動匹配）' },
    { key: 'tonnage', label: '噸數', type: 'string' },
    { key: 'machine_type', label: '機種', type: 'string' },
    { key: 'equipment_number', label: '機號', type: 'string' },
    { key: 'day_night', label: '日夜班', type: 'string', description: '日/夜' },
    { key: 'start_location', label: '起點', type: 'string' },
    { key: 'start_time', label: '起點時間', type: 'string' },
    { key: 'end_location', label: '終點', type: 'string' },
    { key: 'end_time', label: '終點時間', type: 'string' },
    { key: 'work_order_no', label: '單號', type: 'string' },
    { key: 'receipt_no', label: '入帳票編號', type: 'string' },
    { key: 'quantity', label: '數量', type: 'number' },
    { key: 'unit', label: '工資單位', type: 'string' },
    { key: 'ot_quantity', label: 'OT數量', type: 'number' },
    { key: 'ot_unit', label: 'OT單位', type: 'string' },
    { key: 'is_mid_shift', label: '中直', type: 'boolean', description: '是/否' },
    { key: 'goods_quantity', label: '商品數量', type: 'number' },
    { key: 'is_confirmed', label: '已確認', type: 'boolean', description: '是/否' },
    { key: 'is_paid', label: '已付款', type: 'boolean', description: '是/否' },
    { key: 'remarks', label: '備註', type: 'string' },
  ],
  'projects': [
    { key: 'project_no', label: '工程編號', required: true, type: 'string' },
    { key: 'project_name', label: '工程名稱', required: true, type: 'string' },
    { key: 'company_name', label: '公司名稱', required: true, type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'client_name', label: '客戶名稱', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'status', label: '狀態', type: 'string', description: 'pending/active/completed/cancelled' },
    { key: 'description', label: '描述', type: 'string' },
    { key: 'address', label: '地址', type: 'string' },
    { key: 'start_date', label: '開始日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'end_date', label: '結束日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'remarks', label: '備註', type: 'string' },
  ],
  'quotations': [
    { key: 'quotation_no', label: '報價單編號', required: true, type: 'string' },
    { key: 'quotation_type', label: '報價類型', type: 'string', description: 'project/monthly' },
    { key: 'company_name', label: '公司名稱', required: true, type: 'string', description: '公司名稱（系統自動匹配）', lookupModel: 'company', lookupField: 'name' },
    { key: 'client_name', label: '客戶名稱', type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'quotation_date', label: '報價日期', required: true, type: 'date', description: 'DD/MM/YYYY' },
    { key: 'contract_name', label: '合約名稱', type: 'string' },
    { key: 'project_name', label: '工程名稱', type: 'string' },
    { key: 'total_amount', label: '總金額', type: 'number' },
    { key: 'status', label: '狀態', type: 'string', description: 'draft/sent/accepted/rejected' },
    { key: 'validity_period', label: '有效期', type: 'string' },
    { key: 'payment_terms', label: '付款條款', type: 'string' },
    { key: 'external_remark', label: '外部備註', type: 'string' },
    { key: 'internal_remark', label: '內部備註', type: 'string' },
  ],
  'subcon-fleet-drivers': [
    { key: 'subcon_name', label: '街車公司', required: true, type: 'string', description: '合作單位名稱（系統自動匹配）' },
    { key: 'short_name', label: '簡稱', type: 'string' },
    { key: 'name_zh', label: '中文姓名', required: true, type: 'string' },
    { key: 'name_en', label: '英文姓名', type: 'string' },
    { key: 'id_number', label: '身份證號碼', type: 'string' },
    { key: 'machine_type', label: '車類型', type: 'string' },
    { key: 'plate_no', label: '常用車牌', type: 'string' },
    { key: 'phone', label: '聯絡電話', type: 'string' },
    { key: 'date_of_birth', label: '出生日期', type: 'date', description: 'DD/MM/YYYY' },
    { key: 'yellow_cert_no', label: '黃證no', type: 'string' },
    { key: 'red_cert_no', label: '紅證no', type: 'string' },
    { key: 'has_d_cert', label: 'D證', type: 'boolean', description: '是/否' },
    { key: 'is_cert_returned', label: '已還證', type: 'boolean', description: '是/否' },
    { key: 'address', label: '聯絡地址', type: 'string' },
    { key: 'status', label: '狀態', type: 'string', description: 'active/inactive' },
  ],
};

@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService) {}

  getTemplate(module: string) {
    const fields = MODULE_FIELDS[module];
    if (!fields) throw new BadRequestException(`不支援的模組: ${module}`);

    const headers = fields.map(f => f.label);
    const descriptions = fields.map(f => {
      const parts: string[] = [];
      if (f.required) parts.push('必填');
      if (f.type === 'date') parts.push('日期格式: DD/MM/YYYY');
      if (f.type === 'number') parts.push('數字');
      if (f.type === 'boolean') parts.push('是/否');
      if (f.description) parts.push(f.description);
      return parts.join(', ') || '';
    });

    // CSV escape: wrap fields containing commas in double quotes
    const escapeCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    };

    let optionReference = '';
    if (module === 'fleet-rate-cards' || module === 'subcon-rate-cards') {
      optionReference = '\n\n' + [
        '--- 填寫參考 ---',
        '服務類型: 租車, 運輸, 機械',
        '車輛/機種類型: 吊車, 大貨車, 挖掘機, 泥頭車, 水車',
        '單位: 日, 次, 趟, 小時, 噸',
        '日/夜班: 日, 夜, 中直',
        '不含油費 (只限街車): 是, 否'
      ].join('\n');
    }

    return {
      module,
      fields,
      csvHeader: headers.map(escapeCsv).join(','),
      csvDescription: descriptions.map(escapeCsv).join(',') + optionReference,
    };
  }

  preview(module: string, csvData: string) {
    const fields = MODULE_FIELDS[module];
    if (!fields) throw new BadRequestException(`不支援的模組: ${module}`);

    const lines = csvData.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) throw new BadRequestException('CSV 至少需要標題行和一行數據');

    // Parse header
    const headerLine = this.parseCsvLine(lines[0]);
    const fieldMap = new Map<number, FieldDef>();

    for (let i = 0; i < headerLine.length; i++) {
      const header = headerLine[i].trim();
      const field = fields.find(f => f.label === header || f.key === header || (f.aliases && f.aliases.includes(header)));
      if (field) fieldMap.set(i, field);
    }

    // Parse data rows
    const rows: any[] = [];
    const errors: { row: number; field: string; message: string }[] = [];

    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const values = this.parseCsvLine(lines[lineIdx]);
      const row: any = { _rowNumber: lineIdx + 1 };

      for (const [colIdx, field] of fieldMap.entries()) {
        const rawValue = (values[colIdx] || '').trim();
        if (!rawValue && field.required) {
          errors.push({ row: lineIdx + 1, field: field.label, message: `${field.label} 為必填欄位` });
          continue;
        }
        if (!rawValue) continue;

        if (field.type === 'number') {
          const num = Number(rawValue);
          if (isNaN(num)) {
            errors.push({ row: lineIdx + 1, field: field.label, message: `${field.label} 必須為數字` });
          } else {
            row[field.key] = num;
          }
        } else if (field.type === 'date') {
          // Support DD/MM/YYYY format
          const ddmmyyyyMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (ddmmyyyyMatch) {
            const [, day, month, year] = ddmmyyyyMatch;
            row[field.key] = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
            // Also support YYYY-MM-DD for backward compatibility
            row[field.key] = rawValue;
          } else {
            errors.push({ row: lineIdx + 1, field: field.label, message: `${field.label} 日期格式必須為 DD/MM/YYYY` });
          }
        } else if (field.type === 'boolean') {
          row[field.key] = rawValue === '是' || rawValue === 'true' || rawValue === '1';
        } else {
          row[field.key] = rawValue;
        }
      }

      rows.push(row);
    }

    // Check required fields
    for (const row of rows) {
      for (const field of fields) {
        if (field.required && !row[field.key] && row[field.key] !== 0) {
          const existing = errors.find(e => e.row === row._rowNumber && e.field === field.label);
          if (!existing) {
            errors.push({ row: row._rowNumber, field: field.label, message: `${field.label} 為必填欄位` });
          }
        }
      }
    }

    return { rows, errors, totalRows: rows.length, errorCount: errors.length };
  }

  async execute(module: string, rows: any[]) {
    const fields = MODULE_FIELDS[module];
    if (!fields) throw new BadRequestException(`不支援的模組: ${module}`);

    const results: { row: number; status: 'created' | 'updated' | 'error'; message?: string; id?: number }[] = [];

    for (const row of rows) {
      try {
        const { _rowNumber, ...data } = row;
        const result = await this.importRow(module, data);
        results.push({ row: _rowNumber, ...result });
      } catch (err: any) {
        results.push({ row: row._rowNumber, status: 'error', message: err.message });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const updated = results.filter(r => r.status === 'updated').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return { results, summary: { created, updated, errors: errorCount, total: rows.length } };
  }

  private async importRow(module: string, data: any): Promise<{ status: 'created' | 'updated'; id: number }> {
    switch (module) {
      case 'employees': return this.importEmployee(data);
      case 'vehicles': return this.importVehicle(data);
      case 'machinery': return this.importMachinery(data);
      case 'partners': return this.importPartner(data);
      case 'salary-config': return this.importSalaryConfig(data);
      case 'rate-cards': return this.importRateCard(data);
      case 'fleet-rate-cards': return this.importFleetRateCard(data);
      case 'subcon-rate-cards': return this.importSubconRateCard(data);
      case 'work-logs': return this.importWorkLog(data);
      case 'projects': return this.importProject(data);
      case 'quotations': return this.importQuotation(data);
      case 'subcon-fleet-drivers': return this.importSubconFleetDriver(data);
      default: throw new Error(`不支援的模組: ${module}`);
    }
  }

  private async importEmployee(data: any) {
    const companyId = await this.resolveCompanyId(data.company_name);
    const { company_name, ...rest } = data;

    // Check if employee exists by emp_code
    if (rest.emp_code) {
      const existing = await this.prisma.employee.findFirst({ where: { emp_code: rest.emp_code } });
      if (existing) {
        if (rest.join_date) rest.join_date = new Date(rest.join_date);
        await this.prisma.employee.update({ where: { id: existing.id }, data: { ...rest, company_id: companyId || existing.company_id } });
        return { status: 'updated' as const, id: existing.id };
      }
    }

    if (!companyId) throw new Error('找不到對應的公司，請確認公司名稱');
    if (rest.join_date) rest.join_date = new Date(rest.join_date);
    const created = await this.prisma.employee.create({ data: { ...rest, company_id: companyId } });
    return { status: 'created' as const, id: created.id };
  }

  private async importVehicle(data: any) {
    const companyId = await this.resolveCompanyId(data.company_name);
    if (!companyId) throw new Error('找不到對應的公司，請確認公司名稱');
    const { company_name, ...rest } = data;

    // Convert dates
    for (const df of ['insurance_expiry', 'permit_fee_expiry', 'inspection_date', 'license_expiry', 'vehicle_first_reg_date', 'vehicle_mud_tail_expiry']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }
    // Boolean field
    if ('vehicle_has_gps' in rest) {
      rest.vehicle_has_gps = rest.vehicle_has_gps === true || rest.vehicle_has_gps === 'true' || rest.vehicle_has_gps === '有' ? true : rest.vehicle_has_gps === false || rest.vehicle_has_gps === 'false' || rest.vehicle_has_gps === '無' ? false : null;
    }

    // Check existing by plate_number
    const existing = await this.prisma.vehicle.findFirst({ where: { plate_number: rest.plate_number } });
    if (existing) {
      await this.prisma.vehicle.update({ where: { id: existing.id }, data: { ...rest, owner_company_id: companyId } });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.vehicle.create({ data: { ...rest, owner_company_id: companyId } });
    return { status: 'created' as const, id: created.id };
  }

  private async importMachinery(data: any) {
    const companyId = await this.resolveCompanyId(data.company_name);
    if (!companyId) throw new Error('找不到對應的公司，請確認公司名稱');
    const { company_name, ...rest } = data;

    for (const df of ['inspection_cert_expiry', 'insurance_expiry']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }

    const existing = await this.prisma.machinery.findFirst({ where: { machine_code: rest.machine_code } });
    if (existing) {
      await this.prisma.machinery.update({ where: { id: existing.id }, data: { ...rest, owner_company_id: companyId } });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.machinery.create({ data: { ...rest, owner_company_id: companyId } });
    return { status: 'created' as const, id: created.id };
  }

  private async importPartner(data: any) {
    const existing = await this.prisma.partner.findFirst({ where: { name: data.name } });
    if (existing) {
      await this.prisma.partner.update({ where: { id: existing.id }, data });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.partner.create({ data });
    return { status: 'created' as const, id: created.id };
  }

  private async importSalaryConfig(data: any) {
    const { employee_code, ...rest } = data;
    const employee = await this.prisma.employee.findFirst({ where: { emp_code: employee_code } });
    if (!employee) throw new Error(`找不到員工編號: ${employee_code}`);

    if (rest.effective_date) rest.effective_date = new Date(rest.effective_date);

    // Numeric fields
    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'ot_mid_shift',
    ];
    for (const f of numericFields) {
      if (rest[f] !== undefined) rest[f] = Number(rest[f]) || 0;
    }

    // Check existing by employee + effective_date
    const existing = await this.prisma.employeeSalarySetting.findFirst({
      where: { employee_id: employee.id, effective_date: rest.effective_date },
    });

    if (existing) {
      await this.prisma.employeeSalarySetting.update({ where: { id: existing.id }, data: rest });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.employeeSalarySetting.create({
      data: { ...rest, employee_id: employee.id },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importRateCard(data: any) {
    const { client_name, company_name, ...rest } = data;
    const clientId = await this.resolvePartnerId(client_name);
    if (!clientId) throw new Error(`找不到客戶: ${client_name}`);
    const companyId = await this.resolveCompanyId(company_name);
    if (!companyId) throw new Error(`找不到公司: ${company_name}`);

    for (const df of ['effective_date', 'expiry_date']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }
    for (const nf of ['day_rate', 'night_rate', 'mid_shift_rate', 'ot_rate']) {
      if (rest[nf] !== undefined) rest[nf] = Number(rest[nf]) || 0;
    }

    const created = await this.prisma.rateCard.create({
      data: { ...rest, client_id: clientId, company_id: companyId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importFleetRateCard(data: any) {
    const { client_name, company_name, ...rest } = data;
    const clientId = client_name ? await this.resolvePartnerId(client_name) : null;
    const companyId = company_name ? await this.resolveCompanyId(company_name) : null;

    for (const nf of ['rate', 'day_rate', 'night_rate', 'mid_shift_rate', 'ot_rate']) {
      if (rest[nf] !== undefined) rest[nf] = Number(rest[nf]) || 0;
    }
    for (const df of ['effective_date', 'expiry_date']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }

    // Backward compatibility: if day_rate was provided (from old CSV) but rate wasn't
    if (rest.rate === undefined && rest.day_rate !== undefined) {
      rest.rate = rest.day_rate;
    }
    // Also sync back to day_rate for internal consistency if needed
    if (rest.day_rate === undefined && rest.rate !== undefined) {
      rest.day_rate = rest.rate;
    }

    const created = await this.prisma.fleetRateCard.create({
      data: { ...rest, client_id: clientId, company_id: companyId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importSubconRateCard(data: any) {
    const { subcon_name, client_name, ...rest } = data;
    const subconId = subcon_name ? await this.resolvePartnerId(subcon_name) : null;
    const clientId = client_name ? await this.resolvePartnerId(client_name) : null;

    for (const nf of ['day_rate', 'night_rate', 'mid_shift_rate', 'ot_rate']) {
      if (rest[nf] !== undefined) rest[nf] = Number(rest[nf]) || 0;
    }
    for (const df of ['effective_date', 'expiry_date']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }
    if (rest.exclude_fuel !== undefined) {
      rest.exclude_fuel = rest.exclude_fuel === 'true' || rest.exclude_fuel === true || rest.exclude_fuel === '是';
    }

    const created = await this.prisma.subconRateCard.create({
      data: { ...rest, subcon_id: subconId, client_id: clientId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async resolveEmployeeId(value: string | undefined): Promise<number | null> {
    if (!value) return null;
    // 1. Try exact emp_code match first
    const byCode = await this.prisma.employee.findFirst({
      where: { emp_code: { equals: value, mode: 'insensitive' } },
    });
    if (byCode) return byCode.id;
    // 2. Fall back to name match (name_zh exact, then name_en exact, then name_zh contains)
    const byNameZh = await this.prisma.employee.findFirst({
      where: { name_zh: { equals: value, mode: 'insensitive' } },
    });
    if (byNameZh) return byNameZh.id;
    const byNameEn = await this.prisma.employee.findFirst({
      where: { name_en: { equals: value, mode: 'insensitive' } },
    });
    if (byNameEn) return byNameEn.id;
    // 3. Try nickname table
    const byNickname = await this.prisma.employeeNickname.findFirst({
      where: { emp_nickname_value: { equals: value, mode: 'insensitive' } },
    });
    if (byNickname) return byNickname.emp_nickname_employee_id;
    return null;
  }

  private async importWorkLog(data: any) {
    const { company_name, client_name, employee_code, contract_name, ...rest } = data;
    const companyProfileId = company_name ? await this.resolveCompanyProfileId(company_name) : null;
    const clientId = client_name ? await this.resolvePartnerId(client_name) : null;
    let employeeId: number | null = null;
    if (employee_code) {
      employeeId = await this.resolveEmployeeId(employee_code);
    }
    let contractId: number | null = null;
    if (contract_name) {
      const contract = await this.prisma.contract.findFirst({
        where: {
          OR: [
            { contract_no: { equals: contract_name, mode: 'insensitive' } },
            { contract_name: { contains: contract_name, mode: 'insensitive' } },
          ],
        },
      });
      contractId = contract?.id ?? null;
    }

    if (rest.scheduled_date) rest.scheduled_date = new Date(rest.scheduled_date);
    for (const nf of ['quantity', 'ot_quantity', 'goods_quantity']) {
      if (rest[nf] !== undefined) rest[nf] = Number(rest[nf]) || 0;
    }
    // Boolean fields
    for (const bf of ['is_mid_shift', 'is_confirmed', 'is_paid']) {
      if (rest[bf] !== undefined) {
        const val = String(rest[bf]).toLowerCase();
        rest[bf] = val === 'true' || val === '是' || val === 'yes' || val === '1';
      }
    }

    const created = await this.prisma.workLog.create({
      data: {
        ...rest,
        company_profile_id: companyProfileId,
        client_id: clientId,
        employee_id: employeeId,
        contract_id: contractId,
        status: 'editing',
      },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importProject(data: any) {
    const { company_name, client_name, ...rest } = data;
    const companyId = await this.resolveCompanyId(company_name);
    if (!companyId) throw new Error(`找不到公司: ${company_name}`);
    const clientId = client_name ? await this.resolvePartnerId(client_name) : null;

    for (const df of ['start_date', 'end_date']) {
      if (rest[df]) rest[df] = new Date(rest[df]);
    }

    const existing = await this.prisma.project.findFirst({ where: { project_no: rest.project_no } });
    if (existing) {
      await this.prisma.project.update({ where: { id: existing.id }, data: { ...rest, company_id: companyId, client_id: clientId } });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.project.create({
      data: { ...rest, company_id: companyId, client_id: clientId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importQuotation(data: any) {
    const { company_name, client_name, project_name, ...rest } = data;
    const companyId = await this.resolveCompanyId(company_name);
    if (!companyId) throw new Error(`找不到公司: ${company_name}`);
    const clientId = client_name ? await this.resolvePartnerId(client_name) : null;
    let projectId: number | null = null;
    if (project_name) {
      const proj = await this.prisma.project.findFirst({ where: { project_name: { contains: project_name, mode: 'insensitive' } } });
      projectId = proj?.id ?? null;
    }

    if (rest.quotation_date) rest.quotation_date = new Date(rest.quotation_date);
    if (rest.total_amount !== undefined) rest.total_amount = Number(rest.total_amount) || 0;

    const existing = await this.prisma.quotation.findFirst({ where: { quotation_no: rest.quotation_no } });
    if (existing) {
      await this.prisma.quotation.update({ where: { id: existing.id }, data: { ...rest, company_id: companyId, client_id: clientId, project_id: projectId } });
      return { status: 'updated' as const, id: existing.id };
    }

    const created = await this.prisma.quotation.create({
      data: { ...rest, company_id: companyId, client_id: clientId, project_id: projectId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async importSubconFleetDriver(data: any) {
    const { subcon_name, ...rest } = data;
    const subconId = await this.resolvePartnerId(subcon_name);
    if (!subconId) throw new Error(`找不到街車公司: ${subcon_name}`);

    if (rest.date_of_birth) rest.date_of_birth = new Date(rest.date_of_birth);

    const created = await this.prisma.subcontractorFleetDriver.create({
      data: { ...rest, subcontractor_id: subconId },
    });
    return { status: 'created' as const, id: created.id };
  }

  private async resolveCompanyProfileId(name: string): Promise<number | null> {
    const cp = await this.prisma.companyProfile.findFirst({
      where: {
        OR: [
          { chinese_name: { contains: name, mode: 'insensitive' } },
          { code: { equals: name, mode: 'insensitive' } },
        ],
      },
    });
    return cp?.id ?? null;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async resolveCompanyId(name: string | undefined): Promise<number | null> {
    if (!name) return null;
    const company = await this.prisma.company.findFirst({
      where: {
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { internal_prefix: { equals: name, mode: 'insensitive' } },
        ],
      },
    });
    return company?.id ?? null;
  }

  private async resolvePartnerId(name: string | undefined): Promise<number | null> {
    if (!name) return null;
    const partner = await this.prisma.partner.findFirst({
      where: {
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { code: { equals: name, mode: 'insensitive' } },
        ],
      },
    });
    return partner?.id ?? null;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }
}
