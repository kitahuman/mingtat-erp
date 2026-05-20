'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { companiesApi, partnersApi, paymentTermTemplatesApi } from '@/lib/api';

type SourceType = 'global' | 'company' | 'client';

interface CompanyOption {
  id: number;
  name?: string;
  name_en?: string;
}

interface ClientOption {
  id: number;
  name?: string;
  name_en?: string;
}

interface PaymentTermTemplate {
  id: number;
  name: string;
  content: string;
  source_type: SourceType;
  company_id?: number | null;
  client_id?: number | null;
  is_default?: boolean;
  company?: CompanyOption | null;
  client?: ClientOption | null;
  created_at?: string;
  updated_at?: string;
}

interface FormState {
  name: string;
  content: string;
  source_type: SourceType;
  company_id: string;
  client_id: string;
  is_default: boolean;
}

const emptyForm: FormState = {
  name: '',
  content: '',
  source_type: 'global',
  company_id: '',
  client_id: '',
  is_default: false,
};

const sourceLabels: Record<SourceType, string> = {
  global: '全域',
  company: '公司',
  client: '客戶',
};

function displayName(item?: CompanyOption | ClientOption | null) {
  if (!item) return '';
  return item.name || item.name_en || `#${item.id}`;
}

function normalizeList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.items)) return record.items as T[];
  }
  return [];
}

