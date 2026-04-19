'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  paymentInApi,
  bankAccountsApi,
  projectsApi,
  contractsApi,
} from '@/lib/api';
import AllocationsCard from './AllocationsCard';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import { useAuth } from '@/lib/auth';

const fmt$ = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未收款', color: 'bg-yellow-100 text-yellow-700' },
  partially_paid: { label: '部分收款', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已收款', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-700' },
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  payment_certificate: 'Payment Certificate',
  IPA: 'Payment Certificate',
  invoice: '發票',
  INVOICE: '發票',
  retention_release: '扣留金釋放',
  other: '其他收入',
};

interface SelectOption {
  value: number;
  label: string;
}

interface BankAccount {
  id: number;
  bank_name: string | null;
  account_name: string | null;
  account_no: string | null;
}

interface ProjectMini {
  id: number;
  project_no: string | null;
  project_name: string | null;
}

interface ContractMini {
  id: number;
  contract_no: string | null;
  contract_name: string | null;
}

interface PaymentInForm {
  date: string;
  amount: number | '';
  source_type: string;
  source_ref_id: number | '';
  project_id: number | '';
  contract_id: number | '';
  bank_account_id: number | '';
  reference_no: string;
  remarks: string;
  payment_in_status: string;
}

interface PaymentInRecord {
  id: number;
  date: string;
  amount: number | string;
  source_type: string;
  source_ref_id: number | null;
  project_id: number | null;
  contract_id: number | null;
  bank_account_id: number | null;
  reference_no: string | null;
  remarks: string | null;
  payment_in_status: string;
  created_at: string;
  updated_at: string;
  project?: ProjectMini | null;
  contract?: ContractMini | null;
  bank_account?: BankAccount | null;
  allocations?: unknown[];
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="text-sm text-gray-900">
        {children || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}

export default function PaymentInDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const recordId = Number(id);

  const { isReadOnly } = useAuth();
  const [record, setRecord] = useState<PaymentInRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentInForm>({
    date: '',
    amount: '',
    source_type: 'other',
    source_ref_id: '',
    project_id: '',
    contract_id: '',
    bank_account_id: '',
    reference_no: '',
    remarks: '',
    payment_in_status: 'paid',
  });

  const [projects, setProjects] = useState<ProjectMini[]>([]);
  const [contracts, setContracts] = useState<ContractMini[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const loadRecord = useCallback(() => {
    setLoading(true);
    paymentInApi
      .get(recordId)
      .then((r) => {
        const data = r.data as PaymentInRecord;
        setRecord(data);
        setForm(toForm(data));
      })
      .catch(() => setError('無法載入收款記錄'))
      .finally(() => setLoading(false));
  }, [recordId]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    projectsApi
      .list({ limit: 500 })
      .then((r) => setProjects((r.data?.data || []) as ProjectMini[]))
      .catch(() => {});
    contractsApi
      .list({ limit: 500 })
      .then((r) => setContracts((r.data?.data || []) as ContractMini[]))
      .catch(() => {});
    bankAccountsApi
      .simple()
      .then((r) => setBankAccounts((r.data || []) as BankAccount[]))
      .catch(() => {});
  }, []);

