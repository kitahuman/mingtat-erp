'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type ProgressData = {
  status?: string;
  currentStep?: number;
  errorMessage?: string;
  progressPercent?: number;
  counts?: {
    documents?: number;
    sources?: number;
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
  const isFailed = status === 'failed';
  const isWarning = status === 'needs_review';
  const isComplete = status === 'completed' || status === 'confirmed';
  const step2Label = currentStep > 2 || isComplete ? '完成核對' : '核對文件中';
  const step3Label = isFailed && currentStep === 3
    ? '核對功課表不成功'
    : currentStep >= 3 && sourceCount === 0 && !processingStatuses.has(status)
      ? '沒有工作紀錄'
      : '核對工作紀錄';
  const labels = ['已收到文件', step2Label, step3Label, '計算糧單', '生成糧單', '完成'];

  return labels.map((label, index) => {
    const stepNumber = index + 1;
    let visualStatus: StepVisualStatus = 'pending';
    if (isFailed && stepNumber === currentStep) visualStatus = 'failed';
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
  const [sourcesSummary, setSourcesSummary] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
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
  const [overrideJson, setOverrideJson] = useState('{}');
  const [overrideStatus, setOverrideStatus] = useState('confirmed');
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState('');

  const effectiveStatus = normalizeStatus(progress?.status || session?.session_status);
  const payrollIds = useMemo(() => getPayrollIds(session || undefined, generated), [session, generated]);
  const hasGeneratedPayroll = payrollIds.length > 0 || (progress?.counts?.payrolls || 0) > 0 || effectiveStatus === 'confirmed';
  const isProcessing = processingStatuses.has(effectiveStatus) || generating;
  const isLikelyStuck = isLikelyStuckProcessing(session, effectiveStatus);
  const isUploadStage = uploadStatuses.has(effectiveStatus);
  const isReviewStage = reviewStatuses.has(effectiveStatus) && !hasGeneratedPayroll;
  const unresolvedCount = progress?.counts?.unresolvedQuestions ?? questions.filter((q) => !q.question_resolved).length;

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
          const [summaryRes, docsRes, itemsRes, questionsRes, previewRes] = await Promise.allSettled([
            aiPayrollSessionApi.getSourcesSummary(sessionId),
            aiPayrollSessionApi.getDocuments(sessionId),
            aiPayrollSessionApi.getReconcileItems(sessionId, {
              page: 1,
              pageSize: 100,
              ...(statusFilter ? { status: statusFilter } : {}),
            }),
            aiPayrollSessionApi.getQuestions(sessionId, { resolved: false }),
            aiPayrollSessionApi.previewPayroll(sessionId),
          ]);
          if (summaryRes.status === 'fulfilled') setSourcesSummary(summaryRes.value.data || null);
          if (docsRes.status === 'fulfilled') setDocuments(toArray(docsRes.value.data));
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
  const timelineSteps = useMemo(
    () => buildTimelineSteps(effectiveStatus, progress, session),
    [effectiveStatus, progress, session],
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
                <h2 className="text-lg font-semibold text-gray-900">來源資料總覽</h2>
                <p className="text-sm text-gray-500">AI 會比對工作記錄、已上載功課紙與其他來源資料。</p>
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                ['文件', progress?.counts?.documents ?? documents.length],
                ['來源記錄', progress?.counts?.sources],
                ['來源類型', sourcesSummary?.byType ? Object.keys(sourcesSummary.byType).length : '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatNumber(value)}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">文件 / 類型</th>
                    <th className="px-3 py-2">狀態</th>
                    <th className="px-3 py-2">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-gray-400">暫未上載文件</td>
                    </tr>
                  ) : (
                    documents.map((doc: any) => (
                      <tr key={doc.id || doc.document_id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-800">{doc.original_name || doc.document_original_name || doc.filename || `文件 #${doc.id}`}</td>
                        <td className="px-3 py-2"><Badge tone={statusTone(doc.status || doc.document_status)}>{statusLabel(doc.status || doc.document_status || 'completed')}</Badge></td>
                        <td className="px-3 py-2 text-gray-500">{doc.form_type_hint || doc.document_form_type_hint || '自動辨識'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reconcile">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">核對結果</h2>
                <p className="text-sm text-gray-500">綠色代表已匹配，黃色代表 AI 判斷但信心不足，紅色代表資料衝突需人手處理。</p>
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
                    <th className="px-3 py-2">員工</th>
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">狀態</th>
                    <th className="px-3 py-2">AI 判斷</th>
                    <th className="px-3 py-2">信心</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-gray-400">暫無核對結果</td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const summary = summarizeDecidedData(item.reconcile_decided_data);
                      return (
                        <tr key={item.id} className="border-b align-top last:border-0">
                          <td className="px-3 py-3 font-medium text-gray-900">{toDisplayString(getEmployeeName(item))}</td>
                          <td className="px-3 py-3 text-gray-600">{formatDate(item.reconcile_date || item.reconcile_decided_data?.date)}</td>
                          <td className="px-3 py-3"><Badge tone={statusTone(item.reconcile_status)}>{reconcileLabel(item.reconcile_status)}</Badge></td>
                          <td className="px-3 py-3 text-gray-600">
                            {summary.length === 0 ? (
                              <span className="text-gray-400">沒有摘要</span>
                            ) : (
                              <div className="flex max-w-lg flex-wrap gap-1">
                                {summary.map((entry) => (
                                  <span key={entry.key} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                    {entry.key}: {String(entry.value)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.reconcile_reason && <p className="mt-1 text-xs text-gray-400">{toDisplayString(item.reconcile_reason)}</p>}
                          </td>
                          <td className="px-3 py-3 text-gray-600">
                            {item.reconcile_confidence !== undefined && item.reconcile_confidence !== null
                              ? `${Math.round(Number(item.reconcile_confidence) * 100)}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => openItemEditor(item)}
                              className="rounded-lg border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              查看 / 修正
                            </button>
                          </td>
                        </tr>
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">員工</th>
                    <th className="px-3 py-2">核對項目</th>
                    <th className="px-3 py-2">工作日</th>
                    <th className="px-3 py-2">狀態</th>
                    <th className="px-3 py-2">預計記錄</th>
                  </tr>
                </thead>
                <tbody>
                  {previewEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-gray-400">暫無預覽資料</td>
                    </tr>
                  ) : (
                    previewEmployees.map((employee: any) => (
                      <tr key={employee.employee_id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-medium text-gray-900">{employee.employee_name || `員工 #${employee.employee_id}`}</td>
                        <td className="px-3 py-3 text-gray-600">{formatNumber(employee.item_count)}</td>
                        <td className="px-3 py-3 text-gray-600">{formatNumber(employee.work_days)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(employee.statuses || {}).map((status: string) => (
                              <Badge key={status} tone={statusTone(status)}>{reconcileLabel(status)}</Badge>
                            ))}
                            {employee.has_unresolved_questions && <Badge tone="yellow">有未解答問題</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-600">{formatNumber(Array.isArray(employee.estimated_records) ? employee.estimated_records.length : employee.estimated_records)}</td>
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
