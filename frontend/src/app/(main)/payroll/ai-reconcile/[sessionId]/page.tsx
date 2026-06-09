'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { aiPayrollSessionApi } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Modal from '@/components/Modal';

type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'purple';
type StepVisualStatus = 'completed' | 'in_progress' | 'failed' | 'pending' | 'warning';

type SessionData = {
  id?: number;
  session_status?: string;
  session_period?: string;
  session_date_from?: string;
  session_date_to?: string;
  session_error_message?: string;
  session_payroll_ids?: number[] | string | null;
  session_current_step?: number;
  session_updated_at?: string;
  updated_at?: string;
  company?: { name?: string; chinese_name?: string };
  [key: string]: any;
};

type ProgressWarning = {
  code?: string;
  message?: string;
  severity?: string;
  document_ids?: number[];
  entry_ids?: number[];
};

type OcrIssue = {
  code?: string;
  label?: string;
  message?: string;
  severity?: string;
  rawEmployeeName?: string | null;
  originalDate?: string | null;
  correctedDate?: string | null;
  matchedEmployeeId?: number | null;
  matchConfidence?: number | null;
};

type ProgressData = {
  status?: string;
  currentStep?: number;
  errorMessage?: string;
  progressPercent?: number;
  warnings?: ProgressWarning[];
  documentOcr?: {
    documents?: number;
    pages?: number;
    extractedPages?: number;
    failedPages?: number;
    extractedEntries?: number;
    homeworkSheetSourceRecords?: number;
    hasWarning?: boolean;
  };
  counts?: {
    documents?: number;
    sources?: number;
    homeworkSheetSources?: number;
    reconcileItems?: number;
    unresolvedQuestions?: number;
    payrolls?: number;
  };
};

type ReconcileItem = {
  id: number;
  reconcile_status?: string;
  reconcile_employee_id?: number;
  reconcile_employee_name?: string;
  employee?: { name_zh?: string; name_en?: string };
  reconcile_date?: string;
  reconcile_decided_data?: Record<string, any> | null;
  reconcile_source_comparison?: Record<string, any> | null;
  reconcile_confidence?: number | null;
  reconcile_reason?: string | null;
  work_log?: any;
  sources?: any[];
  [key: string]: any;
};

type Question = {
  id: number;
  question_type?: string;
  question_severity?: string;
  question_text?: string;
  question_context?: any;
  question_resolved?: boolean;
  question_user_answer?: string;
  employee?: { name_zh?: string; name_en?: string };
  [key: string]: any;
};


type SourceRecord = {
  id?: number | string;
  source_record_session_id?: number;
  source_record_employee_id?: number | null;
  source_record_date?: string | null;
  source_record_source_type?: string;
  source_record_source_id?: number | string | null;
  source_record_data?: Record<string, any> | null;
  source_record_raw_data?: Record<string, any> | null;
  source_record_confidence?: number | string | null;
  [key: string]: any;
};

type SourceTypeConfig = {
  key: string;
  label: string;
  tone: StatusTone;
  description: string;
};

type DisplayField = {
  key: string;
  label: string;
  compact?: boolean;
};

const processingStatuses = new Set([
  'collecting',
  'recognizing',
  'reconciling',
  'calculating',
  'generating',
]);
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

const uploadStatuses = new Set(['pending', 'uploading']);
const reviewStatuses = new Set(['needs_review', 'completed']);


const SOURCE_TYPE_CONFIGS: SourceTypeConfig[] = [
  { key: 'work_log', label: '工作紀錄', tone: 'blue', description: '基準優先來源：系統工作紀錄' },
  { key: 'homework_sheet', label: '上載文件', tone: 'purple', description: 'AI 從功課紙或上載文件辨識出的資料' },
  { key: 'clock', label: '打卡', tone: 'yellow', description: '員工打卡 / attendance 資料' },
  { key: 'whatsapp_order', label: 'Order', tone: 'green', description: 'WhatsApp Order 資料' },
  { key: 'receipt', label: '入帳票', tone: 'green', description: '入帳票 / chit 紀錄' },
  { key: 'gps', label: 'GPS', tone: 'blue', description: 'GPS 行程及位置紀錄' },
  { key: 'manual', label: '手動輸入', tone: 'gray', description: '人手補充資料' },
  { key: 'system', label: '系統', tone: 'gray', description: '系統推算資料' },
];

const SOURCE_TYPE_LABELS = SOURCE_TYPE_CONFIGS.reduce<Record<string, SourceTypeConfig>>((acc, config) => {
  acc[config.key] = config;
  return acc;
}, {});

const SOURCE_DISPLAY_FIELDS: DisplayField[] = [
  { key: 'date', label: '日期', compact: true },
  { key: 'employee_name', label: '員工', compact: true },
  { key: 'service_type', label: '服務類型', compact: true },
  { key: 'day_night', label: '日/夜', compact: true },
  { key: 'work_content', label: '工作內容' },
  { key: 'company_name', label: '公司' },
  { key: 'client_name', label: '客戶' },
  { key: 'start_location', label: '起點' },
  { key: 'end_location', label: '終點' },
  { key: 'machine_type', label: '機種', compact: true },
  { key: 'tonnage', label: '噸數', compact: true },
  { key: 'equipment_number', label: '機號', compact: true },
  { key: 'quantity', label: '數量', compact: true },
  { key: 'unit', label: '單位', compact: true },
  { key: 'start_time', label: '開始時間', compact: true },
  { key: 'end_time', label: '結束時間', compact: true },
  { key: 'ot_quantity', label: 'OT', compact: true },
  { key: 'contract_no', label: '合約', compact: true },
];

const RECONCILE_TABLE_FIELDS: DisplayField[] = [
  { key: 'date', label: '日期' },
  { key: 'service_type', label: '服務類型' },
  { key: 'work_content', label: '工作內容' },
  { key: 'company_name', label: '公司' },
  { key: 'client_name', label: '客戶' },
  { key: 'employee_name', label: '員工' },
  { key: 'tonnage', label: '噸數' },
  { key: 'machine_type', label: '機種' },
  { key: 'equipment_number', label: '機號' },
];

const PREVIEW_DETAIL_COLUMNS = [
  { key: 'date', label: '約定日期', align: 'left' },
  { key: 'service_type', label: '服務類型', align: 'left' },
  { key: 'company_name', label: '公司', align: 'left' },
  { key: 'client_name', label: '客戶公司', align: 'left' },
  { key: 'client_contract_no', label: '客戶合約', align: 'left' },
  { key: 'tonnage', label: '噸數', align: 'left' },
  { key: 'machine_type', label: '機種', align: 'left' },
  { key: 'equipment_number', label: '機號', align: 'left' },
  { key: 'day_night', label: '日夜班', align: 'left' },
  { key: 'start_location', label: '起點', align: 'left' },
  { key: 'end_location', label: '終點', align: 'left' },
  { key: 'quantity', label: '數量', align: 'right' },
  { key: 'unit', label: '單位', align: 'left' },
  { key: 'ot_quantity', label: 'OT 數量', align: 'right' },
  { key: 'ot_unit', label: 'OT 單位', align: 'left' },
  { key: 'is_mid_shift', label: '中直', align: 'center' },
  { key: 'unit_price', label: '單價', align: 'right' },
  { key: 'subtotal', label: '小計', align: 'right' },
] as const;

type PreviewDetailColumnKey = typeof PREVIEW_DETAIL_COLUMNS[number]['key'];

const HOMEWORK_SHEET_SOURCE_TYPE = 'homework_sheet';
const COMPARE_SOURCE_TYPES = ['work_log', HOMEWORK_SHEET_SOURCE_TYPE, 'clock', 'whatsapp_order', 'receipt', 'gps'];

const SOURCE_CARD_CONFIGS = [
  { key: 'work_log', title: '工作紀錄卡片（base）', icon: 'WL' },
  { key: 'homework_sheet', title: '上載文件卡片', icon: 'DOC' },
  { key: 'clock', title: '打卡卡片', icon: 'CLK' },
  { key: 'whatsapp_order', title: 'Order 卡片', icon: 'ORD' },
  { key: 'receipt', title: '入帳票卡片', icon: 'REC' },
  { key: 'gps', title: 'GPS 卡片', icon: 'GPS' },
] as const;