export default function PaymentTermsPage() {
  const [templates, setTemplates] = useState<PaymentTermTemplate[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PaymentTermTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceType>('all');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [templateRes, companyRes, clientRes] = await Promise.all([
        paymentTermTemplatesApi.list({ all: true }),
        companiesApi.simple(),
        partnersApi.simple(),
      ]);
      setTemplates(normalizeList<PaymentTermTemplate>(templateRes.data));
      setCompanies(normalizeList<CompanyOption>(companyRes.data));
      setClients(normalizeList<ClientOption>(clientRes.data));
    } catch (err) {
      console.error('Failed to load payment term templates', err);
      setError('載入付款條款模板失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return templates.filter(template => {
      if (sourceFilter !== 'all' && template.source_type !== sourceFilter) return false;
      if (!keyword) return true;
      return [
        template.name,
        template.content,
        sourceLabels[template.source_type],
        displayName(template.company),
        displayName(template.client),
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [templates, search, sourceFilter]);

  const counts = useMemo(() => {
    return templates.reduce(
      (acc, template) => {
        acc[template.source_type] += 1;
        acc.all += 1;
        return acc;
      },
      { all: 0, global: 0, company: 0, client: 0 } as Record<'all' | SourceType, number>,
    );
  }, [templates]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (template: PaymentTermTemplate) => {
    setEditing(template);
    setForm({
      name: template.name || '',
      content: template.content || '',
      source_type: template.source_type || 'global',
      company_id: template.company_id ? String(template.company_id) : '',
      client_id: template.client_id ? String(template.client_id) : '',
      is_default: Boolean(template.is_default),
    });
    setShowModal(true);
  };

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const handleSourceChange = (sourceType: SourceType) => {
    setForm(prev => ({
      ...prev,
      source_type: sourceType,
      company_id: sourceType === 'company' ? prev.company_id : '',
      client_id: sourceType === 'client' ? prev.client_id : '',
    }));
  };

  const buildPayload = () => {
    const sourceType = form.source_type;
    return {
      name: form.name.trim(),
      content: form.content.trim(),
      source_type: sourceType,
      company_id: sourceType === 'company' && form.company_id ? Number(form.company_id) : undefined,
      client_id: sourceType === 'client' && form.client_id ? Number(form.client_id) : undefined,
      is_default: form.is_default,
    };
  };

  const canSave = Boolean(
    form.name.trim() &&
    form.content.trim() &&
    (form.source_type !== 'company' || form.company_id) &&
    (form.source_type !== 'client' || form.client_id),
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (editing) {
        await paymentTermTemplatesApi.update(editing.id, payload);
      } else {
        await paymentTermTemplatesApi.create(payload);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save payment term template', err);
      setError('儲存付款條款模板失敗，請檢查內容後再試。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: PaymentTermTemplate) => {
    if (!window.confirm(`確定要刪除付款條款「${template.name}」嗎？`)) return;
    setDeletingId(template.id);
    setError('');
    try {
      await paymentTermTemplatesApi.delete(template.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete payment term template', err);
      setError('刪除付款條款模板失敗，請稍後再試。');
    } finally {
      setDeletingId(null);
    }
  };

  const sourceBadgeClass = (sourceType: SourceType) => {
    if (sourceType === 'global') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (sourceType === 'company') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-green-50 text-green-700 border-green-200';
  };

  const sourceDetail = (template: PaymentTermTemplate) => {
    if (template.source_type === 'company') return displayName(template.company) || `公司 #${template.company_id || '-'}`;
    if (template.source_type === 'client') return displayName(template.client) || `客戶 #${template.client_id || '-'}`;
    return '所有公司及客戶可用';
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <Link href="/settings/field-options" className="hover:text-primary-600">選項管理</Link>
            <span>/</span>
            <span className="text-gray-700">付款條款</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">付款條款模板</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理全域、公司及客戶三個層級的付款條款，供發票及報價單 PDF 預覽套用。
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary whitespace-nowrap">
          新增付款條款
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ['all', '全部'],
          ['global', '全域'],
          ['company', '公司'],
          ['client', '客戶'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSourceFilter(key)}
            className={`rounded-xl border p-4 text-left transition ${
              sourceFilter === key
                ? 'border-primary-300 bg-primary-50 text-primary-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="text-xs font-medium text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-bold">{counts[key]}</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="搜尋名稱、內容或來源…"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <div className="text-sm text-gray-500">
              顯示 {filteredTemplates.length} / {templates.length} 個模板
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">名稱</th>
                  <th className="px-4 py-3 font-medium">來源</th>
                  <th className="px-4 py-3 font-medium">條款內容</th>
                  <th className="px-4 py-3 text-center font-medium">預設</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTemplates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      暫無付款條款模板，請點擊「新增付款條款」建立。
                    </td>
                  </tr>
                ) : (
                  filteredTemplates.map(template => (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-gray-900">{template.name}</div>
                        <div className="text-xs text-gray-400">ID: {template.id}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${sourceBadgeClass(template.source_type)}`}>
                          {sourceLabels[template.source_type]}
                        </span>
                        <div className="mt-1 max-w-[180px] truncate text-xs text-gray-500" title={sourceDetail(template)}>
                          {sourceDetail(template)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="line-clamp-3 max-w-xl whitespace-pre-line text-gray-700">
                          {template.content}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        {template.is_default ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">是</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(template)} className="text-primary-600 hover:text-primary-700">
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(template)}
                            disabled={deletingId === template.id}
                            className="text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {deletingId === template.id ? '刪除中…' : '刪除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing ? '編輯付款條款' : '新增付款條款'}
              </h3>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">名稱 *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={event => updateForm({ name: event.target.value })}
                  className="input-field"
                  placeholder="例如：30天付款"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">來源 *</label>
                  <select
                    value={form.source_type}
                    onChange={event => handleSourceChange(event.target.value as SourceType)}
                    className="input-field"
                  >
                    <option value="global">全域</option>
                    <option value="company">公司</option>
                    <option value="client">客戶</option>
                  </select>
                </div>

                {form.source_type === 'company' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">指定公司 *</label>
                    <select
                      value={form.company_id}
                      onChange={event => updateForm({ company_id: event.target.value })}
                      className="input-field"
                    >
                      <option value="">選擇公司...</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>{displayName(company)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {form.source_type === 'client' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">指定客戶 *</label>
                    <select
                      value={form.client_id}
                      onChange={event => updateForm({ client_id: event.target.value })}
                      className="input-field"
                    >
                      <option value="">選擇客戶...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>{displayName(client)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">付款條款內容 *</label>
                <textarea
                  value={form.content}
                  onChange={event => updateForm({ content: event.target.value })}
                  className="input-field min-h-[160px] py-2 font-mono text-sm"
                  placeholder="輸入付款條款內容..."
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={event => updateForm({ is_default: event.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                設為此來源的預設付款條款
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
                取消
              </button>
              <button onClick={handleSave} disabled={saving || !canSave} className="btn-primary disabled:opacity-50">
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
