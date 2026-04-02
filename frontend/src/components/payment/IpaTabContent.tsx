'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { paymentApplicationsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const IPA_STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', certified: '已認證', paid: '已收款', void: '已作廢',
};
const IPA_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  certified: 'bg-green-100 text-green-700',
  paid: 'bg-purple-100 text-purple-700',
  void: 'bg-red-100 text-red-700',
};

interface Props {
  contractId: number;
}

export default function IpaTabContent({ contractId }: Props) {
  const [ipas, setIpas] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [creating, setCreating] = useState(false);
  const [retentionModal, setRetentionModal] = useState(false);
  const [retentionRate, setRetentionRate] = useState('10');
  const [retentionCapRate, setRetentionCapRate] = useState('5');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentApplicationsApi.list(contractId);
      setIpas(res.data?.data || []);
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!periodTo) return;
    setCreating(true);
    try {
      await paymentApplicationsApi.create(contractId, {
        period_from: periodFrom || null,
        period_to: periodTo,
      });
      setShowCreateModal(false);
      setPeriodTo('');
      setPeriodFrom('');
      fetchData();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveRetention = async () => {
    try {
      await paymentApplicationsApi.updateRetention(contractId, {
        retention_rate: parseFloat(retentionRate) / 100,
        retention_cap_rate: parseFloat(retentionCapRate) / 100,
      });
      setRetentionModal(false);
      fetchData();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '儲存失敗');
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-gray-500">載入中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card border-l-4 border-l-blue-500 text-center">
            <p className="text-xs text-gray-500">修訂合約總額</p>
            <p className="text-lg font-bold text-gray-900 font-mono">{fmt$(summary.revised_contract_sum)}</p>
          </div>
          <div className="card border-l-4 border-l-green-500 text-center">
            <p className="text-xs text-gray-500">累計已認證</p>
            <p className="text-lg font-bold text-green-600 font-mono">{fmt$(summary.cumulative_certified)}</p>
          </div>
          <div className="card border-l-4 border-l-purple-500 text-center">
            <p className="text-xs text-gray-500">累計已收款</p>
            <p className="text-lg font-bold text-purple-600 font-mono">{fmt$(summary.cumulative_paid)}</p>
          </div>
          <div className="card border-l-4 border-l-orange-500 text-center">
            <p className="text-xs text-gray-500">合約完成 %</p>
            <p className="text-lg font-bold text-orange-600 font-mono">{summary.completion_percentage}%</p>
          </div>
          <div className="card border-l-4 border-l-red-500 text-center">
            <p className="text-xs text-gray-500">累計保留金</p>
            <p className="text-lg font-bold text-red-600 font-mono">{fmt$(summary.cumulative_retention)}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">期中付款申請 (IPA) 列表</h3>
        <div className="flex gap-2">
          <button onClick={() => setRetentionModal(true)} className="btn-secondary text-sm">
            保留金設定
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
            新增下一期
          </button>
        </div>
      </div>

      {/* IPA Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">期數</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">編號</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">截止日期</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">累計完工金額</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">保留金</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">認證金額</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">當期應付</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {ipas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">尚無 IPA 記錄</td>
              </tr>
            ) : (
              ipas.map((ipa: any) => (
                <tr key={ipa.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">第 {ipa.pa_no} 期</td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/contracts/${contractId}/pa/${ipa.id}`}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {ipa.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(ipa.period_to)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">{fmt$(ipa.cumulative_work_done)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">{fmt$(ipa.retention_amount)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">{fmt$(ipa.certified_amount)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 font-mono">{fmt$(ipa.current_due)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${IPA_STATUS_COLORS[ipa.status] || 'bg-gray-100 text-gray-700'}`}>
                      {IPA_STATUS_LABELS[ipa.status] || ipa.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="新增 IPA" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">計糧期間（起）</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">計糧截止日期 <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreateModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleCreate} disabled={creating || !periodTo} className="btn-primary disabled:opacity-50">
              {creating ? '建立中...' : '建立'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Retention Settings Modal */}
      <Modal isOpen={retentionModal} onClose={() => setRetentionModal(false)} title="保留金設定" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">保留金比率 (%)</label>
            <input
              type="number"
              step="0.1"
              value={retentionRate}
              onChange={(e) => setRetentionRate(e.target.value)}
              className="input-field"
              placeholder="例如：10"
            />
            <p className="text-xs text-gray-500 mt-1">每期從總完工金額中扣除的比率</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">保留金上限比率 (%)</label>
            <input
              type="number"
              step="0.1"
              value={retentionCapRate}
              onChange={(e) => setRetentionCapRate(e.target.value)}
              className="input-field"
              placeholder="例如：5"
            />
            <p className="text-xs text-gray-500 mt-1">保留金不超過修訂合約總額的此比率</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRetentionModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleSaveRetention} className="btn-primary">儲存</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