const SOURCE_REVIEW_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  confirmed: { label: '已確認', tone: 'green' },
  rejected: { label: '已拒絕', tone: 'red' },
};

function normalizeStatus(status?: string) {
  return status || 'pending';
}

function toDisplayString(value: any, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function getErrorString(err: any, fallback = '操作失敗'): string {
  const msg = err?.response?.data?.message || err?.message;
  if (Array.isArray(msg)) return msg.map((item) => toDisplayString(item, '')).filter(Boolean).join('; ') || fallback;
  return toDisplayString(msg, fallback);
}

function formatDate(value?: any) {
  if (!value) return '—';
  return toDisplayString(value).slice(0, 10);
}

function formatNumber(value: any) {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : toDisplayString(value);
}

function formatMoney(value: any) {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return toDisplayString(value);
  return `$${number.toLocaleString()}`;
}

function getPreviewRecordValue(record: Record<string, any>, key: PreviewDetailColumnKey) {
  switch (key) {
    case 'date':
      return formatDate(record.date || record.scheduled_date || record.reconcile_date);
    case 'company_name':
      return toDisplayString(record.company_name || record.company?.name || record.company?.chinese_name);
    case 'client_name':
      return toDisplayString(record.client_name || record.customer_name);
    case 'client_contract_no':
      return toDisplayString(record.client_contract_no || record.contract_no || record.contract_number);
    case 'quantity':
    case 'ot_quantity':
      return formatNumber(record[key]);
    case 'is_mid_shift':
      return record.is_mid_shift ? '是' : '—';
    case 'unit_price':
      return formatMoney(record.unit_price || record.matched_rate || record.rate || record.price);
    case 'subtotal': {
      const explicit = record.subtotal || record.line_total || record.amount || record.total_amount;
      if (explicit !== undefined && explicit !== null && explicit !== '') return formatMoney(explicit);
      const unitPrice = Number(record.unit_price || record.matched_rate || record.rate || record.price);
      const quantity = Number(record.quantity || 1);
      return Number.isFinite(unitPrice) && Number.isFinite(quantity) ? formatMoney(unitPrice * quantity) : '—';
    }
    default:
      return toDisplayString(record[key]);
  }
}

function getPreviewColumnClass(column: { align: string }) {
  if (column.align === 'right') return 'px-2 py-2 text-right whitespace-nowrap';
  if (column.align === 'center') return 'px-2 py-2 text-center whitespace-nowrap';
  return 'px-2 py-2 text-left whitespace-nowrap';
}

function getPayrollIds(session?: SessionData, generated?: any): number[] {
  const fromGenerated = generated?.payroll_ids || generated?.payrollIds;
  const fromSession = session?.session_payroll_ids;
  const raw = fromGenerated || fromSession;
  if (Array.isArray(raw)) return raw.map(Number).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: StatusTone }) {
  const classes: Record<StatusTone, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '等待上載',
    uploading: '上載中',
    collecting: '收集資料中',
    recognizing: '辨識文件中',
    reconciling: 'AI 核對中',
    calculating: '計算預覽中',
    needs_review: '需要覆核',
    completed: '已核對',
    confirmed: '已完成',
    failed: '失敗',
    cancelled: '已取消',
  };
  return map[status || ''] || status || '未知';
}

function statusTone(status?: string): StatusTone {
  if (status === 'matched' || status === 'confirmed' || status === 'completed') return 'green';
  if (status === 'needs_review' || status === 'pending') return 'yellow';
  if (status === 'conflict' || status === 'failed') return 'red';
  if (processingStatuses.has(status || '')) return 'blue';
  if (status === 'confirmed') return 'green';
  return 'gray';
}

function reconcileLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待處理',
    matched: '已匹配',
    conflict: '資料衝突',
    needs_review: '需覆核',
    confirmed: '已確認',
    excluded: '已排除',
  };
  return map[status || ''] || status || '未知';
}

function getEmployeeName(item: ReconcileItem) {
  return (
    item.reconcile_employee_name ||
    item.employee?.name_zh ||
    item.employee?.name_en ||
    item.reconcile_decided_data?.employee_name ||
    `員工 #${item.reconcile_employee_id || '—'}`
  );
}

function summarizeDecidedData(data?: Record<string, any> | null) {
  if (!data) return [];
  const keys = ['work_type', 'clock_in', 'clock_out', 'hours', 'ot_hours', 'amount', 'site', 'vehicle_no'];
  return keys
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== '')
    .map((key) => ({ key, value: data[key] }));
}

function safeJson(value: any) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function toArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.records)) return value.records;
  return [];
}


function getSourceData(record?: SourceRecord | null): Record<string, any> {
  return (record?.source_record_data || record?.data || {}) as Record<string, any>;
}

function normalizeSourceType(sourceType?: string) {
  if (sourceType === 'attendance') return 'clock';
  if (sourceType === 'chit' || sourceType === 'slip_chit' || sourceType === 'slip_no_chit') return 'receipt';
  if (sourceType === 'ocr') return 'homework_sheet';
  return sourceType || 'unknown';
}

function getSourceType(record?: SourceRecord | null) {
  return normalizeSourceType(record?.source_record_source_type || record?.source_type || 'unknown');
}

function getSourceConfig(sourceType?: string): SourceTypeConfig {
  const key = normalizeSourceType(sourceType);
  return SOURCE_TYPE_LABELS[key] || { key, label: key, tone: 'gray', description: '其他來源資料' };
}

function getFieldValue(data: Record<string, any> | null | undefined, field: string) {
  if (!data) return undefined;
  if (field === 'company_name') return data.company_name || data.company || data.company_chinese_name;
  if (field === 'client_name') return data.client_name || data.customer || data.customer_name || data.unverified_client_name;
  if (field === 'employee_name') return data.employee_name || data.employee?.name_zh || data.employee?.name_en || data.raw_employee_name;
  if (field === 'date') return data.date || data.work_date || data.scheduled_date || data.corrected_work_date || data.original_work_date;
  return data[field];
}

