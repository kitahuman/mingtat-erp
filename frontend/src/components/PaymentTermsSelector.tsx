'use client';

import { useState, useEffect } from 'react';
import { paymentTermTemplatesApi } from '@/lib/api';

interface PaymentTermsSelectorProps {
  companyId?: number;
  clientId?: number;
  value: string;
  onChange: (value: string) => void;
  onSaveAsTemplate: (name: string, sourceType: string) => Promise<void>;
  onSaveToDocument: () => Promise<void>;
}

export default function PaymentTermsSelector({
  companyId,
  clientId,
  value,
  onChange,
  onSaveAsTemplate,
  onSaveToDocument,
}: PaymentTermsSelectorProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [saveSourceType, setSaveSourceType] = useState('global');
  const [saving, setSaving] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);

  useEffect(() => {
    if (companyId || clientId) {
      setLoading(true);
      paymentTermTemplatesApi.list({ company_id: companyId, client_id: clientId })
        .then(res => setTemplates(res.data))
        .catch(err => console.error('Failed to load templates', err))
        .finally(() => setLoading(false));
    }
  }, [companyId, clientId]);

  const groupedTemplates = templates.reduce((acc: any, t) => {
    const group = t.source_type === 'global' ? '全域' : 
                  t.source_type === 'company' ? '公司' : '客戶';
    if (!acc[group]) acc[group] = [];
    acc[group].push(t);
    return acc;
  }, {});

  const handleSaveTemplate = async () => {
    if (!newTemplateName) return;
    setSaving(true);
    try {
      await onSaveAsTemplate(newTemplateName, saveSourceType);
      // Reload templates
      const res = await paymentTermTemplatesApi.list({ company_id: companyId, client_id: clientId });
      setTemplates(res.data);
      setShowSaveModal(false);
      setNewTemplateName('');
    } catch (err) {
      alert('儲存模板失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToDoc = async () => {
    setDocumentSaving(true);
    try {
      await onSaveToDocument();
      alert('已成功保存到單據');
    } catch (err) {
      alert('保存到單據失敗');
    } finally {
      setDocumentSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">付款條款設定</span>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowSaveModal(true)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            另存為模板
          </button>
          <button 
            onClick={handleSaveToDoc}
            disabled={documentSaving}
            className="text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
          >
            {documentSaving ? '保存中...' : '保存到單據'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <select 
          className="input-field h-9 py-1 text-sm"
          onChange={(e) => {
            const t = templates.find(tmp => String(tmp.id) === e.target.value);
            if (t) onChange(t.content);
          }}
          value=""
        >
          <option value="">選擇模板...</option>
          {Object.entries(groupedTemplates).map(([group, items]: [string, any]) => (
            <optgroup key={group} label={group}>
              {items.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field min-h-[80px] py-2 text-sm font-mono"
          placeholder="輸入付款條款內容..."
        />
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">另存為付款條款模板</h3>
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">模板名稱</span>
                <input 
                  type="text" 
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  className="input-field mt-1"
                  placeholder="例如：30天付款"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">儲存層級</span>
                <select 
                  value={saveSourceType}
                  onChange={e => setSaveSourceType(e.target.value)}
                  className="input-field mt-1"
                >
                  <option value="global">全域 (所有公司可用)</option>
                  {companyId && <option value="company">僅限此公司</option>}
                  {clientId && <option value="client">僅限此客戶</option>}
                </select>
              </label>
              <div className="mt-2 flex justify-end gap-3">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button 
                  onClick={handleSaveTemplate}
                  disabled={saving || !newTemplateName}
                  className="btn-primary"
                >
                  {saving ? '儲存中...' : '儲存模板'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
