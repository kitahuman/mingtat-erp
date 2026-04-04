'use client';
import { useState, useEffect } from 'react';
import { subconPayrollApi, partnersApi, companiesApi, subconRateCardsApi } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate } from '@/lib/dateUtils';

type Option = { value: any; label: string };

export default function SubconPayrollPage() {
  // ── Selection state ──
  const [subcons, setSubcons] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [selectedSubcon, setSelectedSubcon] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Result state ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'detail' | 'unmatched'>('detail');

  // ── Load reference data ──
  useEffect(() => {
    Promise.all([
      partnersApi.simple(),
      companiesApi.simple(),
    ]).then(([pt, cp]) => {
      const subconList = (pt.data || [])
        .filter((p: any) => p.partner_type === 'subcontractor')
        .map((p: any) => ({ value: p.id, label: p.name }));
      setSubcons(subconList);
      setCompanies((cp.data || []).map((c: any) => ({ value: c.id, label: c.internal_prefix ? c.internal_prefix + ' ' + c.name : c.name })));
    }).catch(console.error);
  }, []);

  const handlePreview = async () => {
    if (!selectedSubcon || !dateFrom || !dateTo) {
      setError('請選擇供應商和日期範圍');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await subconPayrollApi.preview({
        subcon_id: selectedSubcon,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompany || undefined,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || '計算失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRateCard = async (wl: any) => {
    try {
      await subconRateCardsApi.create({
        subcon_id: selectedSubcon,
        client_id: wl.client_id || null,
        company_id: wl.company_id || null,
        client_contract_no: wl.client_contract_no || '',
        service_type: wl.service_type || '',
        day_night: wl.day_night || '日',
        tonnage: wl.tonnage || '',
        machine_type: wl.machine_type || '',
        origin: wl.start_location || '',
        destination: wl.end_location || '',
        rate: 0,
        unit: '車',
        status: 'active',
      });
      alert('已新增供應商價目表項目，請到供應商價目表頁面設定費率後重新計算。');
    } catch (err: any) {
      alert('新增失敗：' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="p-6 max-w-full">
      <h1 className="text-2xl font-bold mb-6">供應商計糧</h1>

      {/* ── Selection Panel ── */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">供應商（判頭/街車）</label>
            <SearchableSelect
              options={subcons}
              value={selectedSubcon}
              onChange={(v) => setSelectedSubcon(v as number)}
              placeholder="選擇供應商..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">公司（可選）</label>
            <SearchableSelect
              options={companies}
              value={selectedCompany}
              onChange={(v) => setSelectedCompany(v as number | null)}
              placeholder="全部公司"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期範圍</label>
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm flex-1" />
              <span className="self-center text-gray-400">至</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm flex-1" />
            </div>
          </div>
          <div>
            <button onClick={handlePreview} disabled={loading}
              className="w-full bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 disabled:opacity-50 text-sm font-medium">
              {loading ? '計算中...' : '計算'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">供應商</p>
              <p className="text-lg font-bold">{result.subcon?.name}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">車隊車輛</p>
              <p className="text-lg font-bold">{result.drivers?.length || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">工作記錄</p>
              <p className="text-lg font-bold">{result.summary?.total || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">已匹配 / 未匹配</p>
              <p className="text-lg font-bold">
                <span className="text-green-600">{result.summary?.matched || 0}</span>
                {' / '}
                <span className="text-red-500">{result.summary?.unmatched || 0}</span>
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">總金額</p>
              <p className="text-lg font-bold text-primary-600">
                ${(result.summary?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b flex">
              <button
                onClick={() => setActiveTab('detail')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'detail' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                逐筆明細 ({result.work_logs?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('unmatched')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'unmatched' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                未匹配摘要 ({result.unmatched_summary?.length || 0})
              </button>
            </div>

            {/* Detail Tab */}
            {activeTab === 'detail' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">車牌</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">司機</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">合約</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">服務</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">噸數</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">機種</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">日/夜</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">費率</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">基本</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">OT</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">中直</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">合計</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(result.work_logs || []).map((wl: any, i: number) => (
                      <tr key={wl.id} className={wl._price_match_status === 'unmatched' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(wl.scheduled_date)}</td>
                        <td className="px-3 py-2 font-medium">{wl.equipment_number || '-'}</td>
                        <td className="px-3 py-2">{wl._driver?.name_zh || wl.employee?.name_zh || '-'}</td>
                        <td className="px-3 py-2">{wl.client?.name || '-'}</td>
                        <td className="px-3 py-2">{wl.client_contract_no || '-'}</td>
                        <td className="px-3 py-2">{wl.service_type || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {[wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '-'}
                        </td>
                        <td className="px-3 py-2">{wl.tonnage || '-'}</td>
                        <td className="px-3 py-2">{wl.machine_type || '-'}</td>
                        <td className="px-3 py-2">{wl.day_night || '-'}</td>
                        <td className="px-3 py-2 text-right">{wl.quantity ?? '-'}</td>
                        <td className="px-3 py-2 text-right">
                          {wl._matched_rate != null ? `$${Number(wl._matched_rate).toFixed(0)}/${wl._matched_unit || '車'}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">{wl._line_amount ? `$${Number(wl._line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{wl._ot_line_amount ? `$${Number(wl._ot_line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{wl._mid_shift_line_amount ? `$${Number(wl._mid_shift_line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {wl._total_amount ? `$${Number(wl._total_amount).toFixed(0)}` : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {wl._price_match_status === 'matched' ? (
                            <span className="text-green-600 text-xs">✓ 已匹配</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-red-500 text-xs">✗ 未匹配</span>
                              <button
                                onClick={() => handleAddRateCard(wl)}
                                className="text-xs text-blue-600 hover:underline ml-1"
                                title="新增供應商價目表項目"
                              >
                                +新增
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(result.work_logs || []).length === 0 && (
                      <tr>
                        <td colSpan={18} className="px-3 py-8 text-center text-gray-400">
                          沒有找到工作記錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {(result.work_logs || []).length > 0 && (
                    <tfoot className="bg-gray-50 font-medium">
                      <tr>
                        <td colSpan={13} className="px-3 py-2 text-right">合計：</td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._ot_line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._mid_shift_line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-primary-600">
                          ${(result.summary?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Unmatched Summary Tab */}
            {activeTab === 'unmatched' && (
              <div className="p-6">
                {(result.unmatched_summary || []).length === 0 ? (
                  <p className="text-center text-gray-400 py-4">全部已匹配，沒有未匹配項目</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 mb-4">
                      以下是未匹配的原因摘要。您可以到「供應商價目表」新增對應的費率項目後重新計算。
                    </p>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">未匹配原因</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">筆數</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(result.unmatched_summary || []).map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-red-600">{item.reason}</td>
                            <td className="px-4 py-2 text-right font-medium">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