  const projectOptions: SelectOption[] = useMemo(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.project_no ?? ''} ${p.project_name ?? ''}`.trim() || `#${p.id}`,
      })),
    [projects],
  );

  const contractOptions: SelectOption[] = useMemo(
    () =>
      contracts.map((c) => ({
        value: c.id,
        label: `${c.contract_no ?? ''} ${c.contract_name ?? ''}`.trim() || `#${c.id}`,
      })),
    [contracts],
  );

  const bankAccountOptions: SelectOption[] = useMemo(
    () =>
      bankAccounts.map((ba) => ({
        value: ba.id,
        label: `${ba.bank_name ?? ''} - ${ba.account_name ?? ''} (${ba.account_no ?? ''})`,
      })),
    [bankAccounts],
  );

  function toForm(r: PaymentInRecord): PaymentInForm {
    return {
      date: r.date ? r.date.slice(0, 10) : '',
      amount: r.amount != null ? Number(r.amount) : '',
      source_type: r.source_type || 'other',
      source_ref_id: r.source_ref_id ?? '',
      project_id: r.project_id ?? '',
      contract_id: r.contract_id ?? '',
      bank_account_id: r.bank_account_id ?? '',
      reference_no: r.reference_no || '',
      remarks: r.remarks || '',
      payment_in_status: r.payment_in_status || 'paid',
    };
  }

  const handleSave = async () => {
    if (!form.date || !form.amount) return alert('請填寫日期和金額');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        date: form.date,
        amount: typeof form.amount === 'number' ? form.amount : parseFloat(form.amount),
        source_type: form.source_type,
        source_ref_id: form.source_ref_id ? Number(form.source_ref_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
        bank_account_id: form.bank_account_id
          ? Number(form.bank_account_id)
          : null,
        reference_no: form.reference_no || null,
        remarks: form.remarks || null,
        payment_in_status: form.payment_in_status || 'paid',
      };
      await paymentInApi.update(recordId, payload);
      setEditMode(false);
      loadRecord();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '儲存失敗';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定刪除此收款記錄？此操作無法復原。')) return;
    try {
      await paymentInApi.delete(recordId);
      router.push('/payment-in');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '刪除失敗';
      alert(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || '找不到收款記錄'}</p>
        <button
          onClick={() => router.push('/payment-in')}
          className="btn-secondary"
        >
          返回列表
        </button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[record.payment_in_status] || STATUS_MAP.unpaid;
  const sourceLabel =
    SOURCE_TYPE_LABELS[record.source_type] || record.source_type || '—';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/payment-in')}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                收款記錄 #{record.id}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              建立於 {fmtDate(record.created_at)} · 更新於{' '}
              {fmtDate(record.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setForm(toForm(record));
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </>
          ) : (
            !isReadOnly() && (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="btn-primary"
                >
                  編輯
                </button>
                <button
                  onClick={handleDelete}
                  className="btn-secondary text-red-600 hover:text-red-700"
                >
                  刪除
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* Basic Info Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">基本資訊</h2>
        {editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日期 *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  金額 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount: e.target.value === '' ? '' : parseFloat(e.target.value),
                    })
                  }
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  來源類型
                </label>
                <select
                  value={form.source_type}
                  onChange={(e) =>
                    setForm({ ...form, source_type: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="payment_certificate">Payment Certificate</option>
                  <option value="invoice">發票</option>
                  <option value="retention_release">扣留金釋放</option>
                  <option value="other">其他收入</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  狀態
                </label>
                <select
                  value={form.payment_in_status}
                  onChange={(e) =>
                    setForm({ ...form, payment_in_status: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="unpaid">未收款</option>
                  <option value="partially_paid">部分收款</option>
                  <option value="paid">已收款</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  關聯項目
                </label>
                <SearchableSelect
                  value={form.project_id ? Number(form.project_id) : null}
                onChange={(v: string | number | null) =>
                  setForm({ ...form, project_id: v == null ? '' : Number(v) })
                }
                  options={projectOptions}
                  placeholder="選擇項目"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  關聯合約
                </label>
                <SearchableSelect
                  value={form.contract_id ? Number(form.contract_id) : null}
                onChange={(v: string | number | null) =>
                  setForm({ ...form, contract_id: v == null ? '' : Number(v) })
                }
                  options={contractOptions}
                  placeholder="選擇合約"
                  clearable
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Field label="日期">{fmtDate(record.date)}</Field>
            <Field label="金額">
              <span className="text-lg font-semibold text-gray-900 font-mono">
                {fmt$(record.amount)}
              </span>
            </Field>
            <Field label="狀態">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            </Field>
            <Field label="來源類型">{sourceLabel}</Field>
            <Field label="關聯 ID">
              {record.source_ref_id ? `#${record.source_ref_id}` : null}
            </Field>
            <Field label="關聯項目">
              {record.project ? (
                <Link
                  href={`/projects/${record.project.id}`}
                  className="text-primary-600 hover:underline"
                >
                  {record.project.project_no} {record.project.project_name}
                </Link>
              ) : null}
            </Field>
            <Field label="關聯合約">
              {record.contract ? (
                <Link
                  href={`/contracts/${record.contract.id}`}
                  className="text-primary-600 hover:underline"
                >
                  {record.contract.contract_no}{' '}
                  {record.contract.contract_name}
                </Link>
              ) : null}
            </Field>
          </div>
        )}
      </div>

      {/* Cheque / Transaction Info Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          支票 / 交易紀錄
        </h2>
        {editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                銀行帳戶
              </label>
              <SearchableSelect
                value={form.bank_account_id ? Number(form.bank_account_id) : null}
                onChange={(v: string | number | null) =>
                  setForm({ ...form, bank_account_id: v == null ? '' : Number(v) })
                }
                options={bankAccountOptions}
                placeholder="選擇銀行帳戶"
                clearable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                支票 / 交易號碼
              </label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) =>
                  setForm({ ...form, reference_no: e.target.value })
                }
                className="input-field"
                placeholder="選填"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="銀行帳戶">
              {record.bank_account ? (
                <span>
                  {record.bank_account.bank_name} -{' '}
                  {record.bank_account.account_name} (
                  {record.bank_account.account_no})
                </span>
              ) : null}
            </Field>
            <Field label="支票 / 交易號碼">
              {record.reference_no ? (
                <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
                  {record.reference_no}
                </span>
              ) : null}
            </Field>
          </div>
        )}
      </div>

      {/* Remarks Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">備註</h2>
        {editMode ? (
          <textarea
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            className="input-field min-h-[100px]"
            placeholder="輸入備註..."
          />
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {record.remarks || <span className="text-gray-400">無備註</span>}
          </p>
        )}
      </div>

      {/* Allocations (多對多關聯單據) */}
      <AllocationsCard
        paymentInId={record.id}
        paymentInAmount={Number(record.amount) || 0}
        initialAllocations={
          (record.allocations || []) as unknown as Parameters<
            typeof AllocationsCard
          >[0]['initialAllocations']
        }
        onChange={loadRecord}
        readOnly={isReadOnly()}
      />
    </div>
  );
}
