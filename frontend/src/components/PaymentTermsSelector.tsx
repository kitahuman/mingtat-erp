'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { paymentTermTemplatesApi } from '@/lib/api';

type SourceType = 'global' | 'company' | 'client';

interface PaymentTermTemplate {
  id: number;
  name: string;
  content: string;
  source_type: SourceType;
}

interface PaymentTermsSelectorProps {
  companyId?: number;
  clientId?: number;
  value: string;
  onChange: (value: string) => void;
  onSaveAsTemplate: (name: string, sourceType: string) => Promise<void>;
  onSaveToDocument: () => Promise<void>;
  documentLabel?: string;
}

const sourceOrder: SourceType[] = ['global', 'company', 'client'];
const sourceLabels: Record<SourceType, string> = {
  global: '全域',
  company: '公司',
  client: '客戶',
};

export default function PaymentTermsSelector({
  companyId,
  clientId,
  value,
  onChange,
  onSaveAsTemplate,
  onSaveToDocument,
  documentLabel = '發票',
}: PaymentTermsSelectorProps) {
  const [templates, setTemplates] = useState<PaymentTermTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [saveSourceType, setSaveSourceType] = useState<SourceType>('global');
  const [saving, setSaving] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await paymentTermTemplatesApi.list({
        company_id: companyId,
        client_id: clientId,
      });
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load payment term templates', err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    setSelectedTemplateId('');
  }, [companyId, clientId]);

  const groupedTemplates = useMemo(() => {
    return sourceOrder.reduce((acc, sourceType) => {
      acc[sourceType] = templates.filter(template => template.source_type === sourceType);
      return acc;
    }, {} as Record<SourceType, PaymentTermTemplate[]>);
  }, [templates]);

  const handleTemplateChange = (templateId: string) => {
    if (!templateId) return;
    const template = templates.find(item => String(item.id) === templateId);
    if (template) {
      // 追加模板內容到現有文字後面，而非覆蓋
      const newValue = value.trim()
        ? value.trim() + '\n' + template.content
        : template.content;
      onChange(newValue);
    }
    // 重置下拉選單，讓用戶可以重複選擇同一模板追加
    setSelectedTemplateId('');
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setSaving(true);
    try {
      await onSaveAsTemplate(newTemplateName.trim(), saveSourceType);
      await loadTemplates();
      setShowSaveModal(false);
      setNewTemplateName('');
    } catch (err) {
      alert('儲存付款條款失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToDoc = async () => {
    setDocumentSaving(true);
    try {
      await onSaveToDocument();
      alert(`已成功新增到現有${documentLabel}`);
    } catch (err) {
      alert(`新增到現有${documentLabel}失敗`);
    } finally {
      setDocumentSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-bold text-gray-700">付款條款設定</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/options/payment-terms"
            className="text-xs font-medium text-gray-600 hover:text-primary-600"
          >
            所有付款條款
          </Link>
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            另存為付款條款
          </button>
          <button
            type="button"
            onClick={handleSaveToDoc}
            disabled={documentSaving}
            className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
          >
            {documentSaving ? '新增中...' : `新增到現有${documentLabel}`}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <select
          className="input-field h-9 py-1 text-sm"
          onChange={(event) => handleTemplateChange(event.target.value)}
          value={selectedTemplateId}
          disabled={loading}
        >
          <option value="">{loading ? '載入模板中...' : '選擇模板...'}</option>
          {!loading && templates.length === 0 && <option value="" disabled>沒有可用模板</option>}
          {sourceOrder.map(sourceType => {
            const groupTemplates = groupedTemplates[sourceType];
            if (!groupTemplates.length) return null;
            return (
              <optgroup key={sourceType} label={`[${sourceLabels[sourceType]}]`}>
                {groupTemplates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </optgroup>
            );
          })}
        </select>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input-field min-h-[80px] py-2 text-sm font-mono"
          placeholder="輸入付款條款內容..."
        />
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">另存為付款條款</h3>
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">付款條款名稱</span>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={event => setNewTemplateName(event.target.value)}
                  className="input-field mt-1"
                  placeholder="例如：30天付款"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">儲存層級</span>
                <select
                  value={saveSourceType}
                  onChange={event => setSaveSourceType(event.target.value as SourceType)}
                  className="input-field mt-1"
                >
                  <option value="global">全域（所有公司可用）</option>
                  {companyId && <option value="company">僅限此公司</option>}
                  {clientId && <option value="client">僅限此客戶</option>}
                </select>
              </label>
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={saving || !newTemplateName.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