function getOcrIssues(record?: SourceRecord | null): OcrIssue[] {
  const data = getSourceData(record);
  const fromData = Array.isArray(data.ocr_issues) ? data.ocr_issues : [];
  const fromRaw = Array.isArray(record?.source_record_raw_data?.ocr_issues) ? record?.source_record_raw_data?.ocr_issues : [];
  const seen = new Set<string>();
  return [...fromData, ...fromRaw].filter((issue) => {
    if (!issue || typeof issue !== 'object') return false;
    const key = `${issue.code || 'issue'}-${issue.message || issue.label || issue.originalDate || issue.correctedDate || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getOcrIssueLabel(issue: OcrIssue) {
  const map: Record<string, string> = {
    ocr_employee_unmatched: '員工未匹配',
    ocr_employee_auto_matched: '員工已匹配',
    ocr_employee_ambiguous: '員工需確認',
    ocr_date_corrected: '日期已修正',
    ocr_date_missing: '日期缺失',
    ocr_date_out_of_period: '日期不在期數',
  };
  return issue.label || map[issue.code || ''] || issue.message || 'OCR 提醒';
}

function getOcrIssueTone(issue: OcrIssue): StatusTone {
  if (issue.severity === 'info' || issue.code === 'ocr_employee_auto_matched' || issue.code === 'ocr_date_corrected') return 'green';
  if (issue.severity === 'error') return 'red';
  return 'yellow';
}

function getOcrIssueDetail(issue: OcrIssue) {
  if (issue.message) return issue.message;
  if (issue.code === 'ocr_date_corrected') return `${issue.originalDate || '原日期'} → ${issue.correctedDate || '修正日期'}`;
  if (issue.code === 'ocr_employee_unmatched') return `原始姓名：${issue.rawEmployeeName || '未能讀取'}`;
  if (issue.code === 'ocr_employee_auto_matched') return `原始姓名：${issue.rawEmployeeName || '—'}`;
  return '';
}

function getSourceRecordKey(record: SourceRecord, index: number) {
  return `${record.id || record.source_record_source_id || 'source'}-${getSourceType(record)}-${index}`;
}

function getSourceReviewDecision(item: ReconcileItem, sourceType: string) {
  const normalized = normalizeSourceType(sourceType);
  return item.reconcile_decided_data?.source_reviews?.[normalized] || item.reconcile_decided_data?.ai_source_reviews?.[normalized];
}

function getBaseSourceType(comparison: Record<string, any> | null | undefined, grouped: Record<string, SourceRecord[]>) {
  const fromComparison = normalizeSourceType(comparison?.base_source_type);
  if (fromComparison !== 'unknown') return fromComparison;
  return COMPARE_SOURCE_TYPES.find((type) => (grouped[type] || []).length > 0) || 'unknown';
}

function getAiSummaryText(item: ReconcileItem, comparison: Record<string, any> | null | undefined) {
  if (comparison?.ai_summary) return toDisplayString(comparison.ai_summary);
  const conflicted = getComparisonArray(comparison, 'conflicted_fields');
  if (conflicted.length === 0) return '各來源一致';
  return `有差異：${conflicted.join('、')}`;
}

function getComparisonArray(comparison: Record<string, any> | null | undefined, key: string): string[] {
  const value = comparison?.[key];
  return Array.isArray(value) ? value.map((entry) => normalizeSourceType(String(entry))) : [];
}

function getComparisonFieldTone(field: string, comparison?: Record<string, any> | null): StatusTone | null {
  if (getComparisonArray(comparison, 'conflicted_fields').includes(field)) return 'red';
  if (getComparisonArray(comparison, 'missing_fields').includes(field)) return 'yellow';
  if (getComparisonArray(comparison, 'agreed_fields').includes(field)) return 'green';
  return null;
}

function getSourceFieldClass(field: string, comparison?: Record<string, any> | null) {
  const tone = getComparisonFieldTone(field, comparison);
  if (tone === 'red') return 'border-red-200 bg-red-50 text-red-800';
  if (tone === 'yellow') return 'border-yellow-200 bg-yellow-50 text-yellow-800';
  if (tone === 'green') return 'border-green-100 bg-green-50 text-green-800';
  return 'border-gray-100 bg-gray-50 text-gray-700';
}

function sourceConfidence(record: SourceRecord) {
  const raw = record.source_record_confidence ?? record.confidence;
  if (raw === undefined || raw === null || raw === '') return '—';
  const value = Number(raw);
  if (!Number.isFinite(value)) return toDisplayString(raw);
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
}

function groupSourcesByType(records: SourceRecord[]) {
  return records.reduce<Record<string, SourceRecord[]>>((acc, record) => {
    const type = getSourceType(record);
    if (!acc[type]) acc[type] = [];
    acc[type].push(record);
    return acc;
  }, {});
}

function isHomeworkSheetSourceRecord(record: SourceRecord) {
  return getSourceType(record) === HOMEWORK_SHEET_SOURCE_TYPE;
}

function getDocumentFileName(document: any) {
  return toDisplayString(
    document?.doc_original_filename ||
      document?.original_filename ||
      document?.filename ||
      document?.file_name ||
      document?.name ||
      `文件 #${document?.id || '—'}`,
  );
}

function getDocumentStoragePath(document: any) {
  return document?.doc_storage_path || document?.storage_path || document?.path || document?.url || '';
}

function getDocumentOcrStatus(document: any) {
  const pages = Array.isArray(document?.pages) ? document.pages : [];
  const failedPages = pages.filter((page: any) => page?.page_status === 'failed').length;
  const extractedPages = pages.filter((page: any) => page?.page_status === 'extracted').length;
  const processingPages = pages.filter((page: any) => page?.page_status === 'processing').length;
  if (failedPages > 0) return { label: '讀取失敗', tone: 'yellow' as StatusTone };
  if (processingPages > 0) return { label: '讀取中', tone: 'blue' as StatusTone };
  if (pages.length > 0 && extractedPages === pages.length) return { label: '已讀取', tone: 'green' as StatusTone };
  return { label: toDisplayString(document?.doc_status || document?.status, '待讀取'), tone: 'gray' as StatusTone };
}

function getItemEmployeeId(item: ReconcileItem) {
  return item.reconcile_employee_id || item.reconcile_decided_data?.employee_id;
}

function getItemDate(item: ReconcileItem) {
  return formatDate(item.reconcile_date || item.reconcile_decided_data?.date);
}

function isLikelyStuckProcessing(session: SessionData | null, status: string) {
  if (!processingStatuses.has(status)) return false;
  const updatedAt = session?.session_updated_at || session?.updated_at;
  if (!updatedAt) return false;
  const updatedAtTime = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtTime)) return false;
  return Date.now() - updatedAtTime > STUCK_PROCESSING_MS;
}

function getTimelineStepFromStatus(status: string, progress?: ProgressData | null, session?: SessionData | null) {
  if (status === 'pending' || status === 'uploading') return 1;
  if (status === 'recognizing') return 2;
  if (status === 'collecting' || status === 'reconciling' || status === 'needs_review') return 3;
  if (status === 'calculating') return 4;
  if (status === 'generating') return 5;
  if (status === 'completed' || status === 'confirmed') return 6;
  if (status === 'failed') {
    const workflowStep = Number(progress?.currentStep ?? session?.session_current_step ?? 3);
    if (workflowStep === 2) return 2;
    if (workflowStep === 4) return 4;
    if (workflowStep >= 5) return 5;
    return 3;
  }
  return 1;
}

function buildTimelineSteps(status: string, progress?: ProgressData | null, session?: SessionData | null) {
  const currentStep = getTimelineStepFromStatus(status, progress, session);
  const sourceCount = Number(progress?.counts?.sources ?? 0);
  const hasDocumentOcrWarning = Boolean(
    progress?.documentOcr?.hasWarning ||
      progress?.warnings?.some((warning) => warning.code?.startsWith('document_ocr') || warning.code?.startsWith('ocr_')),
  );
  const isFailed = status === 'failed';
  const isWarning = status === 'needs_review';
  const isComplete = status === 'completed' || status === 'confirmed';
  const step2Label = hasDocumentOcrWarning
    ? '文件讀取有問題'
    : currentStep > 2 || isComplete
      ? '完成核對'
      : '核對文件中';
  const step3Label = isFailed && currentStep === 3
    ? '核對功課表不成功'
    : currentStep >= 3 && sourceCount === 0 && !processingStatuses.has(status)
      ? '沒有工作紀錄'
      : '核對工作紀錄';
  const labels = ['已收到文件', step2Label, step3Label, '計算糧單', '生成糧單', '完成'];

  return labels.map((label, index) => {
    const stepNumber = index + 1;
    let visualStatus: StepVisualStatus = 'pending';
    if (hasDocumentOcrWarning && stepNumber === 2) visualStatus = 'warning';
    else if (isFailed && stepNumber === currentStep) visualStatus = 'failed';
    else if (isWarning && stepNumber === currentStep) visualStatus = 'warning';
    else if (stepNumber < currentStep || isComplete) visualStatus = 'completed';
    else if (stepNumber === currentStep && !isComplete) visualStatus = 'in_progress';
    return { stepNumber, label, visualStatus };
  });
}

function StepStatusIcon({ status }: { status: StepVisualStatus }) {
  if (status === 'completed') return <span className="text-sm font-bold text-white">✓</span>;
  if (status === 'failed') return <span className="text-sm font-bold text-white">×</span>;
  if (status === 'in_progress') return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />;
  if (status === 'warning') return <span className="text-sm font-bold text-white">!</span>;
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />;
}

