'use client';

import { useState, useEffect, useCallback } from 'react';
import { dailyReportStatsApi } from '@/lib/api';
import ExportButton from '@/components/ExportButton';
import DateInput from '@/components/DateInput';

const categoryLabels: Record<string, string> = {
  worker: '工人',
  vehicle: '車輛',
  machinery: '機械',
  tool: '工具',
};

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '-';
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

interface ProjectCostAnalysisProps {
  projectId: number;
  projectNo?: string;
}

export default function ProjectCostAnalysis({ projectId, projectNo }: ProjectCostAnalysisProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary', 'resources']));

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await dailyReportStatsApi.getProjectCost(projectId, params);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load project cost:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Export columns for resource cost data
  const exportColumns = [
    { key: 'category', label: '類別', exportRender: (v: any) => categoryLabels[v] || v },
    { key: 'worker_type', label: '工種' },
    { key: 'content', label: '內容' },
    { key: 'total_quantity', label: '總數量' },
    { key: 'total_shift_quantity', label: '總中直' },
    { key: 'total_ot_hours', label: '總 OT 時數' },
    { key: 'report_count', label: '出現次數' },
    { key: 'matched_rate_card_name', label: '匹配費率卡' },
    { key: 'day_rate', label: '日間費率' },
    { key: 'ot_rate', label: 'OT 費率' },
    { key: 'mid_shift_rate', label: '中直費率' },
    { key: 'estimated_day_cost', label: '日間成本' },
    { key: 'estimated_ot_cost', label: 'OT 成本' },
    { key: 'estimated_shift_cost', label: '中直成本' },
    { key: 'estimated_total_cost', label: '總成本' },
  ];

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
        載入成本分析中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-gray-400">
        無法載入成本分析數據
      </div>
    );
  }

  const { summary, category_totals, resources, rate_cards, budget_items, daily_breakdown } = data;
  const hasRateCards = rate_cards && rate_cards.length > 0;
  const hasBudget = budget_items && budget_items.length > 0;

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">開始日期</label>
          <DateInput value={dateFrom}
            onChange={val => setDateFrom(val || '')}
            className="px-3 py-1.5 border rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">結束日期</label>
          <DateInput value={dateTo}
            onChange={val => setDateTo(val || '')}
            className="px-3 py-1.5 border rounded-lg text-sm"
          />
        </div>
        <div className="self-end">
          <ExportButton
            columns={exportColumns}
            data={resources || []}
            filename={`工程成本_${projectNo || projectId}_${dateFrom || 'all'}_${dateTo || 'all'}`}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-blue-600 mb-1">日報數</div>
          <div className="text-xl font-bold text-blue-800">{summary.total_reports}</div>
          {summary.date_range && (
            <div className="text-xs text-blue-500 mt-1">
              {fmtDate(summary.date_range.from)} ~ {fmtDate(summary.date_range.to)}
            </div>
          )}
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-xs text-orange-600 mb-1">估算總成本</div>
          <div className="text-xl font-bold text-orange-800">{fmtMoney(summary.total_estimated_cost)}</div>
          <div className="text-xs text-orange-500 mt-1">
            日間 {fmtMoney(summary.total_day_cost)} · OT {fmtMoney(summary.total_ot_cost)} · 中直 {fmtMoney(summary.total_shift_cost)}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-xs text-green-600 mb-1">報價預算</div>
          <div className="text-xl font-bold text-green-800">{fmtMoney(summary.total_budget)}</div>
          <div className="text-xs text-green-500 mt-1">
            {hasBudget ? `${budget_items.length} 項報價明細` : '暫無報價'}
          </div>
        </div>
        <div className={`rounded-lg p-4 ${summary.variance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <div className={`text-xs mb-1 ${summary.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            預算差異
          </div>
          <div className={`text-xl font-bold ${summary.variance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
            {summary.variance >= 0 ? '+' : ''}{fmtMoney(summary.variance)}
          </div>
          <div className={`text-xs mt-1 ${summary.variance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {summary.variance_rate >= 0 ? '+' : ''}{summary.variance_rate}%
            {summary.variance >= 0 ? ' 低於預算' : ' 超出預算'}
          </div>
        </div>
      </div>

      {/* Category Totals */}
      {category_totals && category_totals.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
            onClick={() => toggleSection('categories')}
          >
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-600 rounded-full inline-block"></span>
              分類彙總
            </h3>
            <span className={`text-xs transition-transform ${expandedSections.has('categories') ? 'rotate-90' : ''}`}>▶</span>
          </div>
          {expandedSections.has('categories') && (
            <div className="p-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">類別</th>
                    <th className="px-3 py-2 text-right">項目數</th>
                    <th className="px-3 py-2 text-right">總數量</th>
                    <th className="px-3 py-2 text-right">總中直</th>
                    <th className="px-3 py-2 text-right">總 OT 時數</th>
                    <th className="px-3 py-2 text-right">估算成本</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {category_totals.map((ct: any) => (
                    <tr key={ct.category} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          ct.category === 'worker' ? 'bg-blue-100 text-blue-700' :
                          ct.category === 'vehicle' ? 'bg-orange-100 text-orange-700' :
                          ct.category === 'machinery' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {categoryLabels[ct.category] || ct.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{ct.item_count}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtNum(ct.total_quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(ct.total_shift_quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(ct.total_ot_hours)}</td>
                      <td className="px-3 py-2 text-right font-medium text-orange-700">{fmtMoney(ct.estimated_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td className="px-3 py-2">合計</td>
                    <td className="px-3 py-2 text-right">{resources?.length || 0}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(category_totals.reduce((s: number, c: any) => s + c.total_quantity, 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(category_totals.reduce((s: number, c: any) => s + c.total_shift_quantity, 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(category_totals.reduce((s: number, c: any) => s + c.total_ot_hours, 0))}</td>
                    <td className="px-3 py-2 text-right text-orange-700">{fmtMoney(summary.total_estimated_cost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resource Details */}
      {resources && resources.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
            onClick={() => toggleSection('resources')}
          >
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-orange-600 rounded-full inline-block"></span>
              資源成本明細（{resources.length} 項）
            </h3>
            <span className={`text-xs transition-transform ${expandedSections.has('resources') ? 'rotate-90' : ''}`}>▶</span>
          </div>
          {expandedSections.has('resources') && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">類別</th>
                    <th className="px-3 py-2 text-left">工種</th>
                    <th className="px-3 py-2 text-left">內容</th>
                    <th className="px-3 py-2 text-right">總數量</th>
                    <th className="px-3 py-2 text-right">總中直</th>
                    <th className="px-3 py-2 text-right">總 OT</th>
                    <th className="px-3 py-2 text-right">次數</th>
                    <th className="px-3 py-2 text-left">費率卡</th>
                    <th className="px-3 py-2 text-right">日間費率</th>
                    <th className="px-3 py-2 text-right">日間成本</th>
                    <th className="px-3 py-2 text-right">OT 成本</th>
                    <th className="px-3 py-2 text-right">中直成本</th>
                    <th className="px-3 py-2 text-right font-medium">總成本</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resources.map((res: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                          res.category === 'worker' ? 'bg-blue-100 text-blue-700' :
                          res.category === 'vehicle' ? 'bg-orange-100 text-orange-700' :
                          res.category === 'machinery' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {categoryLabels[res.category] || res.category}
                        </span>
                      </td>
                      <td className="px-3 py-2">{res.worker_type || '-'}</td>
                      <td className="px-3 py-2">{res.content}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtNum(res.total_quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(res.total_shift_quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(res.total_ot_hours)}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{res.report_count}</td>
                      <td className="px-3 py-2">
                        {res.matched_rate_card_name ? (
                          <span className="text-green-600">{res.matched_rate_card_name}</span>
                        ) : (
                          <span className="text-gray-300">未匹配</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMoney(res.day_rate)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(res.estimated_day_cost)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(res.estimated_ot_cost)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(res.estimated_shift_cost)}</td>
                      <td className="px-3 py-2 text-right font-medium text-orange-700">{fmtMoney(res.estimated_total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium text-xs">
                  <tr>
                    <td colSpan={9} className="px-3 py-2 text-right">合計</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(summary.total_day_cost)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(summary.total_ot_cost)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(summary.total_shift_cost)}</td>
                    <td className="px-3 py-2 text-right text-orange-700">{fmtMoney(summary.total_estimated_cost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rate Cards Reference */}
      {hasRateCards && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
            onClick={() => toggleSection('rate_cards')}
          >
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-green-600 rounded-full inline-block"></span>
              工程費率卡（{rate_cards.length} 項）
            </h3>
            <span className={`text-xs transition-transform ${expandedSections.has('rate_cards') ? 'rotate-90' : ''}`}>▶</span>
          </div>
          {expandedSections.has('rate_cards') && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">名稱</th>
                    <th className="px-3 py-2 text-left">服務類型</th>
                    <th className="px-3 py-2 text-right">日間費率</th>
                    <th className="px-3 py-2 text-right">夜間費率</th>
                    <th className="px-3 py-2 text-right">OT 費率</th>
                    <th className="px-3 py-2 text-right">中直費率</th>
                    <th className="px-3 py-2 text-left">單位</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rate_cards.map((rc: any) => (
                    <tr key={rc.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{rc.name || '-'}</td>
                      <td className="px-3 py-2">{rc.service_type || '-'}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(rc.day_rate)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(rc.night_rate)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(rc.ot_rate)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(rc.mid_shift_rate)}</td>
                      <td className="px-3 py-2">{rc.unit || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Budget Comparison */}
      {hasBudget && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
            onClick={() => toggleSection('budget')}
          >
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-emerald-600 rounded-full inline-block"></span>
              報價預算明細（{budget_items.length} 項）
            </h3>
            <span className={`text-xs transition-transform ${expandedSections.has('budget') ? 'rotate-90' : ''}`}>▶</span>
          </div>
          {expandedSections.has('budget') && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">報價單號</th>
                    <th className="px-3 py-2 text-left">項目</th>
                    <th className="px-3 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {budget_items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-blue-600">{item.quotation_no}</td>
                      <td className="px-3 py-2">{item.item_name}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td colSpan={2} className="px-3 py-2">預算合計</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmtMoney(summary.total_budget)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Daily Breakdown */}
      {daily_breakdown && daily_breakdown.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
            onClick={() => toggleSection('daily')}
          >
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-indigo-600 rounded-full inline-block"></span>
              每日資源投入（{daily_breakdown.length} 天）
            </h3>
            <span className={`text-xs transition-transform ${expandedSections.has('daily') ? 'rotate-90' : ''}`}>▶</span>
          </div>
          {expandedSections.has('daily') && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">更次</th>
                    <th className="px-3 py-2 text-right">工人</th>
                    <th className="px-3 py-2 text-right">車輛</th>
                    <th className="px-3 py-2 text-right">機械</th>
                    <th className="px-3 py-2 text-right">OT 時數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {daily_breakdown.map((day: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{fmtDate(day.date)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          day.shift_type === 'day' ? 'bg-yellow-100 text-yellow-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {day.shift_type === 'day' ? '日更' : '夜更'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtNum(day.worker_count)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(day.vehicle_count)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(day.machinery_count)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(day.total_ot_hours)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td colSpan={2} className="px-3 py-2">合計 / 平均</td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(daily_breakdown.reduce((s: number, d: any) => s + d.worker_count, 0))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(daily_breakdown.reduce((s: number, d: any) => s + d.vehicle_count, 0))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(daily_breakdown.reduce((s: number, d: any) => s + d.machinery_count, 0))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(daily_breakdown.reduce((s: number, d: any) => s + d.total_ot_hours, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* No data state */}
      {summary.total_reports === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-400">
          此工程暫無已提交的日報數據
        </div>
      )}

      {/* Info note */}
      {!hasRateCards && summary.total_reports > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
          此工程尚未設定費率卡，成本估算無法自動計算。請先在「工程價目記錄」中新增費率卡。
        </div>
      )}
    </div>
  );
}
