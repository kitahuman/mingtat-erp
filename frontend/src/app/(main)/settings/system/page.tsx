'use client';
import { useState, useEffect } from 'react';
import { systemSettingsApi } from '@/lib/api';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/lib/auth';

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'text' | 'boolean';
  defaultValue: string;
  min?: number;
  max?: number;
  unit?: string;
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: 'bank_reconciliation_date_tolerance',
    label: '銀行對帳日期容差',
    description: '自動配對時，月結單交易日期與系統記錄日期的允許誤差天數。例如設定 3，表示月結單日期前後 3 天內的記錄都會嘗試配對。',
    type: 'number',
    defaultValue: '3',
    min: 0,
    max: 30,
    unit: '天',
  },
];

export default function SystemSettingsPage() {
  const { isReadOnly } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await systemSettingsApi.getAll();
      const data: Record<string, string> = res.data || {};
      // Fill in defaults for any missing keys
      const merged: Record<string, string> = {};
      for (const field of SETTING_FIELDS) {
        merged[field.key] = data[field.key] ?? field.defaultValue;
      }
      setValues(merged);
    } catch (err) {
      console.error(err);
      // Use defaults on error
      const defaults: Record<string, string> = {};
      for (const field of SETTING_FIELDS) {
        defaults[field.key] = field.defaultValue;
      }
      setValues(defaults);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const settings = SETTING_FIELDS.map(f => ({
        key: f.key,
        value: values[f.key] ?? f.defaultValue,
        description: f.description,
      }));
      await systemSettingsApi.setMany(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || '儲存失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard pageKey="settings-system">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">系統參數</h1>
          <p className="text-gray-500 mt-1">調整系統的全域參數設定。</p>
        </div>

        {loading ? (
          <div className="text-gray-400 py-10 text-center">載入中...</div>
        ) : (
          <div className="space-y-6">
            {/* Bank Reconciliation Settings */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-800">🏦 銀行對帳設定</h2>
              </div>
              <div className="px-6 py-5 space-y-5">
                {SETTING_FIELDS.filter(f => f.key.startsWith('bank_reconciliation')).map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">{field.description}</p>
                    <div className="flex items-center gap-3">
                      {field.type === 'number' ? (
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={values[field.key] ?? field.defaultValue}
                          onChange={e => handleChange(field.key, e.target.value)}
                          className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[field.key] ?? field.defaultValue}
                          onChange={e => handleChange(field.key, e.target.value)}
                          className="w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      )}
                      {field.unit && (
                        <span className="text-sm text-gray-500">{field.unit}</span>
                      )}
                    </div>
                    {field.type === 'number' && field.min !== undefined && field.max !== undefined && (
                      <p className="text-xs text-gray-400 mt-1">
                        允許範圍：{field.min} – {field.max} {field.unit}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '儲存中...' : '儲存設定'}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ 已儲存</span>
              )}
              {error && (
                <span className="text-sm text-red-600">{error}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
