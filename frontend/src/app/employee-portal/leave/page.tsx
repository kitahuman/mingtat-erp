
'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi } from '@/lib/employee-portal-api';
import DateInput from '@/components/DateInput';

interface LeaveForm {
  leave_type: 'sick' | 'annual';
  date_from: string;
  date_to: string;
  days: string;
  reason: string;
}

const today = new Date().toISOString().split('T')[0];

const defaultForm: LeaveForm = {
  leave_type: 'sick',
  date_from: today,
  date_to: today,
  days: '1',
  reason: '',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function LeavePage() {
  const { t, lang } = useI18n();
  const [form, setForm] = useState<LeaveForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [leaveRecords, setLeaveRecords] = useState<any[]>([]);
  const [tab, setTab] = useState<'form' | 'history'>('form');

  useEffect(() => {
    loadLeaveRecords();
  }, []);

  const loadLeaveRecords = async () => {
    try {
      const res = await employeePortalApi.getLeaveRecords({ limit: 20 });
      setLeaveRecords(res.data?.data || []);
    } catch {}
  };

  const set = <K extends keyof LeaveForm>(field: K, value: LeaveForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Auto-calculate days when dates change
  const handleDateChange = (field: 'date_from' | 'date_to', value: string) => {
    const newForm = { ...form, [field]: value };
    const from = new Date(field === 'date_from' ? value : form.date_from);
    const to = new Date(field === 'date_to' ? value : form.date_to);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && to >= from) {
      const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      newForm.days = String(diff);
    }
    setForm(newForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await employeePortalApi.submitLeave({
        leave_type: form.leave_type,
        date_from: form.date_from,
        date_to: form.date_to,
        days: parseFloat(form.days) || 1,
        reason: form.reason || undefined,
      });
      setSuccess(t('leaveSuccess'));
      setForm({ ...defaultForm });
      await loadLeaveRecords();
    } catch (err: any) {
      setError(err.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB');

  const getStatusLabel = (status: string) => {
    if (status === 'pending') return t('pending');
    if (status === 'approved') return t('approved');
    if (status === 'rejected') return t('rejected');
    return status;
  };

  const getLeaveTypeLabel = (type: string) => {
    if (type === 'sick') return t('sickLeave');
    if (type === 'annual') return t('annualLeave');
    return type;
  };

  return (
    <div className="p-4 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('leaveTitle')}</h1>

      {/* Tab */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex mb-4">
        <button
          onClick={() => setTab('form')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'form' ? 'bg-blue-700 text-white' : 'text-gray-500'}`}
        >
          + {t('submitLeave')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'history' ? 'bg-blue-700 text-white' : 'text-gray-500'}`}
        >
          📋 {t('leaveHistory')}
        </button>
      </div>

      {tab === 'form' ? (
        <>
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium text-center">
              ✅ {success}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
              ❌ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Leave Type */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <label className={labelClass}>{t('leaveType')}</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => set('leave_type', 'sick')}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    form.leave_type === 'sick'
                      ? 'border-blue-700 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  🤒 {t('sickLeave')}
                </button>
                <button
                  type="button"
                  onClick={() => set('leave_type', 'annual')}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    form.leave_type === 'annual'
                      ? 'border-blue-700 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  🏖️ {t('annualLeave')}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
              <div>
                <label className={labelClass}>{t('leaveDateFrom')}</label>
                <DateInput value={form.date_from}
                  onChange={val => handleDateChange('date_from', val)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('leaveDateTo')}</label>
                <DateInput value={form.date_to}
                  min={form.date_from}
                  onChange={val => handleDateChange('date_to', val)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('leaveDays')}</label>
                <input
                  type="number"
                  value={form.days}
                  onChange={(e) => set('days', e.target.value)}
                  className={inputClass}
                  min="0.5"
                  step="0.5"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('leaveReason')}</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => set('reason', e.target.value)}
                  className={inputClass + ' resize-none'}
                  rows={3}
                  placeholder={t('optional')}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-700 text-white font-bold rounded-2xl text-base hover:bg-blue-800 transition-colors disabled:opacity-50 shadow-md"
            >
              {loading ? t('loading') : t('submitLeave')}
            </button>
          </form>
        </>
      ) : (
        <div className="space-y-3">
          {leaveRecords.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm">{t('noData')}</p>
            </div>
          ) : (
            leaveRecords.map((leave) => (
              <div key={leave.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-800 text-sm">
                        {getLeaveTypeLabel(leave.leave_type)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[leave.status] || 'bg-gray-100 text-gray-600'}`}>
                        {getStatusLabel(leave.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDate(leave.date_from)} – {formatDate(leave.date_to)}
                    </p>
                    {leave.reason && (
                      <p className="text-xs text-gray-400 mt-1">{leave.reason}</p>
                    )}
                  </div>
                  <div className="text-right ml-3">
                    <p className="font-bold text-gray-900 text-sm">{leave.days} {t('leaveDays')}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