function ProgressStepper({ steps }: { steps: ReturnType<typeof buildTimelineSteps> }) {
  const statusClasses: Record<StepVisualStatus, string> = {
    completed: 'border-green-600 bg-green-600',
    in_progress: 'border-blue-600 bg-blue-600',
    failed: 'border-red-600 bg-red-600',
    warning: 'border-yellow-500 bg-yellow-500',
    pending: 'border-gray-300 bg-gray-100',
  };
  const connectorClasses: Record<StepVisualStatus, string> = {
    completed: 'bg-green-500',
    in_progress: 'bg-blue-300',
    failed: 'bg-red-300',
    warning: 'bg-yellow-300',
    pending: 'bg-gray-200',
  };
  const labelClasses: Record<StepVisualStatus, string> = {
    completed: 'text-green-700',
    in_progress: 'text-blue-700',
    failed: 'text-red-700',
    warning: 'text-yellow-700',
    pending: 'text-gray-500',
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">AI 計糧進度</h2>
        <p className="mt-1 text-sm text-gray-500">系統會根據目前狀態自動更新以下步驟。</p>
      </div>
      <div className="hidden items-start md:flex">
        {steps.map((step, index) => (
          <div key={step.stepNumber} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${statusClasses[step.visualStatus]}`}>
                <StepStatusIcon status={step.visualStatus} />
              </div>
              <div className={`mt-2 text-xs font-medium ${labelClasses[step.visualStatus]}`}>{step.label}</div>
            </div>
            {index < steps.length - 1 && (
              <div className={`mt-4 h-0.5 flex-1 ${connectorClasses[step.visualStatus]}`} />
            )}
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {steps.map((step, index) => (
          <div key={step.stepNumber} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusClasses[step.visualStatus]}`}>
                <StepStatusIcon status={step.visualStatus} />
              </div>
              {index < steps.length - 1 && <div className={`h-7 w-0.5 ${connectorClasses[step.visualStatus]}`} />}
            </div>
            <div className={`pt-1 text-sm font-medium ${labelClasses[step.visualStatus]}`}>{step.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiPayrollReconcilePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [sourceRecords, setSourceRecords] = useState<SourceRecord[]>([]);
  const [items, setItems] = useState<ReconcileItem[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('sources');
  const [statusFilter, setStatusFilter] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<ReconcileItem | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [expandedItemSources, setExpandedItemSources] = useState<Record<number, SourceRecord[]>>({});
  const [loadingExpandedItemId, setLoadingExpandedItemId] = useState<number | null>(null);
  const [overrideJson, setOverrideJson] = useState('{}');
  const [overrideStatus, setOverrideStatus] = useState('confirmed');
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState('');
  const [sourceReviewLoading, setSourceReviewLoading] = useState<string | null>(null);

  const effectiveStatus = normalizeStatus(progress?.status || session?.session_status);
  const payrollIds = useMemo(() => getPayrollIds(session || undefined, generated), [session, generated]);
  const hasGeneratedPayroll = payrollIds.length > 0 || (progress?.counts?.payrolls || 0) > 0 || effectiveStatus === 'confirmed';
  const isProcessing = processingStatuses.has(effectiveStatus) || generating;
  const isLikelyStuck = isLikelyStuckProcessing(session, effectiveStatus);
  const isUploadStage = uploadStatuses.has(effectiveStatus);
  const isReviewStage = reviewStatuses.has(effectiveStatus) && !hasGeneratedPayroll;
  const unresolvedCount = progress?.counts?.unresolvedQuestions ?? questions.filter((q) => !q.question_resolved).length;
  const timelineSteps = useMemo(
    () => buildTimelineSteps(effectiveStatus, progress, session),
    [effectiveStatus, progress, session],
  );
  const ocrSourceRecords = useMemo(
    () => sourceRecords.filter(isHomeworkSheetSourceRecord),
    [sourceRecords],
  );
  const ocrIssueCount = useMemo(
    () => ocrSourceRecords.reduce((count, record) => count + getOcrIssues(record).length, 0),
    [ocrSourceRecords],
  );
  const documentOcrWarnings = useMemo(
    () => (progress?.warnings || []).filter((warning) => warning.code?.startsWith('document_ocr') || warning.code?.startsWith('ocr_')),
    [progress],
  );
  const hasDocumentWithoutOcrRecords = documents.length > 0 && ocrSourceRecords.length === 0;
  const shouldShowDocumentOcrWarning =
    documentOcrWarnings.length > 0 ||
    (hasDocumentWithoutOcrRecords && !isProcessing && !uploadStatuses.has(effectiveStatus));

  const loadData = useCallback(
    async (quiet = false) => {
      if (!sessionId) return;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const [sessionRes, progressRes] = await Promise.all([
          aiPayrollSessionApi.getSession(sessionId),
          aiPayrollSessionApi.getProgress(sessionId),
        ]);
        setSession(sessionRes.data);
        setProgress(progressRes.data);

        const currentStatus = normalizeStatus(progressRes.data?.status || sessionRes.data?.session_status);
        const sourceCount = Number(progressRes.data?.counts?.sources ?? 0);
        const shouldFetchReviewData = !uploadStatuses.has(currentStatus) || sourceCount > 0;
        if (shouldFetchReviewData) {
          const [docsRes, sourcesRes, itemsRes, questionsRes, previewRes] = await Promise.allSettled([
            aiPayrollSessionApi.getDocuments(sessionId),
            aiPayrollSessionApi.getSources(sessionId),
            aiPayrollSessionApi.getReconcileItems(sessionId, {
              page: 1,
              pageSize: 100,
              ...(statusFilter ? { status: statusFilter } : {}),
            }),
            aiPayrollSessionApi.getQuestions(sessionId, { resolved: false }),
            aiPayrollSessionApi.previewPayroll(sessionId),
          ]);
          if (docsRes.status === 'fulfilled') setDocuments(toArray(docsRes.value.data));
          if (sourcesRes.status === 'fulfilled') {
            setSourceRecords(toArray<SourceRecord>(sourcesRes.value.data));
          }
          if (itemsRes.status === 'fulfilled') {
            const payload = itemsRes.value.data;
            const nextItems = toArray<ReconcileItem>(payload);
            setItems(nextItems);
            setItemsTotal(Number(payload?.total ?? payload?.count ?? nextItems.length) || nextItems.length);
          }
          if (questionsRes.status === 'fulfilled') setQuestions(toArray<Question>(questionsRes.value.data));
          if (previewRes.status === 'fulfilled') {
            const payload = previewRes.value.data;
            setPreview({ ...(payload || {}), employees: toArray(payload?.employees) });
          }
        }
      } catch (err: any) {
        setError(getErrorString(err, '載入 AI 計糧資料失敗'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId, statusFilter],
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => loadData(true), 3500);
    return () => window.clearInterval(timer);
  }, [isProcessing, loadData]);

  const startOrRetry = async (force = false) => {
    setError('');
    setRefreshing(true);
    try {
      await aiPayrollSessionApi.startReconcile(sessionId, force ? { force_restart: true } : {});
      await loadData(true);
    } catch (err: any) {
      setError(getErrorString(err, '啟動 AI 核對失敗'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleUploadAndStart = async () => {
    setError('');
    setUploading(true);
    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('formTypeHint', 'auto');
        await aiPayrollSessionApi.uploadSource(sessionId, formData);
      }
      setUploadFiles([]);
      await startOrRetry(false);
    } catch (err: any) {
      setError(getErrorString(err, '上載文件或啟動核對失敗'));
    } finally {
      setUploading(false);
    }
  };

  const answerQuestion = async (questionId: number) => {
    const answer = (questionAnswers[questionId] || '').trim();
    if (!answer) return;
    setAnsweringId(questionId);
    try {
      await aiPayrollSessionApi.answerQuestion(sessionId, questionId, { answer });
      setQuestionAnswers((prev) => ({ ...prev, [questionId]: '' }));
      await loadData(true);
    } catch (err: any) {
      setError(getErrorString(err, '提交答案失敗'));
    } finally {
      setAnsweringId(null);
    }
  };

  const dismissQuestion = async (questionId: number) => {
    setAnsweringId(questionId);
    try {
      await aiPayrollSessionApi.batchIgnoreQuestions(sessionId, { question_ids: [questionId] });
      await loadData(true);
    } catch (err: any) {
      setError(getErrorString(err, '忽略問題失敗'));
    } finally {
      setAnsweringId(null);
    }
  };

  const openItemEditor = async (item: ReconcileItem) => {
    setSelectedItem(item);
    setOverrideJson(safeJson(item.reconcile_decided_data));
    setOverrideStatus(item.reconcile_status || 'confirmed');
    setItemError('');
    try {
      const res = await aiPayrollSessionApi.getReconcileItem(sessionId, item.id);
      setSelectedItem(res.data);
      setOverrideJson(safeJson(res.data.reconcile_decided_data));
      setOverrideStatus(res.data.reconcile_status || 'confirmed');
    } catch {
      // Keep list row data if detail endpoint is unavailable.
    }
  };

  const toggleExpandedItem = async (item: ReconcileItem) => {
    const nextId = expandedItemId === item.id ? null : item.id;
    setExpandedItemId(nextId);
    if (!nextId || expandedItemSources[item.id]) return;

    const employeeId = getItemEmployeeId(item);
    const itemDate = getItemDate(item);
    if (!employeeId || itemDate === '—') return;

    setLoadingExpandedItemId(item.id);
    try {
      const res = await aiPayrollSessionApi.getSources(sessionId, {
        employee_id: employeeId,
        date: itemDate,
      });
      setExpandedItemSources((prev) => ({
        ...prev,
        [item.id]: toArray<SourceRecord>(res.data),
      }));
    } catch (err: any) {
      setError(getErrorString(err, '載入該日來源資料失敗'));
    } finally {
      setLoadingExpandedItemId(null);
    }
  };

  const updateSourceReview = async (item: ReconcileItem, sourceType: string, decision: 'confirmed' | 'rejected') => {
    const normalized = normalizeSourceType(sourceType);
    const loadingKey = `${item.id}:${normalized}`;
    setSourceReviewLoading(loadingKey);
    setError('');
    try {
      const decidedData = item.reconcile_decided_data || {};
      await aiPayrollSessionApi.updateReconcileItem(sessionId, item.id, {
        decided_data: {
          ...decidedData,
          source_reviews: {
            ...(decidedData.source_reviews || decidedData.ai_source_reviews || {}),
            [normalized]: {
              decision,
              reviewed_at: new Date().toISOString(),
            },
          },
        },
        status: decision === 'rejected' ? 'needs_review' : item.reconcile_status || 'confirmed',
      });
      setItems((prev) => prev.map((current) => {
        if (current.id !== item.id) return current;
        const currentData = current.reconcile_decided_data || {};
        return {
          ...current,
          reconcile_status: decision === 'rejected' ? 'needs_review' : current.reconcile_status,
          reconcile_decided_data: {
            ...currentData,
            source_reviews: {
              ...(currentData.source_reviews || currentData.ai_source_reviews || {}),
              [normalized]: {
                decision,
                reviewed_at: new Date().toISOString(),
              },
            },
          },
        };
      }));
    } catch (err: any) {
      setError(getErrorString(err, '更新來源確認狀態失敗'));
    } finally {
      setSourceReviewLoading(null);
    }
  };

  const saveItemOverride = async () => {
    if (!selectedItem) return;
    setSavingItem(true);
    setItemError('');
    try {
      let decidedData: Record<string, any> = {};
      try {
        decidedData = JSON.parse(overrideJson || '{}');
      } catch {
        setItemError('修正資料必須是有效 JSON 格式');
        return;
      }
      await aiPayrollSessionApi.updateReconcileItem(sessionId, selectedItem.id, {
        decided_data: decidedData,
        status: overrideStatus,
      });
      setSelectedItem(null);
      await loadData(true);
    } catch (err: any) {
      setItemError(getErrorString(err, '儲存修正失敗'));
    } finally {
      setSavingItem(false);
    }
  };

  const confirmAllMatched = async () => {
    const ids = items
      .filter((item) => ['matched', 'needs_review'].includes(item.reconcile_status || ''))
      .map((item) => item.id);
    if (!ids.length) return;
    setRefreshing(true);
    try {
      await aiPayrollSessionApi.batchConfirmReconcileItems(sessionId, { item_ids: ids });
      await loadData(true);
    } catch (err: any) {
      setError(getErrorString(err, '批量確認失敗'));
    } finally {
      setRefreshing(false);
    }
  };

  const generatePayroll = async (confirm = false) => {
    setGenerating(true);
    setError('');
    try {
      const res = await aiPayrollSessionApi.generatePayroll(sessionId, { confirm });
      setGenerated(res.data);
      await loadData(true);
      setActiveTab('preview');
    } catch (err: any) {
      setError(getErrorString(err, '生成糧單失敗'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl rounded-xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-purple-100 border-t-purple-600" />
          <p className="mt-4 text-sm text-gray-600">正在載入 AI 計糧資料...</p>
        </div>
      </div>
    );
  }

  const progressPercent = Math.min(100, Math.max(0, progress?.progressPercent || (isProcessing ? 45 : 0)));
  const companyName = toDisplayString(session?.company?.chinese_name || session?.company?.name || session?.company_name);
  const previewEmployees = toArray(preview?.employees);
  const previewDetailRows = previewEmployees.flatMap((employee: any) =>
    toArray(employee.estimated_records).map((record: any, index: number) => ({
      ...record,
      employee_id: record?.employee_id || employee.employee_id,
      employee_name: record?.employee_name || employee.employee_name,
      __preview_key: `${employee.employee_id || 'employee'}-${record?.date || 'date'}-${index}`,
    })),
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => router.push('/payroll')}
            className="mb-3 text-sm text-gray-500 hover:text-gray-700"
          >
            ← 返回計糧管理
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">AI 計糧核對</h1>
            <Badge tone={statusTone(effectiveStatus)}>{statusLabel(effectiveStatus)}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {companyName} · {formatDate(session?.session_date_from)} 至 {formatDate(session?.session_date_to)} · 期數 {session?.session_period || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? '刷新中...' : '重新整理'}
          </button>
          {effectiveStatus === 'failed' && (
            <button
              onClick={() => startOrRetry(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              重試流程
            </button>
          )}
          {isReviewStage && (
            <button
              onClick={() => generatePayroll(false)}
              disabled={generating || unresolvedCount > 0}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? '生成中...' : '生成糧單'}
            </button>
          )}
        </div>
      </div>

      <ProgressStepper steps={timelineSteps} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {effectiveStatus === 'failed' && (
        <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700">流程失敗</h2>
          <p className="mt-2 text-sm text-gray-600">
            {toDisplayString(progress?.errorMessage || session?.session_error_message, 'AI 計糧流程遇到錯誤，請檢查資料後重試。')}
          </p>
          <button
            onClick={() => startOrRetry(true)}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            重新執行 AI 核對
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{generating ? '正在生成糧單' : 'AI 正在核對資料'}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {isLikelyStuck
                  ? '此流程已在處理狀態停留較長時間，可能曾被中斷；可先重新整理，或強制重新啟動流程。'
                  : '系統會自動刷新進度，期間可留在此頁等待完成。'}
              </p>
            </div>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-col gap-2 text-xs text-gray-500 md:flex-row md:items-center md:justify-between">
            {isLikelyStuck ? (
              <button
                onClick={() => startOrRetry(true)}
                disabled={refreshing}
                className="w-fit rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
              >
                強制重新啟動流程
              </button>
            ) : (
              <span />
            )}
            <span>{progressPercent}%</span>
          </div>
        </div>
      )}

      {hasGeneratedPayroll && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <h2 className="text-lg font-semibold text-green-800">AI 計糧已完成</h2>
          <p className="mt-1 text-sm text-green-700">
            糧單已成功生成。你可以前往糧單詳情或糧單記錄繼續處理。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {payrollIds[0] && (
              <button
                onClick={() => router.push(`/payroll/${payrollIds[0]}`)}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
              >
                查看首張糧單
              </button>
            )}
            <button
              onClick={() => router.push('/payroll-records')}
              className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm text-green-700 hover:bg-green-50"
            >
              查看糧單記錄
            </button>
          </div>
        </div>
      )}

      {isUploadStage && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">上載來源資料</h2>
          <p className="mt-1 text-sm text-gray-500">
            可上載功課紙或 PDF，亦可直接開始以現有工作記錄核對。
          </p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-200 bg-purple-50 px-4 py-8 text-center hover:bg-purple-100">
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                setUploadFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                e.currentTarget.value = '';
              }}
            />
            <span className="text-sm font-semibold text-purple-700">選擇或加入來源文件</span>
            <span className="mt-1 text-xs text-purple-600">支援 PDF、PNG、JPG、JPEG、WEBP</span>
          </label>
          {uploadFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploadFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="ml-3 text-xs text-red-600 hover:text-red-700"
                    onClick={() => setUploadFiles((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleUploadAndStart}
              disabled={uploading}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {uploading ? '處理中...' : uploadFiles.length ? '上載並開始核對' : '直接開始核對'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">來源文件</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatNumber(progress?.counts?.documents ?? documents.length)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">來源記錄</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatNumber(progress?.counts?.sources)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">核對項目</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatNumber(progress?.counts?.reconcileItems ?? itemsTotal)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">待回答問題</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{formatNumber(unresolvedCount)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">已生成糧單</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatNumber(progress?.counts?.payrolls || payrollIds.length)}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:inline-flex md:w-auto md:grid-cols-none">
          <TabsTrigger value="sources">來源資料</TabsTrigger>
          <TabsTrigger value="reconcile">核對結果</TabsTrigger>
          <TabsTrigger value="questions">AI 問答</TabsTrigger>
          <TabsTrigger value="preview">生成預覽</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">上載文件 OCR 來源資料</h2>
                <p className="text-sm text-gray-500">以下只顯示 AI 從上載文件（功課紙）OCR / AI 辨識出的標準化內容，供核對文件是否被正確解讀。</p>
              </div>
              {!isProcessing && !hasGeneratedPayroll && (
                <button
                  onClick={() => startOrRetry(true)}
                  className="rounded-lg border border-purple-200 px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
                >
                  重新收集及核對
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                ['文件數量', documents.length || progress?.counts?.documents || 0],
                ['OCR讀取記錄數', ocrSourceRecords.length || progress?.counts?.homeworkSheetSources || 0],
                ['OCR提醒', ocrIssueCount || documentOcrWarnings.length || 0],
                ['未能讀取頁面', progress?.documentOcr?.failedPages || 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatNumber(value)}</p>
                </div>
              ))}
            </div>

            {shouldShowDocumentOcrWarning && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
                <p className="font-medium">文件讀取提醒</p>
                <div className="mt-2 space-y-1">
                  {documentOcrWarnings.length > 0 ? (
                    documentOcrWarnings.map((warning, index) => (
                      <p key={`${warning.code || 'ocr-warning'}-${index}`}>
                        {warning.message || '文件讀取有問題，請檢查 OCR 來源資料。'}
                      </p>
                    ))
                  ) : (
                    <p>AI 未能從上載文件中讀取資料，核對將使用其他來源（工作紀錄、打卡等）。</p>
                  )}
                </div>
              </div>
            )}

            {documents.length > 0 && (
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">已上載文件</p>
                  <Badge tone="purple">{documents.length} 份</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {documents.map((document, index) => {
                    const fileUrl = aiPayrollSessionApi.getUploadFileUrl(getDocumentStoragePath(document));
                    const ocrStatus = getDocumentOcrStatus(document);
                    const fileName = getDocumentFileName(document);
                    return (
                      <div key={document?.id || document?.doc_id || index} className="rounded-lg border bg-white px-3 py-2 text-sm">
                        {fileUrl ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-medium text-purple-700 hover:text-purple-900 hover:underline"
                            title={fileName}
                          >
                            {fileName}
                          </a>
                        ) : (
                          <div className="truncate font-medium text-gray-800" title={fileName}>{fileName}</div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <Badge tone={ocrStatus.tone}>{ocrStatus.label}</Badge>
                          <span>{formatNumber(document?.doc_page_count ?? document?.pages?.length ?? 0)} 頁</span>
                          {fileUrl && <span>可點擊查看原文件</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ocrSourceRecords.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
                {documents.length > 0
                  ? '暫未有 AI 從上載文件 OCR / AI 辨識出的記錄；系統會繼續使用工作紀錄、打卡等其他來源核對。'
                  : '暫未有 AI 從上載文件 OCR / AI 辨識出的記錄。請先上載文件或重新執行核對流程。'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2">來源</th>
                      <th className="px-3 py-2">日期</th>
                      <th className="px-3 py-2">員工</th>
                      <th className="px-3 py-2">服務類型</th>
                      <th className="px-3 py-2">工作內容</th>
                      <th className="px-3 py-2">客戶 / 公司</th>
                      <th className="px-3 py-2">起點 → 終點</th>
                      <th className="px-3 py-2">噸數 / 機種 / 機號</th>
                      <th className="px-3 py-2">數量</th>
                      <th className="px-3 py-2">時間 / OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocrSourceRecords.map((record, index) => {
                      const data = getSourceData(record);
                      const sourceConfig = getSourceConfig(getSourceType(record));
                      const issues = getOcrIssues(record);
                      const hasWarningIssue = issues.some((issue) => getOcrIssueTone(issue) !== 'green');
                      const dateIssues = issues.filter((issue) => issue.code?.includes('date'));
                      const employeeIssues = issues.filter((issue) => issue.code?.includes('employee'));
                      const rawEmployeeName = data.raw_employee_name || data.rawEmployeeName || data.employee_name_raw;
                      const employeeDisplay = getFieldValue(data, 'employee_name') || rawEmployeeName || `員工 #${record.source_record_employee_id || '—'}`;
                      const originalDate = data.original_work_date || data.originalDate;
                      const correctedDate = data.corrected_work_date || data.correctedDate;
                      return (
                        <tr key={getSourceRecordKey(record, index)} className={`border-b align-top last:border-0 hover:bg-gray-50 ${hasWarningIssue ? 'bg-yellow-50/40' : ''}`}>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              <Badge tone={sourceConfig.tone}>{sourceConfig.label}</Badge>
                              {issues.slice(0, 2).map((issue, issueIndex) => (
                                <Badge key={`${issue.code || 'ocr-issue'}-${issueIndex}`} tone={getOcrIssueTone(issue)}>{getOcrIssueLabel(issue)}</Badge>
                              ))}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">信心 {sourceConfidence(record)}</div>
                            {issues.length > 2 && <div className="mt-1 text-xs text-yellow-700">另有 {issues.length - 2} 個 OCR 提醒</div>}
                          </td>
                          <td className={`px-3 py-3 whitespace-nowrap ${dateIssues.length > 0 ? 'text-yellow-800' : 'text-gray-700'}`}>
                            <div>{formatDate(getFieldValue(data, 'date') || record.source_record_date)}</div>
                            {correctedDate && originalDate && correctedDate !== originalDate && (
                              <div className="text-xs text-yellow-700">原：{formatDate(originalDate)}</div>
                            )}
                          </td>
                          <td className={`px-3 py-3 font-medium whitespace-nowrap ${employeeIssues.length > 0 ? 'text-yellow-900' : 'text-gray-900'}`}>
                            <div>{toDisplayString(employeeDisplay)}</div>
                            {rawEmployeeName && rawEmployeeName !== employeeDisplay && <div className="text-xs text-yellow-700">原：{toDisplayString(rawEmployeeName)}</div>}
                            {!record.source_record_employee_id && <div className="text-xs text-yellow-700">員工未匹配</div>}
                          </td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{toDisplayString(getFieldValue(data, 'service_type'))}</td>
                          <td className="px-3 py-3 text-gray-700 min-w-[180px] max-w-xs">
                            <div className="line-clamp-3" title={toDisplayString(getFieldValue(data, 'work_content'), '')}>{toDisplayString(getFieldValue(data, 'work_content'))}</div>
                          </td>
                          <td className="px-3 py-3 text-gray-700 min-w-[140px]">
                            <div>{toDisplayString(getFieldValue(data, 'client_name'))}</div>
                            <div className="text-xs text-gray-400">{toDisplayString(getFieldValue(data, 'company_name'))}</div>
                          </td>
                          <td className="px-3 py-3 text-gray-700 min-w-[180px]">
                            {toDisplayString(getFieldValue(data, 'start_location'))} → {toDisplayString(getFieldValue(data, 'end_location'))}
                          </td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                            {toDisplayString(getFieldValue(data, 'tonnage'))} / {toDisplayString(getFieldValue(data, 'machine_type'))} / {toDisplayString(getFieldValue(data, 'equipment_number'))}
                          </td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                            {toDisplayString(getFieldValue(data, 'quantity'))} {toDisplayString(getFieldValue(data, 'unit'), '')}
                          </td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                            <div>{toDisplayString(getFieldValue(data, 'start_time'))} - {toDisplayString(getFieldValue(data, 'end_time'))}</div>
                            <div className="text-xs text-gray-400">OT {toDisplayString(getFieldValue(data, 'ot_quantity'))}</div>
                            {issues.length > 0 && (
                              <div className="mt-2 space-y-1 rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                                {issues.map((issue, issueIndex) => (
                                  <div key={`${issue.code || 'ocr-detail'}-${issueIndex}`}>
                                    <span className="font-medium">{getOcrIssueLabel(issue)}：</span>
                                    {getOcrIssueDetail(issue) || '請覆核文件辨識結果。'}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {ocrSourceRecords.length > 0 && (
              <div className="rounded-lg border bg-purple-50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">上載文件 OCR / AI 辨識結果</p>
                    <p className="text-xs text-gray-500">只包括 homework_sheet 來源類型；工作紀錄、打卡、Order、入帳票及 GPS 會保留在核對結果卡片中比較。</p>
                  </div>
                  <Badge tone="purple">{ocrSourceRecords.length} 筆</Badge>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reconcile">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">核對結果</h2>
                <p className="text-sm text-gray-500">點擊每行可展開查看工作紀錄、功課紙、打卡、Order、入帳票等來源的原始欄位值；紅色代表差異欄位，黃色代表缺漏欄位。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">全部狀態</option>
                  <option value="matched">已匹配</option>
                  <option value="needs_review">需覆核</option>
                  <option value="conflict">資料衝突</option>
                  <option value="confirmed">已確認</option>
                  <option value="excluded">已排除</option>
                </select>
                <button
                  onClick={confirmAllMatched}
                  disabled={!items.length || refreshing}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  確認目前可用項目
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-2 py-2 w-8"></th>
                    {RECONCILE_TABLE_FIELDS.map((field) => (
                      <th key={field.key} className="px-2 py-2 whitespace-nowrap">{field.label}</th>
                    ))}
                    <th className="px-2 py-2 whitespace-nowrap">來源</th>
                    <th className="px-2 py-2 whitespace-nowrap">狀態</th>
                    <th className="px-2 py-2 whitespace-nowrap">信心</th>
                    <th className="px-2 py-2 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-10 text-center text-gray-400">暫無核對結果</td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const decidedData = item.reconcile_decided_data || {};
                      const comparison = item.reconcile_source_comparison || {};
                      const itemSources = expandedItemSources[item.id] || [];
                      const grouped = groupSourcesByType(itemSources);
                      const isExpanded = expandedItemId === item.id;
                      const sourceCount = COMPARE_SOURCE_TYPES.filter((sourceType) => (grouped[sourceType] || []).length > 0).length || Number(comparison.source_count ?? 0);
                      const baseSourceType = getBaseSourceType(comparison, grouped);
                      const baseSourceConfig = getSourceConfig(baseSourceType);
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={`cursor-pointer border-b align-top hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}
                            onClick={() => toggleExpandedItem(item)}
                          >
                            <td className="px-2 py-3 text-xs text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                            {RECONCILE_TABLE_FIELDS.map((field) => {
                              const value = field.key === 'date'
                                ? getItemDate(item)
                                : getFieldValue(decidedData, field.key);
                              return (
                                <td key={field.key} className={`px-2 py-3 text-xs text-gray-700 ${['work_content', 'company_name', 'client_name'].includes(field.key) ? 'max-w-[150px] truncate' : 'whitespace-nowrap'}`} title={toDisplayString(value, '')}>
                                  {field.key === 'employee_name' ? toDisplayString(value || getEmployeeName(item)) : toDisplayString(value)}
                                </td>
                              );
                            })}
                            <td className="px-2 py-3 text-xs text-gray-700 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                {baseSourceType !== 'unknown' ? (
                                  <Badge tone={baseSourceConfig.tone}>{baseSourceConfig.label}(基準)</Badge>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                                <span className="text-[11px] text-gray-400">{sourceCount || itemSources.length}/{COMPARE_SOURCE_TYPES.length} 來源</span>
                              </div>
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap"><Badge tone={statusTone(item.reconcile_status)}>{reconcileLabel(item.reconcile_status)}</Badge></td>
                            <td className="px-2 py-3 text-xs text-gray-600 whitespace-nowrap">
                              {item.reconcile_confidence !== undefined && item.reconcile_confidence !== null
                                ? `${Math.round(Number(item.reconcile_confidence) * 100)}%`
                                : '—'}
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openItemEditor(item);
                                }}
                                className="rounded-lg border px-3 py-1.5 text-xs text-gray-700 hover:bg-white"
                              >
                                查看 / 修正
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={14} className="p-0">
                                <div className="border-b bg-blue-50 p-4">
                                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900">來源比對詳情</p>
                                      <p className="text-xs text-gray-500">
                                        已一致欄位 {getComparisonArray(comparison, 'agreed_fields').length} 個，差異欄位 {getComparisonArray(comparison, 'conflicted_fields').length} 個，缺漏欄位 {getComparisonArray(comparison, 'missing_fields').length} 個。
                                      </p>
                                    </div>
                                    {item.reconcile_reason && <p className="text-xs text-gray-500">AI 理由：{toDisplayString(item.reconcile_reason)}</p>}
                                  </div>

                                  {loadingExpandedItemId === item.id ? (
                                    <div className="rounded-lg bg-white p-6 text-center text-sm text-gray-500">正在載入該員工該日的來源資料...</div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                                      {SOURCE_CARD_CONFIGS.map((card) => {
                                        const config = getSourceConfig(card.key);
                                        const records = grouped[card.key] || [];
                                        const isFound = records.length > 0;
                                        const reviewDecision = getSourceReviewDecision(item, card.key);
                                        const reviewBadge = reviewDecision ? SOURCE_REVIEW_LABELS[reviewDecision] : null;
                                        const isBase = card.key === baseSourceType;
                                        const loadingKey = `${item.id}:${card.key}`;
                                        return (
                                          <div
                                            key={card.key}
                                            className={`rounded-xl border p-3 ${isBase ? 'border-blue-300 bg-blue-50' : isFound ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'}`}
                                          >
                                            <div className="mb-3 flex items-start justify-between gap-2">
                                              <div className="flex items-start gap-2">
                                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold ${isBase ? 'border-blue-300 bg-white text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                                                  {card.icon}
                                                </div>
                                                <div>
                                                  <div className="font-medium text-gray-900">{card.title}</div>
                                                  <div className="text-xs text-gray-500">{config.description}</div>
                                                </div>
                                              </div>
                                              <div className="flex flex-col items-end gap-1">
                                                {isBase && <Badge tone="blue">Base</Badge>}
                                                {isFound ? <Badge tone={config.tone}>{records.length} 筆</Badge> : <Badge tone="gray">未找到</Badge>}
                                                {reviewBadge && <Badge tone={reviewBadge.tone}>{reviewBadge.label}</Badge>}
                                              </div>
                                            </div>

                                            {!isFound ? (
                                              <div className="rounded-md border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
                                                未找到對應資料
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                {records.map((record, recordIndex) => {
                                                  const data = getSourceData(record);
                                                  return (
                                                    <div key={getSourceRecordKey(record, recordIndex)} className="rounded-md border bg-gray-50 p-2">
                                                      <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                                                        <span>來源 ID: {toDisplayString(record.source_record_source_id || record.id)}</span>
                                                        <span>信心 {sourceConfidence(record)}</span>
                                                      </div>
                                                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                                        {SOURCE_DISPLAY_FIELDS.filter((field) => !field.compact || getFieldValue(data, field.key) !== undefined).map((field) => {
                                                          const value = field.key === 'date'
                                                            ? formatDate(getFieldValue(data, field.key) || record.source_record_date)
                                                            : getFieldValue(data, field.key);
                                                          if (value === undefined || value === null || value === '') return null;
                                                          return (
                                                            <div key={field.key} className={`rounded border px-2 py-1 ${getSourceFieldClass(field.key, comparison)}`}>
                                                              <div className="text-[10px] font-medium opacity-70">{field.label}</div>
                                                              <div className="mt-0.5 text-xs font-medium break-words">{toDisplayString(value)}</div>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                            <div className="mt-3 flex gap-2 border-t pt-3">
                                              <button
                                                type="button"
                                                disabled={sourceReviewLoading === loadingKey}
                                                onClick={() => updateSourceReview(item, card.key, 'confirmed')}
                                                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                                              >
                                                確認
                                              </button>
                                              <button
                                                type="button"
                                                disabled={sourceReviewLoading === loadingKey}
                                                onClick={() => updateSourceReview(item, card.key, 'rejected')}
                                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                              >
                                                拒絕
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                                        <div className="mb-3 flex items-start gap-2">
                                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-200 bg-white text-[11px] font-semibold text-purple-700">AI</div>
                                          <div>
                                            <div className="font-medium text-gray-900">AI 核對摘要卡片</div>
                                            <div className="text-xs text-gray-500">AI 對各來源一致性及差異的判斷</div>
                                          </div>
                                        </div>
                                        <div className="space-y-2 rounded-lg border border-purple-100 bg-white p-3 text-sm text-gray-700">
                                          <p>{getAiSummaryText(item, comparison)}</p>
                                          <p className="text-xs text-gray-500">基準來源：{baseSourceConfig.label}</p>
                                          <p className="text-xs text-gray-500">{toDisplayString(item.reconcile_reason, '系統按基準優先順序與多來源比對生成此摘要。')}</p>
                                        </div>
                                        <div className="mt-3 flex gap-2 border-t border-purple-100 pt-3">
                                          <button
                                            type="button"
                                            disabled={sourceReviewLoading === `${item.id}:ai_summary`}
                                            onClick={() => updateSourceReview(item, 'ai_summary', 'confirmed')}
                                            className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                                          >
                                            確認
                                          </button>
                                          <button
                                            type="button"
                                            disabled={sourceReviewLoading === `${item.id}:ai_summary`}
                                            onClick={() => updateSourceReview(item, 'ai_summary', 'rejected')}
                                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                          >
                                            拒絕
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="questions">
          <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI 問答</h2>
              <p className="text-sm text-gray-500">請以對話方式回答 AI 的疑問；答案會被記錄為日後核對參考。</p>
            </div>
            {questions.length === 0 ? (
              <div className="rounded-lg bg-green-50 p-6 text-center text-sm text-green-700">目前沒有待回答問題，可以生成糧單。</div>
            ) : (
              questions.map((question) => (
                <div key={question.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone={question.question_severity === 'high' ? 'red' : 'yellow'}>{toDisplayString(question.question_severity, '需確認')}</Badge>
                    <span className="text-xs text-gray-500">{toDisplayString(question.employee?.name_zh || question.employee?.name_en, '未指定員工')}</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-gray-800 shadow-sm">
                    {toDisplayString(question.question_text, 'AI 需要你確認此項資料。')}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <textarea
                      value={questionAnswers[question.id] || ''}
                      onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                      placeholder="在此輸入回覆，例如：以功課紙為準，該日為加班 2 小時。"
                      className="min-h-[82px] flex-1 rounded-lg border px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                    />
                    <div className="flex gap-2 md:flex-col">
                      <button
                        onClick={() => answerQuestion(question.id)}
                        disabled={answeringId === question.id || !(questionAnswers[question.id] || '').trim()}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        回答
                      </button>
                      <button
                        onClick={() => dismissQuestion(question.id)}
                        disabled={answeringId === question.id}
                        className="rounded-lg border px-4 py-2 text-sm hover:bg-white disabled:opacity-50"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">糧單生成預覽</h2>
                <p className="text-sm text-gray-500">確認所有問題處理後即可生成糧單。</p>
              </div>
              <button
                onClick={() => generatePayroll(false)}
                disabled={generating || unresolvedCount > 0 || hasGeneratedPayroll}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {hasGeneratedPayroll ? '已生成' : generating ? '生成中...' : '生成糧單'}
              </button>
            </div>
            {unresolvedCount > 0 && (
              <div className="m-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                尚有 {unresolvedCount} 條 AI 問題未處理，請先於「AI 問答」分頁回答或忽略。
              </div>
            )}
            <div className="border-b bg-gray-50/60 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {previewEmployees.map((employee: any) => (
                  <div key={employee.employee_id || employee.employee_name} className="rounded-lg border bg-white p-3">
                    <p className="font-medium text-gray-900">{employee.employee_name || `員工 #${employee.employee_id}`}</p>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-gray-500">
                      <span>{formatNumber(employee.item_count)} 項核對</span>
                      <span>·</span>
                      <span>{formatNumber(employee.work_days)} 個工作日</span>
                      <span>·</span>
                      <span>{formatNumber(toArray(employee.estimated_records).length)} 筆明細</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.keys(employee.statuses || {}).map((status: string) => (
                        <Badge key={status} tone={statusTone(status)}>{reconcileLabel(status)}</Badge>
                      ))}
                      {employee.has_unresolved_questions && <Badge tone="yellow">有未解答問題</Badge>}
                    </div>
                  </div>
                ))}
                {previewEmployees.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-400 md:col-span-3">
                    暫無員工預覽摘要。
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium uppercase tracking-wider text-gray-500">員工</th>
                    {PREVIEW_DETAIL_COLUMNS.map((column) => (
                      <th key={column.key} className={`${getPreviewColumnClass(column)} font-medium uppercase tracking-wider text-gray-500`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {previewDetailRows.length === 0 ? (
                    <tr>
                      <td colSpan={PREVIEW_DETAIL_COLUMNS.length + 1} className="px-3 py-10 text-center text-gray-400">
                        暫無預覽明細資料
                      </td>
                    </tr>
                  ) : (
                    previewDetailRows.map((record: Record<string, any>) => (
                      <tr key={record.__preview_key} className="hover:bg-gray-50">
                        <td className="px-2 py-2 whitespace-nowrap font-medium text-gray-900">
                          {record.employee_name || `員工 #${record.employee_id || '—'}`}
                        </td>
                        {PREVIEW_DETAIL_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            className={`${getPreviewColumnClass(column)} ${column.key === 'subtotal' ? 'font-mono font-bold text-primary-600' : column.align === 'right' ? 'font-mono text-gray-700' : 'text-gray-700'}`}
                            title={toDisplayString(getPreviewRecordValue(record, column.key), '')}
                          >
                            {getPreviewRecordValue(record, column.key)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Modal
        isOpen={!!selectedItem}
        onClose={() => {
          if (!savingItem) setSelectedItem(null);
        }}
        title="核對項目修正"
        size="xl"
      >
        {selectedItem && (
          <div className="space-y-4">
            {itemError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{itemError}</div>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">員工</p>
                <p className="mt-1 font-medium text-gray-900">{toDisplayString(getEmployeeName(selectedItem))}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">日期</p>
                <p className="mt-1 font-medium text-gray-900">{formatDate(selectedItem.reconcile_date || selectedItem.reconcile_decided_data?.date)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">目前狀態</p>
                <p className="mt-1"><Badge tone={statusTone(selectedItem.reconcile_status)}>{reconcileLabel(selectedItem.reconcile_status)}</Badge></p>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">修正後狀態</label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="confirmed">已確認</option>
                <option value="matched">已匹配</option>
                <option value="needs_review">需覆核</option>
                <option value="conflict">資料衝突</option>
                <option value="excluded">排除</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">修正資料（JSON）</label>
              <textarea
                value={overrideJson}
                onChange={(e) => setOverrideJson(e.target.value)}
                className="min-h-[240px] w-full rounded-lg border px-3 py-2 font-mono text-xs focus:border-purple-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">此資料會合併至 AI 判斷結果，適合修正工時、加班、工種、金額或地點等欄位。</p>
            </div>
            {Array.isArray(selectedItem.sources) && selectedItem.sources.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">來源比對</p>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-50 p-3">
                  <pre className="whitespace-pre-wrap text-xs text-gray-600">{safeJson(selectedItem.sources)}</pre>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                onClick={() => setSelectedItem(null)}
                disabled={savingItem}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={saveItemOverride}
                disabled={savingItem}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {savingItem ? '儲存中...' : '儲存修正'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
