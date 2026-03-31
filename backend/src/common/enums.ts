// 計量單位
export enum UnitOfMeasure {
  JOB = 'JOB',
  M = 'M',
  M2 = 'M2',
  M3 = 'M3',
  VEHICLE = '車',
  LABOR = '工',
  TON = '噸',
  DAY = '天',
  NIGHT = '晚',
  TIME = '次',
  PIECE = '個',
  ITEM = '件',
  HOUR = '小時',
  MONTH = '月',
  BIWEEK = '兩周',
  KG = '公斤',
}

export const UNIT_OPTIONS = Object.values(UnitOfMeasure);

// 服務類型
export enum ServiceType {
  TRANSPORT = '運輸',
  MACHINERY_RENTAL = '機械租賃',
  LABOR = '人工',
  MATERIAL = '物料',
  SERVICE = '服務',
}

export const SERVICE_TYPE_OPTIONS = Object.values(ServiceType);

// 車輛噸數選項
export const VEHICLE_TONNAGE_OPTIONS = [
  '13噸', '20噸', '24噸', '30噸', '38噸',
];

// 車輛類型選項
export const VEHICLE_TYPE_OPTIONS = [
  '平斗', '夾斗', '勾斗', '挖掘機', '推土機', '火轆', '水車', '吊車',
];

// 報價單狀態
export enum QuotationStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

// 價目表狀態
export enum RateCardStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// 日夜更
export enum DayNightShift {
  DAY = '日',
  NIGHT = '夜',
}
