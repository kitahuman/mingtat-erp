'use client';
import { useState, useEffect, useCallback } from 'react';
import { customFieldsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import DateInput from '@/components/DateInput';

interface CustomFieldsBlockProps {
  module: string;
  entityId: number;
}

export default function CustomFieldsBlock({ module, entityId }: CustomFieldsBlockProps) {
  const { hasRole, hasMinRole } = useAuth();
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canEdit = hasMinRole('clerk');
  const canManageFields = hasRole('admin');

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const [fieldsRes, valuesRes] = await Promise.all([
        customFieldsApi.list({ module }),
        customFieldsApi.listValues({ module, entityId }),
      ]);
      const activeFields = (fieldsRes.data || []).filter((f: any) => f.is_active);
      setFields(activeFields);

      const valMap: Record<number, string> = {};
      for (const v of (valuesRes.data || [])) {
        valMap[v.custom_field_id] = v.value || '';
      }
      setValues(valMap);
    } catch {}
    setLoading(false);
  }, [module, entityId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        module,
        entityId,
        values: fields.map(f => ({
          customFieldId: f.id,
          value: values[f.id] || '',
        })),
      };
      await customFieldsApi.batchUpdateValues(payload);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '儲存失敗'); }
    setSaving(false);
  };

  const renderFieldInput = (field: any) => {
    const val = values[field.id] || '';
    const onChange = (v: string) => setValues({ ...values, [field.id]: v });

    switch (field.field_type) {
      case 'text':
        return <input type="text" value={val} onChange={e => onChange(e.target.value)} className="input-field" />;
      case 'number':
        return <input type="number" value={val} onChange={e => onChange(e.target.value)} className="input-field" />;
      case 'date':
 return <DateInput value={val} onChange={val => onChange(val || '')} className="input-field" />;
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input type="checkbox" checked={val === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} className="rounded border-gray-300" />
            <span className="text-sm">{val === 'true' ? '是' : '否'}</span>
          </label>
        );
      case 'select': {
        const options = (field.options || '').split('\n').filter((o: string) => o.trim());
        return (
          <select value={val} onChange={e => onChange(e.target.value)} className="input-field">
            <option value="">-- 請選擇 --</option>
            {options.map((opt: string) => <option key={opt} value={opt.trim()}>{opt.trim()}</option>)}
          </select>
        );
      }
      case 'textarea':
        return <textarea value={val} onChange={e => onChange(e.target.value)} className="input-field" rows={3} />;
      default:
        return <input type="text" value={val} onChange={e => onChange(e.target.value)} className="input-field" />;
    }
  };

  const renderFieldValue = (field: any) => {
    const val = values[field.id] || '';
    if (!val) return <span className="text-gray-400">-</span>;

    switch (field.field_type) {
      case 'boolean':
        return <span>{val === 'true' ? '是' : '否'}</span>;
      case 'date':
        return <span>{val}</span>;
      default:
        return <span className="whitespace-pre-wrap">{val}</span>;
    }
  };

  if (loading) return <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">自定義欄位</h2>
          {canManageFields && (
            <Link href="/settings/custom-fields" className="text-xs text-primary-600 hover:underline">管理欄位</Link>
          )}
        </div>
        {fields.length > 0 && canEdit && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); load(); }} className="btn-secondary text-sm" disabled={saving}>取消</button>
                <button onClick={handleSave} className="btn-primary text-sm" disabled={saving}>{saving ? '儲存中...' : '儲存'}</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="btn-secondary text-sm">編輯</button>
            )}
          </div>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="text-center py-4 text-gray-400 text-sm">
          暫無自定義欄位。
          {canManageFields && <Link href="/settings/custom-fields" className="text-primary-600 hover:underline">前往管理</Link>}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fields.map(field => (
            <div key={field.id}>
              <p className="text-sm text-gray-500 mb-1">
                {field.field_name}
                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                {field.has_expiry_alert && <span className="text-orange-500 ml-1" title="到期提醒已啟用">⏰</span>}
              </p>
              {editing ? renderFieldInput(field) : <p className="mt-0.5">{renderFieldValue(field)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
