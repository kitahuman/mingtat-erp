'use client';
import { useState, useEffect, useCallback } from 'react';
import { retentionApi, contractsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';
import DateInput from '@/components/DateInput';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REASON_LABELS: Record<string, string> = {
  pc_release: 'PC 釋放 (實際完工)',
  dlp_release: 'DLP 釋放 (保修期結束)',
  other: '其他',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  approved: '已批准',
  paid: '已收款',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
};

interface Props {
  contractId: number;
}

export default function RetentionTabContent({ contractId }: Props) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [trackings, setTrackings] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [contract, setContract] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // Retention rate inline edit
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  const handleSaveRate = async () => {
    const newRate = parseFloat(rateInput);
    if (isNaN(newRate) || newRate < 0 || newRate > 100) {
      return alert('請輸入有效的比率（0-100）');
    }
    setSavingRate(true);
    try {
      await contractsApi.update(contractId, { retention_rate: newRate / 100 });
      setEditingRate(false);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSavingRate(false);
    }
  };

  // Release modal
  const [showRelease, setShowRelease] = useState(false);
  const [releaseForm, setReleaseForm] = useState({
    release_date: new Date().toISOString().slice(0, 10),
    amount: '',
    reason: 'pc_release',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await retentionApi.getSummary(contractId);
      const d = res.data;
      setContract(d.contract);
      setSummary(d.summary);
      setTrackings(d.trackings || []);
      setReleases(d.releases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await retentionApi.sync(contractId);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '同步失敗');
    } finally {
      setSyncing(false);
    }
  };

  const handleRelease = async () => {
    if (!releaseForm.amount || Number(releaseForm.amount) <= 0) {
      return alert('請輸入有效的釋放金額');
    }
    setSubmitting(true);
    try {
      await retentionApi.createRelease(contractId, {
        ...releaseForm,
        amount: parseFloat(releaseForm.amount),
      });
      setShowRelease(false);
      setReleaseForm({
        release_date: new Date().toISOString().slice(0, 10),
        amount: '',
        reason: 'pc_release',
        description: '',
      });
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '釋放失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRelease = async (releaseId: number) => {
    if (!confirm('確定刪除此釋放記錄？相關的收款記錄也會一併刪除。')) return;
    try {
      await retentionApi.deleteRelease(contractId, releaseId);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">累計扣留金</p>
          <p className="text-lg font-bold font-mono text-gray-900">
            {fmt$(summary?.total_retained)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">已釋放金額</p>
          <p className="text-lg font-bold font-mono text-green-600">
            {fmt$(summary?.total_released)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">待處理釋放</p>
          <p className="text-lg font-bold font-mono text-yellow-600">
            {fmt$(summary?.pending_release)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">未釋放餘額</p>
          <p className="text-lg font-bold font-mono text-red-600">
            {fmt$(summary?.unreleased_balance)}
          </p>
        </div>
      </div>

      {/* Retention settings info */}
      {contract && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            扣留金比率：
            {editingRate ? (
              <span className="inline-flex items-center gap-1 ml-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={rateInput}
                  onChange={e => setRateInput(e.target.value)}
                  className="w-20 px-2 py-0.5 border border-blue-400 rounded text-sm text-gray-800 font-mono"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveRate(); if (e.key === 'Escape') setEditingRate(false); }}
                />
                <span className="text-blue-700">%</span>
                <button
                  onClick={handleSaveRate}
                  disabled={savingRate}
                  className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingRate ? '儲存中...' : '儲存'}
                </button>
                <button
                  onClick={() => setEditingRate(false)}
                  className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                >
                  取消
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 ml-1">
                <strong>{(Number(contract.retention_rate) * 100).toFixed(1)}%</strong>
                <button
                  onClick={() => { setRateInput((Number(contract.retention_rate) * 100).toFixed(1)); setEditingRate(true); }}
                  className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200"
                  title="編輯保留金比率"
                >
                  編輯
                </button>
              </span>
            )}
          </span>
          <span>
            上限比率：<strong>{(Number(contract.retention_cap_rate) * 100).toFixed(1)}%</strong>
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSync} disabled={syncing} className="btn-secondary text-sm disabled:opacity-50">
          {syncing ? '同步中...' : '從 IPA 同步扣留金'}
        </button>
        <button
          onClick={() => setShowRelease(true)}
          disabled={!summary || summary.unreleased_balance <= 0}
          className="btn-primary text-sm disabled:opacity-50"
        >
          申請釋放扣留金
        </button>
      </div>

      {/* Tracking Table */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">每期扣留金明細</h3>
        {trackings.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">暫無扣留金記錄。請先提交 IPA 並同步。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">期數</th>
                  <th className="px-3 py-2 text-left">IPA 參考</th>
                  <th className="px-3 py-2 text-left">期間至</th>
                  <th className="px-3 py-2 text-right">本期扣留金</th>
                  <th className="px-3 py-2 text-right">累計扣留金</th>
                  <th className="px-3 py-2 text-center">IPA 狀態</th>
                </tr>
              </thead>
              <tbody>
                {trackings.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">#{t.pa_no}</td>
                    <td className="px-3 py-2 text-xs">
                      {t.payment_application?.reference || '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {fmtDate(t.payment_application?.period_to)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt$(t.retention_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {fmt$(t.cumulative_retention)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.payment_application?.status === 'paid' ? 'bg-purple-100 text-purple-700' :
                        t.payment_application?.status === 'certified' ? 'bg-green-100 text-green-700' :
                        t.payment_application?.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {t.payment_application?.status === 'paid' ? '已收款' :
                         t.payment_application?.status === 'certified' ? '已認證' :
                         t.payment_application?.status === 'submitted' ? '已提交' :
                         t.payment_application?.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={3} className="px-3 py-2 text-right">合計：</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmt$(trackings.reduce((s: number, t: any) => s + Number(t.retention_amount || 0), 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {trackings.length > 0 ? fmt$(trackings[trackings.length - 1].cumulative_retention) : fmt$(0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Releases Table */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">釋放記錄</h3>
        {releases.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">暫無釋放記錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">釋放日期</th>
                  <th className="px-3 py-2 text-right">釋放金額</th>
                  <th className="px-3 py-2 text-left">原因</th>
                  <th className="px-3 py-2 text-left">說明</th>
                  <th className="px-3 py-2 text-center">狀態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{fmtDate(r.release_date)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-green-600">
                      {fmt$(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {REASON_LABELS[r.reason] || r.reason}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {r.description || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDeleteRelease(r.id)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td className="px-3 py-2 text-right">合計：</td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">
                    {fmt$(releases.reduce((s: number, r: any) => s + Number(r.amount || 0), 0))}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Release Modal */}
      <Modal isOpen={showRelease} onClose={() => setShowRelease(false)} title="申請釋放扣留金" size="md">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            目前未釋放餘額：<strong className="font-mono">{fmt$(summary?.unreleased_balance)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">釋放日期 *</label>
              <DateInput value={releaseForm.release_date}
                onChange={val => setReleaseForm({ ...releaseForm, release_date: val || '' })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">釋放金額 *</label>
              <input
                type="number"
                step="0.01"
                value={releaseForm.amount}
                onChange={e => setReleaseForm({ ...releaseForm, amount: e.target.value })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">釋放原因 *</label>
            <select
              value={releaseForm.reason}
              onChange={e => setReleaseForm({ ...releaseForm, reason: e.target.value })}
              className="input-field"
            >
              <option value="pc_release">PC 釋放 (實際完工 - 釋放 50%)</option>
              <option value="dlp_release">DLP 釋放 (保修期結束 - 釋放 50%)</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <textarea
              value={releaseForm.description}
              onChange={e => setReleaseForm({ ...releaseForm, description: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="選填"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowRelease(false)} className="btn-secondary">取消</button>
            <button onClick={handleRelease} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? '處理中...' : '確認釋放'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
