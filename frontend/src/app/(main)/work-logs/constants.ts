// ── 工作記錄模組常數 ──────────────────────────────────────────

export const STATUS_OPTIONS = [
  { value: 'editing',     label: '編輯中' },
  { value: 'unassigned',  label: '未指派' },
  { value: 'assigned',    label: '已分配' },
  { value: 'in_progress', label: '執行中' },
  { value: 'completed',   label: '完成' },
  { value: 'cancelled',   label: '取消' },
];

export const STATUS_COLORS: Record<string, string> = {
  editing:     'bg-gray-100 text-gray-700',
  unassigned:  'bg-yellow-100 text-yellow-800',
  assigned:    'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  completed:   'bg-green-100 text-green-800',
  cancelled:   'bg-red-100 text-red-700',
};

export const SERVICE_TYPE_OPTIONS = [
  '運輸', '代工', '工程', '機械', '管工工作',
  '維修保養', '雜務', '上堂', '緊急情況', '請假/休息',
];

export const TONNAGE_OPTIONS = [
  '3噸', '5.5噸', '8噸', '10噸', '11噸', '13噸', '14噸',
  '20噸', '24噸', '30噸', '33噸', '35噸', '38噸', '44噸', '49噸',
];

export const MACHINE_TYPE_OPTIONS = [
  '平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車',
  '挖掘機', '火轆',
];

// 車輛類機種（從 Vehicles 表讀取車牌）
export const VEHICLE_MACHINE_TYPES = new Set([
  // field_options 預設類型
  '平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車',
  // 資料庫中實際存在的車輛類型
  '泥頭車', '夾車', '勾斗車', '吊車', '拖架', '領航車',
]);

// 機械類機種（從 Machinery 表讀取機械編號）
export const MACHINERY_MACHINE_TYPES = new Set([
  // field_options 預設類型
  '挖掘機', '火轆',
  // 資料庫中實實際存在的機械類型
  '鉸接式自卸卡車', '履帶式裝載機',
]);

export const DAY_NIGHT_OPTIONS = ['日', '夜', '中直'];

export const UNIT_OPTIONS = [
  '小時', '車', '天', '周', '月', '噸',
  'M', 'M2', 'M3', 'JOB', '工', '次', '轉', 'trip', '晚',
];

export function getStatusLabel(value: string): string {
  return STATUS_OPTIONS.find(o => o.value === value)?.label ?? value;
}

export function getEquipmentSource(machineType: string | null | undefined): 'vehicle' | 'machinery' | null {
  if (!machineType) return null;
  if (VEHICLE_MACHINE_TYPES.has(machineType)) return 'vehicle';
  if (MACHINERY_MACHINE_TYPES.has(machineType)) return 'machinery';
  return null;
}
